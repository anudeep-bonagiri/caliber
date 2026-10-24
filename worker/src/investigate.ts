// One investigate task: live Droid (or record), else replay, else the scripted stand-in.
// Every path returns a finding that passed the zod gate and a steps array that says what ran.
import { buildPrompt, type Brief } from './brief.js';
import type { Config } from './config.js';
import { nowIso } from './config.js';
import { investigate as runDroid } from './droid.js';
import { explain, withExplanation, type ExplainDeps } from './explain.js';
import { parseFinding, verifyEvidence, type Finding } from './finding.js';
import { recordFixture, replayOrStandIn, type InvestigationOutcome, type Step } from './replay.js';

export interface InvestigateDeps {
  cfg: Pick<Config, 'mode' | 'evidenceDir' | 'fixturesDir' | 'taskTimeoutMs' | 'kibanaUrl' | 'elasticApiKey' | 'costLog' | 'anthropicApiKey'>;
  log: (msg: string) => void;
  // aborted by the loop at its outer timeout; the live run stops and no fixture is recorded after it fires
  signal?: AbortSignal;
  // injectable for tests
  droid?: typeof runDroid;
  explainDeps?: ExplainDeps;
}

export interface InvestigateResult extends InvestigationOutcome {
  recommendation: Finding['recommendation'];
  question?: string;
}

async function liveRun(brief: Brief, deps: InvestigateDeps): Promise<InvestigationOutcome> {
  const { cfg, log } = deps;
  const prompt = buildPrompt(brief, cfg.evidenceDir);
  const steps: Step[] = [{ type: 'note', at: nowIso(), text: `live droid run (${cfg.mode}) for ${brief.txnRef}` }];
  const run = await (deps.droid ?? runDroid)(prompt, steps, {
    evidenceDir: cfg.evidenceDir,
    timeoutMs: Math.min(cfg.taskTimeoutMs, 90_000),
    kibanaUrl: cfg.kibanaUrl || undefined,
    elasticApiKey: cfg.elasticApiKey || undefined,
    costLog: cfg.costLog,
    txnRef: brief.txnRef,
    log,
    signal: deps.signal,
  });
  if (run.aborted) throw new Error('droid aborted at the time limit');
  const r = run.result;
  if (!r) throw new Error('droid stream ended without a result message');
  if (r.subtype !== 'success') throw new Error(`droid result ${r.subtype}${r.error ? `: ${r.error.message}` : ''}`);
  const raw = r.structuredOutput;
  const parsed = parseFinding(
    {
      ...(typeof raw === 'object' && raw !== null ? raw : {}),
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

export async function handleInvestigate(brief: Brief, deps: InvestigateDeps): Promise<InvestigateResult> {
  const { cfg, log } = deps;
  let outcome: InvestigationOutcome | undefined;
  if (cfg.mode === 'live' || cfg.mode === 'record') {
    try {
      outcome = await liveRun(brief, deps);
    } catch (err) {
      if (deps.signal?.aborted) throw err;
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
