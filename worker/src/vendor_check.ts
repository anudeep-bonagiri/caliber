// Task 16: one `vendor_check` task. Fired on a vendor_bank_change hold and on a vendor's first invoice. Nothing in
// the carrier's own data can say whether the vendor is who it claims to be, so this asks CRS three things (business
// credit, public records, OFAC) about the business and nothing else. No consumer credit, no driver or person data
// is ever sent.
//
// Order: live CRS (CRS_USERNAME set and WORKER_MODE live or record), else replay of
// seed/fixtures/vendor_checks/<vendorId>.json, else a labelled stand-in. The agent never rejects on its own: every
// outcome leaves the hold for a controller.
import { z } from 'zod';
import { nowIso, type WorkerMode } from './config.js';
import {
  businessCredit,
  CRS_CALLS,
  crsEnvFrom,
  crsLiveEnabled,
  endpointLabel,
  loadVendorFixture,
  ofacScreen,
  publicRecords,
  summarizeRaw,
  vendorFixtureFile,
  type CrsCall,
  type CrsEnv,
  type CrsOptions,
  type CrsSummary,
} from './crs.js';
import type { Step } from './replay.js';
import type { RecordArgs } from './stdb.js';

export const VENDOR_CHECK_SOURCES = ['crs:business_credit', 'crs:public_records', 'crs:ofac'] as const;
export type VendorCheckSource = (typeof VENDOR_CHECK_SOURCES)[number];
export const VENDOR_RECOMMENDATIONS = ['approve', 'reject', 'escalate'] as const;
export type VendorRecommendation = (typeof VENDOR_RECOMMENDATIONS)[number];

export const SOURCE_OF: Record<CrsCall, VendorCheckSource> = {
  business_credit: 'crs:business_credit',
  public_records: 'crs:public_records',
  ofac: 'crs:ofac',
};

export const STAND_IN_PREFIX = 'Scripted stand-in, not a vendor check:';
export const APPROVE_QUESTION = 'Vendor check clean: approve with a call-back note?';
export const QUESTION_MAX = 500;

export const VendorEvidenceSchema = z
  .object({
    source: z.enum(VENDOR_CHECK_SOURCES),
    ref: z.string().max(200),
    quote: z.string().max(400),
  })
  .strict();

export const VendorCheckFindingSchema = z
  .object({
    finding: z.string().min(1).max(1000),
    evidence: z.array(VendorEvidenceSchema).max(3),
    recommendation: z.enum(VENDOR_RECOMMENDATIONS),
    reasons: z.array(z.string().min(1).max(200)).max(10),
    confidence: z.number().min(0).max(1),
    status: z.enum(['ok', 'replayed', 'hand_shaped', 'no_fixture']).default('ok'),
    // the fixture's own caveat sentence when the replay is a hand-shaped file, printed on the card
    fixtureNote: z.string().max(300).optional(),
    model: z.string().max(80).optional(),
    question_for_controller: z.string().max(QUESTION_MAX).optional(),
  })
  .strict();
export type VendorCheckFinding = z.infer<typeof VendorCheckFindingSchema>;

// The structured shape, for a model that may one day write the finding instead of the rules below.
export const VENDOR_CHECK_SCHEMA = {
  type: 'object',
  required: ['finding', 'evidence', 'recommendation', 'reasons', 'confidence'],
  properties: {
    finding: { type: 'string' },
    evidence: {
      type: 'array',
      items: {
        type: 'object',
        required: ['source', 'ref', 'quote'],
        properties: { source: { type: 'string', enum: [...VENDOR_CHECK_SOURCES] }, ref: { type: 'string' }, quote: { type: 'string' } },
      },
    },
    recommendation: { type: 'string', enum: [...VENDOR_RECOMMENDATIONS] },
    reasons: { type: 'array', items: { type: 'string' } },
    confidence: { type: 'number' },
  },
} as const;

// The brief, vendor fields only. Unknown keys are stripped so nothing else can reach a CRS request.
export const VendorBriefSchema = z.object({
  txnRef: z.string().min(1),
  kind: z.string(),
  code: z.literal('vendor_check'),
  trigger: z.enum(['bank_change', 'first_invoice']),
  cents: z.union([z.string(), z.number()]).transform(v => String(v)),
  day: z.number().int(),
  date: z.string().optional(),
  vendor: z.object({ id: z.number().int().nonnegative(), name: z.string(), bankChangedDay: z.number().int().default(0) }),
  questionHint: z.string().optional().default(''),
});
export type VendorBrief = z.infer<typeof VendorBriefSchema>;

export function parseVendorBrief(json: string): VendorBrief {
  return VendorBriefSchema.parse(JSON.parse(json));
}

export interface VendorCheckOutcome {
  finding: VendorCheckFinding;
  steps: Step[];
  source: 'live' | 'replayed' | 'none';
  recommendation: 'hold' | 'hold_and_ask';
  question: string;
}

// approve -> hold with the call-back question; escalate or reject -> hold_and_ask naming the reasons.
export function mapRecommendation(rec: VendorRecommendation, reasons: string[]): { recommendation: 'hold' | 'hold_and_ask'; question: string } {
  if (rec === 'approve') return { recommendation: 'hold', question: APPROVE_QUESTION };
  const why = reasons.length ? reasons.join('; ') : 'an unresolved vendor check';
  const q = `Vendor has ${why}; reject or call back?`;
  if (q.length <= QUESTION_MAX) return { recommendation: 'hold_and_ask', question: q };
  const tail = '; reject or call back?';
  return { recommendation: 'hold_and_ask', question: `${`Vendor has ${why}`.slice(0, QUESTION_MAX - tail.length - 3)}...${tail}` };
}

function article(kind: string): string {
  return /^[aeiou]/i.test(kind) ? 'an' : 'a';
}

const HIT_LABEL: Record<string, string> = {
  ofac_match: 'OFAC match',
  ofac_potential_match: 'OFAC potential match',
  lien: 'lien',
  judgment: 'judgment',
  bankruptcy: 'bankruptcy',
  no_business_match: 'no business credit file under this name',
  high_credit_risk: 'high business credit risk',
  derogatory: 'derogatory credit indicator',
};

export interface AssessMeta {
  status: VendorCheckFinding['status'];
  model: string;
  // appended to each evidence ref, e.g. "replayed from vendor_checks/3.json" or "hand-shaped fixture"
  refSuffix?: string;
  fixtureNote?: string;
}

// Rules, not a model. OFAC match -> reject (suggested only). Any other hit or a failed call -> escalate.
// Clean on all three -> approve.
export function assessVendor(brief: VendorBrief, summaries: CrsSummary[], meta: AssessMeta): VendorCheckFinding {
  const reasons: string[] = [];
  let reject = false;
  for (const s of summaries) {
    if (!s.ok) {
      reasons.push(`no ${s.call.replace('_', ' ')} result (${s.error ?? s.summary})`.slice(0, 200));
      continue;
    }
    for (const h of s.hits) {
      if (h.kind === 'ofac_match') reject = true;
      const label = HIT_LABEL[h.kind] ?? h.kind.replace(/_/g, ' ');
      const text = h.kind === 'no_business_match' || h.kind === 'high_credit_risk' ? label : `${article(label)} ${label} (${h.detail})`;
      reasons.push(text.slice(0, 200));
    }
  }
  const missing = CRS_CALLS.filter(c => !summaries.some(s => s.call === c));
  for (const c of missing) reasons.push(`no ${c.replace('_', ' ')} result`);
  const allOk = missing.length === 0 && summaries.every(s => s.ok);
  const recommendation: VendorRecommendation = reject ? 'reject' : reasons.length ? 'escalate' : 'approve';
  const confidence = !allOk ? 0.4 : recommendation === 'approve' ? 0.9 : 0.8;

  const evidence = summaries.map(s => ({
    source: SOURCE_OF[s.call],
    ref: `${s.endpoint}${meta.refSuffix ? ` (${meta.refSuffix})` : ''}`.slice(0, 200),
    quote: s.summary.slice(0, 400),
  }));
  const v = brief.vendor;
  const trig = brief.trigger === 'bank_change' ? `bank change on day ${v.bankChangedDay}` : 'first invoice';
  const line = (c: CrsCall) => summaries.find(s => s.call === c)?.summary ?? 'no result';
  const verdict =
    recommendation === 'approve'
      ? 'Clean on all three; approve only with a call-back note on a known number.'
      : recommendation === 'reject'
        ? 'OFAC match: the agent suggests reject, a controller decides.'
        : 'Needs a person: reject or call back.';
  const prefix = meta.status === 'hand_shaped' ? 'Hand-shaped fixture, not sandbox data. ' : '';
  const finding = `${prefix}Vendor ${v.id} ${v.name} (${trig}, ${brief.txnRef}). Business credit: ${line('business_credit')}. Public records: ${line('public_records')}. OFAC: ${line('ofac')}. ${verdict}`.slice(0, 1000);
  const { question } = mapRecommendation(recommendation, reasons);
  return VendorCheckFindingSchema.parse({
    finding,
    evidence,
    recommendation,
    reasons: reasons.slice(0, 10),
    confidence,
    status: meta.status,
    model: meta.model,
    question_for_controller: question,
    ...(meta.fixtureNote ? { fixtureNote: meta.fixtureNote } : {}),
  });
}

export function standInVendorFinding(brief: VendorBrief, why?: string): VendorCheckFinding {
  const reasons = ['no vendor check result on file'];
  return VendorCheckFindingSchema.parse({
    finding: `${STAND_IN_PREFIX} no sandbox result on file for vendor ${brief.vendor.id}${why ? ` (${why})` : ''}. The hold stands until a person decides.`.slice(0, 1000),
    evidence: [],
    recommendation: 'escalate',
    reasons,
    confidence: 0,
    status: 'no_fixture',
    model: 'stand-in',
    question_for_controller: mapRecommendation('escalate', reasons).question,
  });
}

export interface VendorCheckDeps {
  // the WORKER_MODE the operator asked for; CRS has its own credentials, so the Droid key does not gate it
  mode: WorkerMode;
  log: (msg: string) => void;
  signal?: AbortSignal;
  // injectable for tests
  env?: CrsEnv;
  fetch?: typeof fetch;
  variant?: string;
}

function note(text: string): Step {
  return { type: 'note', at: nowIso(), text };
}

function outcome(finding: VendorCheckFinding, steps: Step[], source: VendorCheckOutcome['source']): VendorCheckOutcome {
  const { recommendation, question } = mapRecommendation(finding.recommendation, finding.reasons);
  return { finding, steps, source, recommendation, question };
}

async function runCalls(brief: VendorBrief, opts: CrsOptions): Promise<CrsSummary[]> {
  const { id, name } = brief.vendor;
  return Promise.all([businessCredit(name, id, opts), publicRecords(name, id, opts), ofacScreen(name, { ...opts, vendorId: id })]);
}

export function replayVendor(brief: VendorBrief, fixturesDir: string, variant?: string): VendorCheckOutcome | undefined {
  const file = vendorFixtureFile(fixturesDir, brief.vendor.id, variant);
  if (!file) return undefined;
  const fx = loadVendorFixture(file);
  const rel = `vendor_checks/${file.split(/[\\/]/).pop()}`;
  const summaries: CrsSummary[] = CRS_CALLS.map(c =>
    fx.responses[c] === undefined ? { call: c, endpoint: endpointLabel(c), ok: false, hits: [], summary: 'not in the fixture', raw: null, error: 'not in the fixture' } : summarizeRaw(c, fx.responses[c]),
  );
  // A recorded sandbox response replays as `replayed`; a hand-shaped file is labelled as such on every
  // surface: finding status, each evidence ref, the finding text and a step note. Nothing reads as sandbox data.
  const handShaped = !fx.recorded;
  const fixtureNote = handShaped
    ? ((fx as { note?: string }).note ?? 'hand-shaped fixture: shape of a sandbox response, not real data').slice(0, 300)
    : undefined;
  const finding = assessVendor(brief, summaries, {
    status: handShaped ? 'hand_shaped' : 'replayed',
    model: handShaped ? 'hand-shaped fixture' : 'crs-replay',
    refSuffix: handShaped ? 'hand-shaped fixture' : `replayed from ${rel}`,
    fixtureNote,
  });
  const steps: Step[] = [
    ...summaries.map(s => note(`${SOURCE_OF[s.call]} ${s.endpoint}: ${s.ok ? `${s.hits.length} hit(s)` : s.summary}`)),
    ...(handShaped ? [note(`hand-shaped fixture ${rel}, not sandbox data: ${fixtureNote}`)] : []),
    note(`replayed from ${rel}`),
  ];
  return outcome(finding, steps, 'replayed');
}

export async function handleVendorCheck(brief: VendorBrief, deps: VendorCheckDeps): Promise<VendorCheckOutcome> {
  const env = deps.env ?? crsEnvFrom(process.env, deps.mode);
  const variant = deps.variant ?? process.env.CRS_FIXTURE_VARIANT;
  const { log } = deps;
  const steps: Step[] = [note(`vendor check for vendor ${brief.vendor.id} (${brief.trigger}); business fields only, no person data`)];
  const opts: CrsOptions = { env, log, signal: deps.signal, fetch: deps.fetch };

  if (env.dryRun) {
    await runCalls(brief, opts);
    steps.push(note('CRS dry run: the three requests were printed, nothing was sent'));
  } else if (crsLiveEnabled(env) && brief.vendor.name.trim()) {
    const summaries = await runCalls(brief, opts);
    if (deps.signal?.aborted) throw new Error('vendor check aborted by the loop timeout');
    for (const s of summaries) steps.push(note(`${SOURCE_OF[s.call]} ${s.endpoint}: ${s.ok ? `${s.hits.length} hit(s)` : s.summary}`));
    if (summaries.some(s => s.ok)) {
      const finding = assessVendor(brief, summaries, { status: 'ok', model: 'crs', refSuffix: env.mode === 'record' ? 'live, recorded' : 'live' });
      return outcome(finding, steps, 'live');
    }
    log(`CRS calls for vendor ${brief.vendor.id} all failed; falling back to replay`);
  }

  try {
    const r = replayVendor(brief, env.fixturesDir, variant);
    if (r) return { ...r, steps: [...steps, ...r.steps] };
  } catch (err) {
    log(`vendor check fixture for vendor ${brief.vendor.id} rejected: ${(err as Error).message}`);
    steps.push(note(`fixture rejected: ${(err as Error).message}`));
  }
  steps.push(note(`scripted stand-in: no fixture at vendor_checks/${brief.vendor.id}.json`));
  return outcome(standInVendorFinding(brief), steps, 'none');
}

export function vendorRecord(id: bigint, o: VendorCheckOutcome): RecordArgs {
  return {
    id,
    stepsJson: JSON.stringify(o.steps),
    findingJson: JSON.stringify(o.finding),
    recommendation: o.recommendation,
    question: o.question,
    source: o.source,
  };
}

// The loop's entry point: parse the brief (throws on a malformed one; the loop then writes its timeout row), run,
// and return the terminal row.
export async function handleVendorCheckTask(task: { id: bigint; briefJson: string }, deps: VendorCheckDeps): Promise<RecordArgs> {
  return vendorRecord(task.id, await handleVendorCheck(parseVendorBrief(task.briefJson), deps));
}
