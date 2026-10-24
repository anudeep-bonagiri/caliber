// The claim loop. Polls the client cache (open tasks arrive by subscription), claims with the version lock,
// dispatches by kind under a concurrency limit, and guarantees a terminal write for every claimed task.
import type { AgentTask } from '../../module_bindings/index.js';
import { parseBrief } from './brief.js';
import { isPaused, nowIso, type Config } from './config.js';
import { handleInvestigate } from './investigate.js';
import { handleDraftRule, type BacktestRow } from './rules.js';
import { claim, createRule, holdStatus, onOpenTask, openTasks, recordInvestigation, type Conn, type RecordArgs } from './stdb.js';
import type { Step } from './replay.js';

export type Log = (msg: string) => void;

export interface LoopDeps {
  conn: Conn;
  cfg: Config;
  log: Log;
}

export class TaskTimeout extends Error {
  constructor(ms: number) {
    super(`task exceeded ${ms} ms`);
    this.name = 'TaskTimeout';
  }
}

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
  private timer: ReturnType<typeof setInterval> | undefined;
  private pausedLogged = false;
  private stopping = false;

  constructor(private deps: LoopDeps) {}

  start(): void {
    const { conn, cfg, log } = this.deps;
    onOpenTask(conn, () => this.tick());
    this.timer = setInterval(() => this.tick(), cfg.pollMs);
    log(`loop started: mode ${cfg.mode}, concurrency ${cfg.concurrency}, timeout ${cfg.taskTimeoutMs} ms, pause file ${cfg.pauseFile}`);
    this.tick();
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
    for (const task of openTasks(conn)) {
      if (this.busy.size >= cfg.concurrency) break;
      if (this.busy.has(task.id)) continue;
      this.busy.add(task.id);
      const p = this.run(task)
        .catch(err => log(`task ${task.id}: unhandled ${(err as Error).message}`))
        .finally(() => {
          this.busy.delete(task.id);
          this.tasks.delete(p);
        });
      this.tasks.add(p);
    }
  }

  async stop(graceMs = 5_000): Promise<void> {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    await Promise.race([Promise.allSettled([...this.tasks]), new Promise(r => setTimeout(r, graceMs))]);
  }

  private async run(task: AgentTask): Promise<void> {
    const { conn, cfg, log } = this.deps;
    const started = Date.now();
    const won = await claim(conn, task);
    if (!won) {
      log(`task ${task.id} ${task.txnRef}: another worker won`);
      return;
    }
    let record: RecordArgs;
    try {
      record = await withTimeout(this.handle(task), cfg.taskTimeoutMs + cfg.taskGraceMs);
    } catch (err) {
      record = this.timeoutRecord(task, err as Error);
    }
    await this.write(task, record);
    const finding = safeJson(record.findingJson) as { status?: string } | undefined;
    log(`task ${task.id} ${task.txnRef} ${task.kind} -> ${record.recommendation} (${record.source}${finding?.status ? `, ${finding.status}` : ''}) ${Date.now() - started} ms`);
  }

  private async handle(task: AgentTask): Promise<RecordArgs> {
    const { conn, cfg, log } = this.deps;
    const brief = parseBrief(task.briefJson);
    const tlog = (m: string) => log(`task ${task.id}: ${m}`);
    if (task.kind === 'draft_rule') {
      const r = await handleDraftRule(brief, {
        matchResults: () => matchResultRows(conn),
        holdStatus: ref => holdStatus(conn, ref),
        createRule: a => createRule(conn, a),
        anthropicApiKey: cfg.anthropicApiKey || undefined,
        log: tlog,
      });
      return { id: task.id, stepsJson: JSON.stringify(r.steps), findingJson: JSON.stringify(r.finding), recommendation: r.recommendation, question: r.question, source: r.source };
    }
    if (task.kind !== 'investigate') throw new Error(`unknown task kind ${task.kind}`);
    const r = await handleInvestigate(brief, { cfg, log: tlog });
    return { id: task.id, stepsJson: JSON.stringify(r.steps), findingJson: JSON.stringify(r.finding), recommendation: r.recommendation, question: r.question, source: r.source };
  }

  // Timeout or crash: the task still gets a terminal row so the dashboard never shows a spinner forever.
  private timeoutRecord(task: AgentTask, err: Error): RecordArgs {
    const why = err instanceof TaskTimeout ? err.message : `worker error: ${err.message}`;
    const steps: Step[] = [{ type: 'note', at: nowIso(), text: why }];
    const finding = {
      finding: `Investigation did not finish: ${why}. The hold stands.`.slice(0, 1000),
      evidence: [],
      recommendation: 'hold',
      confidence: 0,
      status: 'timeout',
      model: 'none',
    };
    return { id: task.id, stepsJson: JSON.stringify(steps), findingJson: JSON.stringify(finding), recommendation: 'timeout', source: 'none' };
  }

  private async write(task: AgentTask, record: RecordArgs): Promise<void> {
    const { conn, log } = this.deps;
    try {
      await recordInvestigation(conn, record);
      return;
    } catch (err) {
      log(`task ${task.id}: record_investigation refused (${(err as Error).message}); writing minimal timeout row`);
    }
    try {
      await recordInvestigation(conn, this.timeoutRecord(task, new Error('terminal write refused')));
    } catch (err) {
      log(`task ${task.id}: could not write a terminal row: ${(err as Error).message}`);
    }
  }
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}
