// The claim loop. Polls the client cache (open tasks arrive by subscription), claims with the version lock,
// dispatches by kind under a concurrency limit, and guarantees a terminal write for every claimed task.
import type { AgentTask } from '../../module_bindings/types.js';
import { parseBrief, type Brief } from './brief.js';
import { isPaused, nowIso, type Config } from './config.js';
import { FINDING_MAX, RECOMMENDATIONS, type Finding } from './finding.js';
import { handleInvestigate } from './investigate.js';
import { handleDraftRule, type BacktestRow } from './rules.js';
import { STAND_IN_PREFIX, standInFinding, type Step } from './replay.js';
import { claim, claimedTasksOf, createRule, holdStatus, onOpenTask, openTasks, recordInvestigation, type Conn, type CreateRuleArgs, type RecordArgs } from './stdb.js';
import { handleVendorCheckTask } from './vendor_check.js';

export type Log = (msg: string) => void;
export type Sleep = (ms: number) => Promise<void>;

export interface LoopApi {
  claim: typeof claim;
  recordInvestigation: typeof recordInvestigation;
  createRule: typeof createRule;
}

export interface LoopDeps {
  conn: Conn;
  cfg: Config;
  log: Log;
  // this worker's identity; claimed tasks with this claimer are recovered at startup
  identityHex?: string;
  // injectable for tests
  api?: Partial<LoopApi>;
  sleep?: Sleep;
  investigate?: typeof handleInvestigate;
}

// Terminal write retries: 5 attempts, 250 ms doubling, capped at 4 s.
export const WRITE_ATTEMPTS = 5;
export const WRITE_BACKOFF_MS = 250;
export const WRITE_BACKOFF_CAP_MS = 4_000;
// After the outer timeout the handler is aborted and awaited this long before the stand-in is written.
export const ABORT_WAIT_MS = 2_000;
// stop() waits TASK_TIMEOUT_MS + TASK_GRACE_MS plus this, which covers the abort wait and two rounds of retries.
export const STOP_EXTRA_MS = 20_000;
// The module refuses steps_json over 200,000 and finding_json over 50,000 characters; stay under with margin.
export const STEPS_SOFT_LIMIT = 180_000;
export const FINDING_SOFT_LIMIT = 45_000;
export const TOOL_CONTENT_MAX = 4_000;
export const STEPS_KEEP_HEAD = 10;
export const STEPS_KEEP_TAIL = 20;
const STEP_SHRINK_MAX = 5_000;
const TRUNC_MARKER = ' [truncated]';

export class TaskTimeout extends Error {
  constructor(ms: number) {
    super(`task exceeded ${ms} ms`);
    this.name = 'TaskTimeout';
  }
}

const defaultSleep: Sleep = ms => new Promise(r => setTimeout(r, ms));

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new TaskTimeout(ms)), ms);
    p.then(v => {
      clearTimeout(t);
      resolve(v);
    }, e => {
      clearTimeout(t);
      reject(e);
    });
  });
}

// Resolve when `p` settles or after `ms`, whichever is first. Never rejects.
async function settleWithin(p: Promise<unknown>, ms: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const settled = await Promise.race([
    p.then(() => true, () => true),
    new Promise<boolean>(r => {
      timer = setTimeout(() => r(false), ms);
    }),
  ]);
  clearTimeout(timer);
  return settled;
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ---------------------------------------------------------------------------
// payload fitting: everything that goes to record_investigation passes through toRecord
// ---------------------------------------------------------------------------
function capText(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - TRUNC_MARKER.length) + TRUNC_MARKER;
}

function capToolContent(s: Step): Step {
  return s.type === 'tool_result' && s.content.length > TOOL_CONTENT_MAX ? { ...s, content: capText(s.content, TOOL_CONTENT_MAX) } : s;
}

function shrinkStep(s: Step): Step {
  if (JSON.stringify(s).length <= STEP_SHRINK_MAX) return s;
  switch (s.type) {
    case 'tool_call':
      return { ...s, name: capText(s.name, 200), toolUseId: capText(s.toolUseId, 200), input: { truncated: capText(JSON.stringify(s.input) ?? '', 2_000) } };
    case 'tool_result':
      return { ...s, toolName: capText(s.toolName, 200), toolUseId: capText(s.toolUseId, 200), content: capText(s.content, 2_000) };
    case 'assistant':
    case 'note':
      return { ...s, text: capText(s.text, 2_000) };
    case 'result':
      return { ...s, subtype: capText(s.subtype, 200) };
  }
}

const size = (v: unknown) => JSON.stringify(v).length;

// Fit steps under STEPS_SOFT_LIMIT: cap tool_result content, then cut the middle (first 10 and last 20 kept),
// then shrink oversize single steps. The result always serializes under the limit.
export function fitSteps(steps: Step[]): Step[] {
  let out = steps.map(capToolContent);
  if (size(out) > STEPS_SOFT_LIMIT && out.length > STEPS_KEEP_HEAD + STEPS_KEEP_TAIL) {
    const omitted = out.length - STEPS_KEEP_HEAD - STEPS_KEEP_TAIL;
    out = [...out.slice(0, STEPS_KEEP_HEAD), { type: 'note', at: nowIso(), text: `${omitted} steps omitted to fit the ledger` }, ...out.slice(-STEPS_KEEP_TAIL)];
  }
  if (size(out) > STEPS_SOFT_LIMIT) out = out.map(shrinkStep);
  if (size(out) > STEPS_SOFT_LIMIT) out = [{ type: 'note', at: nowIso(), text: `${steps.length} steps omitted to fit the ledger` }];
  return out;
}

type AnyFinding = Omit<Finding, 'recommendation'> & { recommendation: string } & Record<string, unknown>;

// Serialize a finding under FINDING_SOFT_LIMIT. finding.recommendation is forced into clear | hold | hold_and_ask
// whatever the task outcome is. Shortening adds a note to `notes`.
export function fitFinding(finding: AnyFinding, notes: Step[]): string {
  const recommendation = (RECOMMENDATIONS as readonly string[]).includes(finding.recommendation) ? finding.recommendation : 'hold';
  let f: AnyFinding = { ...finding, recommendation };
  let json = JSON.stringify(f);
  if (json.length <= FINDING_SOFT_LIMIT) return json;
  const before = json.length;
  f = { ...f, finding: capText(f.finding, 300), ...(typeof f.question_for_controller === 'string' ? { question_for_controller: capText(f.question_for_controller, 300) } : {}) };
  const evidence = [...f.evidence];
  while ((json = JSON.stringify({ ...f, evidence })).length > FINDING_SOFT_LIMIT && evidence.length) evidence.pop();
  if (json.length > FINDING_SOFT_LIMIT) {
    json = JSON.stringify({ finding: f.finding, evidence: [], recommendation, confidence: f.confidence, status: f.status, model: f.model });
  }
  notes.push({ type: 'note', at: nowIso(), text: `finding_json shortened from ${before} to ${json.length} characters to fit the ledger` });
  return json;
}

export interface RecordInput {
  id: bigint;
  steps: Step[];
  finding: AnyFinding;
  recommendation: RecordArgs['recommendation'];
  question?: string;
  source: RecordArgs['source'];
}

export function toRecord(a: RecordInput): RecordArgs {
  const notes: Step[] = [];
  const findingJson = fitFinding(a.finding, notes);
  const stepsJson = JSON.stringify(fitSteps([...a.steps, ...notes]));
  return { id: a.id, stepsJson, findingJson, recommendation: a.recommendation, question: a.question, source: a.source };
}

// ---------------------------------------------------------------------------
// terminal write with retries
// ---------------------------------------------------------------------------
// The module refuses a second terminal write with `task is <status>`: another write already landed.
const ALREADY_TERMINAL = 'task is ';
// Refusals of this payload; a smaller fallback row may still go through.
const PAYLOAD_REFUSED = ['payload too large', 'bad recommendation'];
// Refusals of the task itself; no write by this identity can succeed.
const TASK_REFUSED = ['task not claimed by caller', 'no such task'];

type AttemptResult = 'written' | 'already_terminal' | 'payload_refused' | 'task_refused' | 'failed';
export type WriteOutcome = 'written' | 'already_terminal' | 'fallback_written' | 'failed';

async function attemptWrite(write: (r: RecordArgs) => Promise<void>, record: RecordArgs, what: string, log: Log, sleep: Sleep): Promise<AttemptResult> {
  let delay = WRITE_BACKOFF_MS;
  for (let attempt = 1; attempt <= WRITE_ATTEMPTS; attempt++) {
    try {
      await write(record);
      return 'written';
    } catch (err) {
      const msg = errMessage(err);
      if (msg.includes(ALREADY_TERMINAL)) {
        log(`task ${record.id}: ${what} refused (${msg}); another terminal write already landed, treating it as done`);
        return 'already_terminal';
      }
      if (TASK_REFUSED.some(s => msg.includes(s))) {
        log(`task ${record.id}: ${what} refused (${msg}); giving up on this task`);
        return 'task_refused';
      }
      if (PAYLOAD_REFUSED.some(s => msg.includes(s))) {
        log(`task ${record.id}: ${what} refused (${msg})`);
        return 'payload_refused';
      }
      if (attempt === WRITE_ATTEMPTS) {
        log(`task ${record.id}: ${what} failed ${WRITE_ATTEMPTS} times, last error: ${msg}`);
        return 'failed';
      }
      log(`task ${record.id}: ${what} attempt ${attempt} failed (${msg}); retrying in ${delay} ms`);
      await sleep(delay);
      delay = Math.min(delay * 2, WRITE_BACKOFF_CAP_MS);
    }
  }
  return 'failed';
}

// Write the terminal row, retrying with backoff. When the row itself cannot be written, a minimal timeout row
// is tried the same way. A `task is <status>` refusal means a write already committed and counts as success.
export async function writeTerminal(write: (r: RecordArgs) => Promise<void>, record: RecordArgs, fallback: () => RecordArgs, log: Log, sleep: Sleep = defaultSleep): Promise<WriteOutcome> {
  const first = await attemptWrite(write, record, 'record_investigation', log, sleep);
  if (first === 'written' || first === 'already_terminal') return first;
  if (first === 'task_refused') return 'failed';
  log(`task ${record.id}: writing minimal timeout row instead`);
  const second = await attemptWrite(write, fallback(), 'minimal timeout row', log, sleep);
  if (second === 'written') return 'fallback_written';
  if (second === 'already_terminal') return 'already_terminal';
  log(`task ${record.id}: could not write a terminal row`);
  return 'failed';
}

function matchResultRows(conn: Conn): BacktestRow[] {
  const out: BacktestRow[] = [];
  for (const r of conn.db.matchResult.iter()) {
    let evidence: Record<string, unknown> = {};
    try {
      evidence = JSON.parse(r.evidenceJson) as Record<string, unknown>;
    } catch {
      evidence = {};
    }
    out.push({ txnRef: r.txnRef, code: r.code, day: r.day, evidence });
  }
  return out;
}

export class WorkerLoop {
  private busy = new Set<bigint>();
  private tasks = new Set<Promise<void>>();
  private recoverQueue: AgentTask[] = [];
  private timer: ReturnType<typeof setInterval> | undefined;
  private pausedLogged = false;
  private stopping = false;
  private api: LoopApi;
  private sleep: Sleep;

  constructor(private deps: LoopDeps) {
    this.api = { claim, recordInvestigation, createRule, ...deps.api };
    this.sleep = deps.sleep ?? defaultSleep;
  }

  start(): void {
    const { conn, cfg, log } = this.deps;
    this.queueRecovered();
    onOpenTask(conn, () => this.tick());
    this.timer = setInterval(() => this.tick(), cfg.pollMs);
    log(`loop started: mode ${cfg.mode}, concurrency ${cfg.concurrency}, timeout ${cfg.taskTimeoutMs} ms, pause file ${cfg.pauseFile}`);
    this.tick();
  }

  // Tasks this identity claimed in a previous run and never finished. They are processed without a new claim.
  private queueRecovered(): void {
    const { conn, log, identityHex } = this.deps;
    if (!identityHex) return;
    for (const t of claimedTasksOf(conn, identityHex)) {
      this.recoverQueue.push(t);
      log(`task ${t.id} ${t.txnRef}: recovering ${t.kind} task left claimed by this identity`);
    }
  }

  // One iteration. The PAUSE file is checked every time (G15).
  tick(): void {
    if (this.stopping) return;
    const { conn, cfg, log } = this.deps;
    if (isPaused(cfg)) {
      if (!this.pausedLogged) log('PAUSE file present; not claiming');
      this.pausedLogged = true;
      return;
    }
    this.pausedLogged = false;
    if (!conn.isActive) return;
    while (this.recoverQueue.length && this.busy.size < cfg.concurrency) {
      const task = this.recoverQueue.shift()!;
      if (!this.busy.has(task.id)) this.spawn(task, true);
    }
    for (const task of openTasks(conn)) {
      if (this.busy.size >= cfg.concurrency) break;
      if (this.busy.has(task.id)) continue;
      this.spawn(task, false);
    }
  }

  private spawn(task: AgentTask, recovered: boolean): void {
    this.busy.add(task.id);
    const p = this.runTask(task, recovered)
      .catch(err => this.deps.log(`task ${task.id}: unhandled ${errMessage(err)}`))
      .finally(() => {
        this.busy.delete(task.id);
        this.tasks.delete(p);
      });
    this.tasks.add(p);
  }

  stopBoundMs(): number {
    return this.deps.cfg.taskTimeoutMs + this.deps.cfg.taskGraceMs + STOP_EXTRA_MS;
  }

  // Stop claiming and wait for every in-flight task to finish its terminal write (bounded).
  async stop(boundMs = this.stopBoundMs()): Promise<void> {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    if (this.tasks.size === 0) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const done = await Promise.race([
      Promise.allSettled([...this.tasks]).then(() => true),
      new Promise<boolean>(r => {
        timer = setTimeout(() => r(false), boundMs);
      }),
    ]);
    clearTimeout(timer);
    if (!done) this.deps.log(`stop: ${this.tasks.size} task(s) still in flight after ${boundMs} ms; they stay claimed and are recovered on the next start`);
  }

  // Claim (unless recovered), run under the outer timeout, and write exactly one terminal row.
  async runTask(task: AgentTask, recovered = false): Promise<void> {
    const { conn, cfg, log } = this.deps;
    const started = Date.now();
    if (!recovered) {
      const won = await this.api.claim(conn, task);
      if (!won) {
        log(`task ${task.id} ${task.txnRef}: another worker won`);
        return;
      }
    }
    const ac = new AbortController();
    const handler = this.handle(task, ac.signal);
    const budget = cfg.taskTimeoutMs + cfg.taskGraceMs;
    let record: RecordArgs;
    try {
      record = await withTimeout(handler, budget);
    } catch (err) {
      ac.abort();
      if (err instanceof TaskTimeout && !(await settleWithin(handler, ABORT_WAIT_MS))) {
        log(`task ${task.id}: handler did not stop within ${ABORT_WAIT_MS} ms of abort; its result is discarded`);
      }
      record = this.fallbackRecord(task, err as Error);
    } finally {
      // nothing the handler does after this point can reach the ledger: create_rule is gated on this signal
      ac.abort();
    }
    const outcome = await writeTerminal(r => this.api.recordInvestigation(conn, r), record, () => this.minimalRecord(task, 'terminal write refused'), log, this.sleep);
    const finding = safeJson(record.findingJson) as { status?: string } | undefined;
    log(`task ${task.id} ${task.txnRef} ${task.kind} -> ${record.recommendation} (${record.source}${finding?.status ? `, ${finding.status}` : ''}) ${outcome} ${Date.now() - started} ms`);
  }

  private async handle(task: AgentTask, signal: AbortSignal): Promise<RecordArgs> {
    const { conn, cfg, log } = this.deps;
    // Task 16: vendor_check briefs carry vendor fields only (no evidence object), so they dispatch before parseBrief.
    if (task.kind === 'vendor_check') return handleVendorCheckTask(task, { mode: cfg.requestedMode, log: m => log(`task ${task.id}: ${m}`), signal });
    const brief = parseBrief(task.briefJson);
    const tlog = (m: string) => log(`task ${task.id}: ${m}`);
    if (task.kind === 'draft_rule') {
      const r = await handleDraftRule(brief, {
        matchResults: () => matchResultRows(conn),
        holdStatus: ref => holdStatus(conn, ref),
        createRule: (a: CreateRuleArgs) => (signal.aborted ? Promise.reject(new Error('task aborted; create_rule not called')) : this.api.createRule(conn, a)),
        anthropicApiKey: cfg.anthropicApiKey || undefined,
        log: tlog,
      });
      return toRecord({ id: task.id, steps: r.steps, finding: r.finding, recommendation: r.recommendation, question: r.question, source: r.source });
    }
    if (task.kind !== 'investigate') throw new Error(`unknown task kind ${task.kind}`);
    const r = await (this.deps.investigate ?? handleInvestigate)(brief, { cfg, log: tlog, signal });
    return toRecord({ id: task.id, steps: r.steps, finding: r.finding, recommendation: r.recommendation, question: r.question, source: r.source });
  }

  // Timeout or crash. An investigate task with a readable brief gets the scripted stand-in, built synchronously
  // from the brief, labelled status 'timeout'. Anything else gets the minimal row. Either way the dashboard
  // never shows a spinner forever.
  private fallbackRecord(task: AgentTask, err: Error): RecordArgs {
    const why = err instanceof TaskTimeout ? err.message : `worker error: ${err.message}`;
    let brief: Brief | undefined;
    try {
      brief = task.kind === 'investigate' ? parseBrief(task.briefJson) : undefined;
    } catch {
      brief = undefined;
    }
    if (!brief) return this.minimalRecord(task, why);
    const base = standInFinding(brief);
    const finding: Finding = {
      ...base,
      finding: `${STAND_IN_PREFIX} Investigation did not finish (${why}).${base.finding.slice(STAND_IN_PREFIX.length)}`.slice(0, FINDING_MAX),
      status: 'timeout',
    };
    const steps: Step[] = [
      { type: 'note', at: nowIso(), text: why },
      { type: 'note', at: nowIso(), text: `scripted stand-in, not a model: written after the investigation did not finish` },
    ];
    return toRecord({ id: task.id, steps, finding, recommendation: 'timeout', question: finding.question_for_controller, source: 'none' });
  }

  private minimalRecord(task: AgentTask, why: string): RecordArgs {
    const finding: Finding = {
      finding: `Investigation did not finish: ${why}. The hold stands.`.slice(0, FINDING_MAX),
      evidence: [],
      recommendation: 'hold',
      confidence: 0,
      status: 'timeout',
      model: 'none',
    };
    return toRecord({ id: task.id, steps: [{ type: 'note', at: nowIso(), text: why }], finding, recommendation: 'timeout', source: 'none' });
  }
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}
