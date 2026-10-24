// SpacetimeDB connection for the agent identity. Subscriptions feed a client cache the loop and the
// backtest read from; the three agent reducers are wrapped here and nowhere else.
import { DbConnection } from '../../module_bindings/index.js';
import type { AgentTask } from '../../module_bindings/types.js';
import type { Config } from './config.js';

export type Conn = DbConnection;

export const SUBSCRIPTIONS = [
  "SELECT * FROM agent_task WHERE status = 'open'",
  'SELECT * FROM match_result',
  'SELECT * FROM hold',
  'SELECT * FROM rule',
  'SELECT * FROM business_day',
] as const;

export interface Connected {
  conn: Conn;
  identityHex: string;
}

export function connect(cfg: Pick<Config, 'stdbUri' | 'stdbDb' | 'agentToken'>, log: (m: string) => void, timeoutMs = 15_000): Promise<Connected> {
  return new Promise((resolve, reject) => {
    let conn: Conn | undefined;
    const timer = setTimeout(() => {
      conn?.disconnect();
      reject(new Error(`connection to ${cfg.stdbUri} timed out`));
    }, timeoutMs);
    conn = DbConnection.builder()
      .withUri(cfg.stdbUri)
      .withDatabaseName(cfg.stdbDb)
      .withToken(cfg.agentToken)
      .withAutomaticReconnect()
      .onConnect((c, identity) => {
        clearTimeout(timer);
        resolve({ conn: c, identityHex: identity.toHexString() });
      })
      .onAutomaticReconnect((_c, identity) => log(`reconnected as ${identity.toHexString()}`))
      .onDisconnect((_ctx, error, attempt, delayMs) => log(attempt === undefined ? `disconnected${error ? `: ${error.message}` : ''}` : `disconnected; retry ${attempt} in ${delayMs} ms`))
      .onConnectError((_ctx, error) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      })
      .build();
  });
}

// Subscribe once; resolves when the initial rows are in the cache. Tasks already open arrive as inserts.
export function subscribe(conn: Conn, timeoutMs = 15_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('subscription did not apply in time')), timeoutMs);
    conn
      .subscriptionBuilder()
      .onApplied(() => {
        clearTimeout(timer);
        resolve();
      })
      .onError(ctx => {
        clearTimeout(timer);
        reject(ctx.event instanceof Error ? ctx.event : new Error(String(ctx.event)));
      })
      .subscribe([...SUBSCRIPTIONS]);
  });
}

export function openTasks(conn: Conn): AgentTask[] {
  return [...conn.db.agentTask.iter()].filter(t => t.status === 'open').sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function onOpenTask(conn: Conn, cb: (task: AgentTask) => void): void {
  conn.db.agentTask.onInsert((_ctx, row) => {
    if (row.status === 'open') cb(row);
  });
}

const LOST_RACE = ['task unavailable', 'stale claim'];

// True when this worker now owns the task. A lost race ('task unavailable', 'stale claim') returns false; other
// errors (role refused, disconnected) are thrown so the operator sees them.
export async function claim(conn: Conn, task: Pick<AgentTask, 'id' | 'version'>): Promise<boolean> {
  try {
    await conn.reducers.claimTask({ id: task.id, version: task.version });
    return true;
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    if (LOST_RACE.some(s => msg.includes(s))) return false;
    throw err;
  }
}

export interface RecordArgs {
  id: bigint;
  stepsJson: string;
  findingJson: string;
  recommendation: 'clear' | 'hold' | 'hold_and_ask' | 'timeout' | 'done';
  question?: string;
  source: 'live' | 'replayed' | 'none';
}

export function recordInvestigation(conn: Conn, a: RecordArgs): Promise<void> {
  return conn.reducers.recordInvestigation({
    id: a.id,
    stepsJson: a.stepsJson,
    findingJson: a.findingJson,
    recommendation: a.recommendation,
    question: a.question && a.question.trim() ? a.question : undefined,
    source: a.source,
  });
}

export interface CreateRuleArgs {
  sourceTxnRef: string;
  scopeJson: string;
  condition: string;
  backtestJson: string;
  uses: string;
  validFromDay: number;
  validToDay: number;
  reason: string;
}

export function createRule(conn: Conn, a: CreateRuleArgs): Promise<void> {
  return conn.reducers.createRule(a);
}

export function holdStatus(conn: Conn, txnRef: string): string | undefined {
  return conn.db.hold.txnRef.find(txnRef)?.status;
}

export function currentDay(conn: Conn): number | undefined {
  return conn.db.businessDay.id.find(1)?.day;
}
