// finding_json: the zod gate between anything a model produced and the reducer call.
// Nothing outside this schema reaches the database. There is no `pay` recommendation.
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { MCP_SOURCES } from './brief.js';

export const FINDING_MAX = 1000;
export const QUOTE_MAX = 400;
export const REF_MAX = 200;
export const QUESTION_MAX = 500;

// Sources that are not files: the two Elastic Agent Builder tools and the kernel's own evidence object.
export const NON_FILE_SOURCES: ReadonlySet<string> = new Set([...MCP_SOURCES, 'kernel']);

export const EvidenceRefSchema = z
  .object({
    source: z.string().min(1).max(REF_MAX),
    ref: z.string().max(REF_MAX),
    quote: z.string().max(QUOTE_MAX),
  })
  .strict();
export type EvidenceRef = z.infer<typeof EvidenceRefSchema>;

export const RECOMMENDATIONS = ['clear', 'hold', 'hold_and_ask'] as const;
export type Recommendation = (typeof RECOMMENDATIONS)[number];

export const FINDING_STATUSES = ['ok', 'replayed', 'timeout', 'no_fixture'] as const;

export const FindingSchema = z
  .object({
    finding: z.string().min(1).max(FINDING_MAX),
    evidence: z.array(EvidenceRefSchema).max(30),
    recommendation: z.enum(RECOMMENDATIONS),
    question_for_controller: z.string().max(QUESTION_MAX).optional(),
    confidence: z.number().min(0).max(1),
    status: z.enum(FINDING_STATUSES).default('ok'),
    model: z.string().max(80).optional(),
    durationMs: z.number().int().nonnegative().optional(),
    tokenUsage: z.object({ input: z.number().int().nonnegative(), output: z.number().int().nonnegative() }).strict().optional(),
  })
  .strict();
export type Finding = z.infer<typeof FindingSchema>;

// What Droid is asked to return. Narrower than FindingSchema: status, model and usage are filled in by the worker.
export const FINDING_SCHEMA = {
  type: 'object',
  required: ['finding', 'evidence', 'recommendation', 'confidence'],
  properties: {
    finding: { type: 'string' },
    evidence: {
      type: 'array',
      items: {
        type: 'object',
        required: ['source', 'ref', 'quote'],
        properties: { source: { type: 'string' }, ref: { type: 'string' }, quote: { type: 'string' } },
      },
    },
    recommendation: { type: 'string', enum: ['clear', 'hold', 'hold_and_ask'] },
    question_for_controller: { type: 'string' },
    confidence: { type: 'number' },
  },
} as const;

export class FindingError extends Error {
  constructor(message: string, readonly issues: string[] = []) {
    super(message);
    this.name = 'FindingError';
  }
}

export interface ParseOptions {
  // When false, file sources are not resolved against the disk here. Replay uses this when EVIDENCE_DIR is absent;
  // verifyEvidence then drops every file-sourced item (fail closed).
  requireFiles?: boolean;
}

// Resolve a source name inside evidenceDir, refusing anything that escapes it.
export function resolveEvidenceFile(source: string, evidenceDir: string): string | undefined {
  if (!source || source.includes('\0') || path.isAbsolute(source)) return undefined;
  const root = path.resolve(evidenceDir);
  const full = path.resolve(root, source);
  if (full !== root && !full.startsWith(root + path.sep)) return undefined;
  try {
    return fs.statSync(full).isFile() ? full : undefined;
  } catch {
    return undefined;
  }
}

// Validate a raw structured output. Throws FindingError with every issue; never returns a partial object.
export function parseFinding(raw: unknown, evidenceDir: string, opts: ParseOptions = {}): Finding {
  const requireFiles = opts.requireFiles ?? true;
  const parsed = FindingSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(i => `${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new FindingError(`finding rejected: ${issues.join('; ')}`, issues);
  }
  const f = parsed.data;
  const issues: string[] = [];
  f.evidence.forEach((e, i) => {
    if (NON_FILE_SOURCES.has(e.source)) return;
    if (!requireFiles) return;
    if (!resolveEvidenceFile(e.source, evidenceDir)) issues.push(`evidence[${i}].source: ${e.source} is not a file under the evidence directory`);
  });
  if (f.recommendation === 'hold_and_ask' && !(f.question_for_controller ?? '').trim()) {
    issues.push('question_for_controller: required when recommendation is hold_and_ask');
  }
  if (issues.length) throw new FindingError(`finding rejected: ${issues.join('; ')}`, issues);
  return f;
}

// ---------------------------------------------------------------------------
// Evidence verification. parseFinding checks shape; this checks every evidence item against its source and
// drops the ones that do not hold up, with a note per drop. The finding itself is kept.
// ---------------------------------------------------------------------------
export const TOOL_QUOTE_PREFIX = 12;
export const UNVERIFIED_CONFIDENCE_CAP = 0.3;

export interface VerifyContext {
  evidenceDir: string;
  // the task brief; kernel refs are resolved against brief.evidence
  brief: { evidence: Record<string, unknown> };
  // the steps of the run that produced the finding; tool quotes are checked against its tool_result entries
  steps: ReadonlyArray<{ type: string; toolName?: string; content?: string; isError?: boolean }>;
}

export interface Verified {
  finding: Finding;
  notes: string[];
}

export function normalizeWs(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

// True when `ref` is `evidence.<key>[.<key>...]` and that path exists in the brief's evidence object.
export function kernelRefExists(ref: string, evidence: Record<string, unknown>): boolean {
  const parts = ref.trim().split('.');
  if (parts[0] !== 'evidence' || parts.length < 2 || parts.some(p => p === '')) return false;
  let cur: unknown = evidence;
  for (const p of parts.slice(1)) {
    if (cur === null || typeof cur !== 'object' || !Object.prototype.hasOwnProperty.call(cur, p)) return false;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur !== undefined;
}

export function verifyEvidence(finding: Finding, ctx: VerifyContext): Verified {
  const notes: string[] = [];
  const dirPresent = fs.existsSync(ctx.evidenceDir);
  const files = new Map<string, string | undefined>();
  const readSource = (source: string): string | undefined => {
    if (!files.has(source)) {
      const full = resolveEvidenceFile(source, ctx.evidenceDir);
      let text: string | undefined;
      try {
        text = full ? normalizeWs(fs.readFileSync(full, 'utf8')) : undefined;
      } catch {
        text = undefined;
      }
      files.set(source, text);
    }
    return files.get(source);
  };
  const toolResults = ctx.steps.filter(s => s.type === 'tool_result' && !s.isError);

  const kept = finding.evidence.filter(e => {
    const quote = normalizeWs(e.quote);
    if (e.source === 'kernel') {
      if (kernelRefExists(e.ref, ctx.brief.evidence)) return true;
      notes.push(`evidence dropped: kernel ref ${e.ref || '(empty)'} is not a key in the brief evidence`);
      return false;
    }
    if ((MCP_SOURCES as readonly string[]).includes(e.source)) {
      const prefix = quote.slice(0, TOOL_QUOTE_PREFIX);
      if (prefix && toolResults.some(s => s.toolName === e.source && normalizeWs(s.content ?? '').includes(prefix))) return true;
      notes.push(`evidence dropped: no ${e.source} tool_result contains the quote`);
      return false;
    }
    // file source; fail closed when the evidence tree is absent
    if (!dirPresent) {
      notes.push(`evidence dropped: ${e.source} unverifiable, evidence directory ${ctx.evidenceDir} is absent`);
      return false;
    }
    const text = readSource(e.source);
    if (quote && text !== undefined && text.includes(quote)) return true;
    notes.push(`evidence dropped: quote not found in ${e.source}`);
    return false;
  });

  if (kept.length === finding.evidence.length) return { finding, notes };
  let confidence = finding.confidence;
  if (kept.length === 0 && finding.evidence.length > 0) {
    confidence = Math.min(confidence, UNVERIFIED_CONFIDENCE_CAP);
    notes.push(`no evidence item could be verified; confidence capped at ${UNVERIFIED_CONFIDENCE_CAP}`);
  }
  return { finding: { ...finding, evidence: kept, confidence }, notes };
}
