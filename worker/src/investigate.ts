// One investigate task: live Droid (or record), else replay, else the scripted stand-in.
// Every path returns a finding that passed the zod gate and a steps array that says what ran.
// A rate limit or server error from the live investigator is retried once and then deferred: the hold stays
// open with a finding that says so, and no fixture or stand-in is written in its place.
import { buildPrompt, type Brief } from './brief.js';
import type { Config } from './config.js';
import { nowIso } from './config.js';
import { DroidApiError, RETRY_BACKOFF_MS, classifyDroidFailure, investigate as runDroid } from './droid.js';
import { explain, withExplanation, type ExplainDeps } from './explain.js';
import { FindingSchema, parseFinding, verifyEvidence, type Finding } from './finding.js';
import { recordFixture, replayOrStandIn, type InvestigationOutcome, type Step } from './replay.js';

export const DEFERRED_PREFIX = 'Deferred: the investigator was unavailable';

export interface InvestigateDeps {
  cfg: Pick<Config, 'mode' | 'evidenceDir' | 'fixturesDir' | 'taskTimeoutMs' | 'kibanaUrl' | 'elasticApiKey' | 'costLog' | 'anthropicApiKey'>;
  log: (msg: string) => void;
  // aborted by the loop at its outer timeout; the live run stops and no fixture is recorded after it fires
  signal?: AbortSignal;
  // injectable for tests
  droid?: typeof runDroid;
  explainDeps?: ExplainDeps;
  // the retry backoff; rejects when the signal aborts
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

export interface InvestigateResult extends InvestigationOutcome {
  recommendation: Finding['recommendation'];
  question?: string;
}

function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('investigation aborted by the loop timeout'));
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error('investigation aborted by the loop timeout'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function liveRun(brief: Brief, deps: InvestigateDeps, steps: Step[]): Promise<InvestigationOutcome> {
  const { cfg, log } = deps;
  const prompt = buildPrompt(brief, cfg.evidenceDir);
  steps.push({ type: 'note', at: nowIso(), text: `live droid run (${cfg.mode}) for ${brief.txnRef}` });
  let run: Awaited<ReturnType<typeof runDroid>>;
  try {
    run = await (deps.droid ?? runDroid)(prompt, steps, {
      evidenceDir: cfg.evidenceDir,
      timeoutMs: Math.min(cfg.taskTimeoutMs, 90_000),
      kibanaUrl: cfg.kibanaUrl || undefined,
      elasticApiKey: cfg.elasticApiKey || undefined,
      costLog: cfg.costLog,
      txnRef: brief.txnRef,
      log,
      signal: deps.signal,
    });
  } catch (err) {
    // only errors thrown by the SDK call are classified; an abort keeps its own path
    if (!deps.signal?.aborted) {
      const message = err instanceof Error ? err.message : String(err);
      const api = classifyDroidFailure(message);
      if (api) throw new DroidApiError(message, api);
    }
    throw err;
  }
  if (run.aborted) throw new Error('droid aborted at the time limit');
  const r = run.result;
  if (!r) throw new Error('droid stream ended without a result message');
  if (r.subtype !== 'success') {
    const message = `droid result ${r.subtype}${r.error ? `: ${r.error.message}` : ''}`;
    const api = r.subtype === 'error_during_execution' ? classifyDroidFailure(message, r.subtype) : undefined;
    if (api) throw new DroidApiError(message, api);
    throw new Error(message);
  }
  const raw = r.structuredOutput;
  // recordedAt and recordedBy belong to replay; a live output cannot claim them
  const { recordedAt: _a, recordedBy: _b, ...output } = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const parsed = parseFinding(
    {
      ...output,
      status: 'ok',
      model: 'droid',
      durationMs: Math.round(r.durationMs),
      tokenUsage: { input: r.tokenUsage?.inputTokens ?? 0, output: r.tokenUsage?.outputTokens ?? 0 },
    },
    cfg.evidenceDir,
  );
  const verified = verifyEvidence(parsed, { evidenceDir: cfg.evidenceDir, brief, steps });
  for (const text of verified.notes) steps.push({ type: 'note', at: nowIso(), text });
  const finding = verified.finding;
  if (deps.signal?.aborted) throw new Error('investigation aborted by the loop timeout');
  if (cfg.mode === 'record') {
    const file = recordFixture(cfg.fixturesDir, brief.txnRef, finding, steps);
    if (file) log(`recorded fixture ${file}`);
  }
  return { finding, steps, source: 'live' };
}

export function deferredFinding(reason: string, backoffMs: number): Finding {
  return FindingSchema.parse({
    finding: `${DEFERRED_PREFIX} (${reason.slice(0, 200)}). The hold stays open; no stand-in was written. Retried once after ${backoffMs / 1000} s.`,
    evidence: [],
    recommendation: 'hold',
    confidence: 0,
    status: 'deferred',
    model: 'droid',
  });
}

// Live run with one retry on a rate limit (after 5 s) or server error (after 2 s). A second API failure returns
// the deferred finding. Any other error is thrown to the caller unchanged.
async function liveWithRetry(brief: Brief, deps: InvestigateDeps): Promise<InvestigationOutcome> {
  const { log } = deps;
  const first: Step[] = [];
  let firstErr: DroidApiError;
  try {
    return await liveRun(brief, deps, first);
  } catch (err) {
    if (!(err instanceof DroidApiError) || deps.signal?.aborted) throw err;
    firstErr = err;
  }
  const wait = RETRY_BACKOFF_MS[firstErr.kind];
  log(`live run for ${brief.txnRef} hit ${firstErr.reason}; retrying once in ${wait / 1000} s`);
  first.push({ type: 'note', at: nowIso(), text: `investigator unavailable (${firstErr.reason}): ${firstErr.message.slice(0, 300)}; retrying once in ${wait / 1000} s` });
  await (deps.sleep ?? abortableSleep)(wait, deps.signal);
  if (deps.signal?.aborted) throw new Error('investigation aborted by the loop timeout');
  const second: Step[] = [];
  try {
    const out = await liveRun(brief, deps, second);
    return { ...out, steps: [...first, ...out.steps] };
  } catch (err) {
    if (!(err instanceof DroidApiError) || deps.signal?.aborted) throw err;
    const reason = err.reason === firstErr.reason ? err.reason : `${firstErr.reason}, then ${err.reason}`;
    log(`live run for ${brief.txnRef} deferred: ${reason}`);
    second.push({ type: 'note', at: nowIso(), text: `investigator unavailable again (${err.reason}): ${err.message.slice(0, 300)}; deferred, no fixture or stand-in written` });
    return { finding: deferredFinding(reason, wait), steps: [...first, ...second], source: 'none' };
  }
}

export async function handleInvestigate(brief: Brief, deps: InvestigateDeps): Promise<InvestigateResult> {
  const { cfg, log } = deps;
  let outcome: InvestigationOutcome | undefined;
  if (cfg.mode === 'live' || cfg.mode === 'record') {
    try {
      outcome = await liveWithRetry(brief, deps);
    } catch (err) {
      if (deps.signal?.aborted) throw err;
      // aborts at the time limit, SDK errors without an HTTP status, and output that fails the schema
      log(`live run for ${brief.txnRef} failed, falling back: ${(err as Error).message}`);
    }
  }
  if (!outcome) outcome = replayOrStandIn(brief, cfg.fixturesDir, cfg.evidenceDir, log);
  if (outcome.finding.status === 'no_fixture') {
    const explanation = await explain(brief, deps.explainDeps ?? { apiKey: cfg.anthropicApiKey || undefined, log });
    outcome = { ...outcome, finding: withExplanation(outcome.finding, explanation) };
    outcome.steps.push({ type: 'note', at: nowIso(), text: `explanation from ${explanation.source}` });
  }
  const f = outcome.finding;
  return {
    ...outcome,
    recommendation: f.recommendation,
    ...(f.recommendation === 'hold_and_ask' || (f.recommendation === 'hold' && f.question_for_controller) ? { question: f.question_for_controller } : {}),
  };
}
