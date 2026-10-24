// draft_rule tasks: read the controller's answer, draft a scoped rule, backtest it from the client cache,
// and hand it to create_rule as a candidate. The worker never approves; the reducer refuses it anyway.
// The answer key (seed/fixtures/answer_key.json) is never read here. Only public tables are used.
import { z } from 'zod';
import { nowIso } from './config.js';
import { type Brief } from './brief.js';
import { FindingSchema, type EvidenceRef, type Finding } from './finding.js';
import type { Step } from './replay.js';

export const FORBIDDEN_RULE_CONDITIONS = ['capacity_exceeded', 'vendor_bank_change', 'duplicate_toll'] as const;
export const ONE_TIME_DAYS = 5;
export const STANDING_DAYS = 30;
export const RULE_MODEL = 'claude-haiku-4-5';

export const ScopeSchema = z
  .object({
    driverId: z.number().int().optional(),
    truckIds: z.array(z.number().int()).min(1).optional(),
    cardId: z.string().min(1).optional(),
    vendorId: z.number().int().optional(),
  })
  .strict()
  .refine(s => s.driverId !== undefined || s.truckIds !== undefined || s.cardId !== undefined || s.vendorId !== undefined, 'scope needs at least one key');
export type Scope = z.infer<typeof ScopeSchema>;

export const BacktestSchema = z.object({
  n: z.number().int(),
  wouldClear: z.number().int(),
  openHoldsCovered: z.number().int(),
  confirmedExceptionsCovered: z.number().int(),
  trueExceptionsCleared: z.number().int(),
  window: z.object({ fromDay: z.number().int(), toDay: z.number().int() }),
  computedAt: z.string(),
});
export type Backtest = z.infer<typeof BacktestSchema>;

export interface RuleDraft {
  condition: string;
  scope: Scope;
  uses: 'one_time' | 'standing';
  validFromDay: number;
  validToDay: number;
  reason: string;
}

const NEGATIVE = /\b(no|not ours|fraud|reject|did not|didn't|never)\b/i;
const STANDING = /\b(always|standing|every)\b/i;

export function isNegativeAnswer(answer: string): boolean {
  return NEGATIVE.test(answer);
}

export function isStandingAnswer(answer: string): boolean {
  return STANDING.test(answer);
}

export type DraftDecision =
  | { kind: 'negative' }
  | { kind: 'forbidden' }
  | { kind: 'no_rule'; why: string }
  | { kind: 'no_scope'; why: string }
  | { kind: 'draft'; rule: RuleDraft };

// Deterministic draft from the brief alone. The model, when used, may only tighten what this produces.
export function decideDraft(brief: Brief): DraftDecision {
  const answer = brief.answer ?? '';
  if (isNegativeAnswer(answer)) return { kind: 'negative' };
  if ((FORBIDDEN_RULE_CONDITIONS as readonly string[]).includes(brief.code)) return { kind: 'forbidden' };
  if (brief.code === 'duplicate_invoice' || brief.code === 'short_received') {
    return { kind: 'no_rule', why: `${brief.code} is settled per invoice; no standing rule is drafted` };
  }
  let scope: Scope | undefined;
  if (brief.code === 'location_mismatch' && typeof brief.evidence.driverId === 'number') scope = { driverId: brief.evidence.driverId };
  if (brief.code === 'rate_variance' && typeof brief.evidence.vendorId === 'number') scope = { vendorId: brief.evidence.vendorId };
  if (!scope) return { kind: 'no_scope', why: `no driver or vendor in the evidence to scope a ${brief.code} rule to` };
  const standing = isStandingAnswer(answer);
  const rule: RuleDraft = {
    condition: brief.code,
    scope,
    uses: standing ? 'standing' : 'one_time',
    validFromDay: brief.day,
    validToDay: brief.day + (standing ? STANDING_DAYS : ONE_TIME_DAYS),
    reason: `Controller answered "${answer.trim().slice(0, 160)}" to "${(brief.question ?? '').trim().slice(0, 120)}"`,
  };
  return { kind: 'draft', rule };
}

// Optional model extraction of the window and uses. Validated with zod; anything odd falls back to the draft.
const ModelWindowSchema = z
  .object({
    uses: z.enum(['one_time', 'standing']),
    toDay: z.number().int(),
  })
  .strict();

export async function refineWithModel(rule: RuleDraft, brief: Brief, ask: (prompt: string) => Promise<string>, log: (m: string) => void): Promise<RuleDraft> {
  try {
    const prompt = `A controller answered a question about a ${brief.code} hold on business day ${brief.day}.\nQuestion: ${brief.question ?? ''}\nAnswer: ${brief.answer ?? ''}\nReturn JSON only: {"uses": "one_time" | "standing", "toDay": <integer business day the exception should stop being cleared>}. one_time means this one occurrence (toDay = ${brief.day + ONE_TIME_DAYS}); standing means it recurs (toDay between ${brief.day + 1} and ${brief.day + 92}).`;
    const text = await ask(prompt);
    const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
    const m = ModelWindowSchema.parse(JSON.parse(json));
    if (m.toDay < brief.day || m.toDay - brief.day > 92) throw new Error(`toDay ${m.toDay} outside the allowed window`);
    if (m.uses === 'one_time' && m.toDay - brief.day > ONE_TIME_DAYS) throw new Error('one_time window longer than five days');
    return { ...rule, uses: m.uses, validToDay: m.toDay };
  } catch (err) {
    log(`rule window from model rejected, keeping deterministic draft: ${(err as Error).message}`);
    return rule;
  }
}

export async function askRuleModel(apiKey: string, prompt: string): Promise<string> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey });
  const res = await client.messages.create(
    { model: RULE_MODEL, max_tokens: 200, system: 'Answer with one JSON object and nothing else.', messages: [{ role: 'user', content: prompt }] },
    { timeout: 15_000 },
  );
  return res.content
    .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
    .map(b => b.text)
    .join('');
}

// ---------------------------------------------------------------------------
// backtest over the client cache (match_result + hold). Pure, so it is unit tested on in-memory rows.
// ---------------------------------------------------------------------------
export interface BacktestRow {
  txnRef: string;
  code: string;
  day: number;
  evidence: Record<string, unknown>;
}

export const OPEN_HOLD_STATUSES: ReadonlySet<string> = new Set(['open', 'awaiting_controller', 'answered']);

export function scopeMatches(scope: Scope, evidence: Record<string, unknown>): boolean {
  if (scope.driverId !== undefined && evidence.driverId !== scope.driverId) return false;
  if (scope.vendorId !== undefined && evidence.vendorId !== scope.vendorId) return false;
  if (scope.cardId !== undefined && evidence.cardId !== scope.cardId) return false;
  if (scope.truckIds !== undefined && !scope.truckIds.includes(evidence.truckId as number)) return false;
  return true;
}

export function backtest(rule: Pick<RuleDraft, 'condition' | 'scope' | 'validFromDay' | 'validToDay'>, rows: Iterable<BacktestRow>, holdStatus: (txnRef: string) => string | undefined): Backtest {
  let n = 0;
  let openHoldsCovered = 0;
  let confirmedExceptionsCovered = 0;
  for (const r of rows) {
    if (r.code !== rule.condition) continue;
    if (r.day < rule.validFromDay || r.day > rule.validToDay) continue;
    if (!scopeMatches(rule.scope, r.evidence)) continue;
    n += 1;
    const status = holdStatus(r.txnRef);
    if (status && OPEN_HOLD_STATUSES.has(status)) openHoldsCovered += 1;
    if (status === 'rejected') confirmedExceptionsCovered += 1;
  }
  return {
    n,
    wouldClear: n,
    openHoldsCovered,
    confirmedExceptionsCovered,
    trueExceptionsCleared: confirmedExceptionsCovered,
    window: { fromDay: rule.validFromDay, toDay: rule.validToDay },
    computedAt: nowIso(),
  };
}

// ---------------------------------------------------------------------------
// the task handler. Dependencies are injected so the logic runs without a connection in tests.
// ---------------------------------------------------------------------------
export interface RuleTaskDeps {
  matchResults: () => Iterable<BacktestRow>;
  holdStatus: (txnRef: string) => string | undefined;
  createRule: (args: { sourceTxnRef: string; scopeJson: string; condition: string; backtestJson: string; uses: string; validFromDay: number; validToDay: number; reason: string }) => Promise<void>;
  anthropicApiKey?: string;
  ask?: (prompt: string) => Promise<string>;
  log?: (msg: string) => void;
}

export interface RuleTaskResult {
  recommendation: 'hold' | 'done';
  finding: Finding & { rule?: RuleDraft; backtest?: Backtest };
  steps: Step[];
  question?: string;
  source: 'none';
}

const RuleFindingSchema = FindingSchema.extend({
  rule: z.object({ condition: z.string(), scope: ScopeSchema, uses: z.enum(['one_time', 'standing']), validFromDay: z.number().int(), validToDay: z.number().int(), reason: z.string() }).optional(),
  backtest: BacktestSchema.optional(),
});

function kernelEvidence(brief: Brief): EvidenceRef[] {
  const out: EvidenceRef[] = [{ source: 'kernel', ref: 'match_result.code', quote: `${brief.code} on ${brief.kind} ${brief.txnRef}, day ${brief.day}` }];
  if (brief.question) out.push({ source: 'kernel', ref: 'hold.question', quote: brief.question.slice(0, 400) });
  if (brief.answer) out.push({ source: 'kernel', ref: 'hold.answer', quote: brief.answer.slice(0, 400) });
  return out;
}

function summarize(answer: string | undefined): string {
  const a = (answer ?? '').replace(/\s+/g, ' ').trim();
  return a.length > 200 ? `${a.slice(0, 197)}...` : a;
}

function counts(bt: Backtest): string {
  return `n=${bt.n}, wouldClear=${bt.wouldClear}, openHoldsCovered=${bt.openHoldsCovered}, confirmedExceptionsCovered=${bt.confirmedExceptionsCovered}, trueExceptionsCleared=${bt.trueExceptionsCleared}, window days ${bt.window.fromDay} to ${bt.window.toDay}`;
}

export async function handleDraftRule(brief: Brief, deps: RuleTaskDeps): Promise<RuleTaskResult> {
  const log = deps.log ?? (() => {});
  const steps: Step[] = [];
  const note = (text: string) => steps.push({ type: 'note', at: nowIso(), text });
  const base = { evidence: kernelEvidence(brief), confidence: 1, status: 'ok' as const, model: 'rules' };
  const finish = (recommendation: 'hold' | 'done', finding: Finding & { rule?: RuleDraft; backtest?: Backtest }, question?: string): RuleTaskResult => ({
    recommendation,
    finding: RuleFindingSchema.parse(finding),
    steps,
    ...(question ? { question } : {}),
    source: 'none',
  });

  const decision = decideDraft(brief);
  note(`draft_rule for ${brief.txnRef} (${brief.code}): decision ${decision.kind}`);
  switch (decision.kind) {
    case 'negative':
      return finish('hold', { ...base, finding: 'Controller confirmed the exception; recommend reject', recommendation: 'hold' });
    case 'forbidden':
      return finish('hold', { ...base, finding: `Rules may never clear ${brief.code}. Controller answer noted: "${summarize(brief.answer)}". The payment needs a direct approve or reject.`, recommendation: 'hold' });
    case 'no_rule':
      return finish('done', { ...base, finding: `No rule drafted: ${decision.why}. Controller answer: "${summarize(brief.answer)}".`, recommendation: 'hold' });
    case 'no_scope':
      return finish('hold', { ...base, finding: `No rule drafted: ${decision.why}. Controller answer: "${summarize(brief.answer)}".`, recommendation: 'hold' });
    case 'draft':
      break;
  }

  let rule = decision.rule;
  const ask = deps.ask ?? (deps.anthropicApiKey ? (p: string) => askRuleModel(deps.anthropicApiKey!, p) : undefined);
  if (ask) {
    rule = await refineWithModel(rule, brief, ask, log);
    note(`window checked with ${RULE_MODEL}: uses ${rule.uses}, days ${rule.validFromDay} to ${rule.validToDay}`);
  }

  const bt = backtest(rule, deps.matchResults(), deps.holdStatus);
  note(`backtest from match_result and hold: ${counts(bt)}`);
  if (bt.trueExceptionsCleared > 0) {
    return finish('hold', {
      ...base,
      finding: `Rule not drafted: it would clear ${bt.trueExceptionsCleared} confirmed exception(s). Backtest ${counts(bt)}.`,
      recommendation: 'hold',
      rule,
      backtest: bt,
    });
  }

  try {
    await deps.createRule({
      sourceTxnRef: brief.txnRef,
      scopeJson: JSON.stringify(rule.scope),
      condition: rule.condition,
      backtestJson: JSON.stringify(bt),
      uses: rule.uses,
      validFromDay: rule.validFromDay,
      validToDay: rule.validToDay,
      reason: rule.reason,
    });
  } catch (err) {
    const msg = (err as Error).message;
    note(`create_rule refused: ${msg}`);
    return finish('hold', { ...base, finding: `Rule refused by the module: ${msg}. Backtest ${counts(bt)}.`, recommendation: 'hold', rule, backtest: bt });
  }
  note(`create_rule accepted as candidate: ${rule.condition} ${JSON.stringify(rule.scope)} ${rule.uses} days ${rule.validFromDay} to ${rule.validToDay}`);
  return finish('done', {
    ...base,
    finding: `Drafted rule for controller approval: clear ${rule.condition} for ${JSON.stringify(rule.scope)} (${rule.uses}, days ${rule.validFromDay} to ${rule.validToDay}). Backtest ${counts(bt)}.`,
    recommendation: 'hold',
    rule,
    backtest: bt,
  });
}
