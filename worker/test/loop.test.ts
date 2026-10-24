import { describe, expect, it } from 'vitest';
import type { AgentTask } from '../../module_bindings/types.js';
import type { Config } from '../src/config.js';
import { FINDING_SOFT_LIMIT, STEPS_SOFT_LIMIT, WorkerLoop, fitSteps, toRecord, writeTerminal, type LoopDeps } from '../src/loop.js';
import type { Step } from '../src/replay.js';
import type { Conn, RecordArgs } from '../src/stdb.js';

const record = (over: Partial<RecordArgs> = {}): RecordArgs => ({ id: 7n, stepsJson: '[]', findingJson: '{}', recommendation: 'hold', source: 'replayed', ...over });
const fallback = () => record({ recommendation: 'timeout', source: 'none', findingJson: '{"status":"timeout"}' });

function fakeWrite(errors: Array<string | undefined>) {
  const calls: RecordArgs[] = [];
  const write = async (r: RecordArgs) => {
    calls.push(r);
    const e = errors.shift();
    if (e) throw new Error(e);
  };
  return { write, calls };
}

function sleeps() {
  const waited: number[] = [];
  return { waited, sleep: async (ms: number) => void waited.push(ms) };
}

describe('writeTerminal retries', () => {
  it('retries a transient failure with 250 ms doubling backoff and succeeds', async () => {
    const { write, calls } = fakeWrite(['disconnected', 'disconnected', 'disconnected']);
    const { waited, sleep } = sleeps();
    expect(await writeTerminal(write, record(), fallback, () => {}, sleep)).toBe('written');
    expect(calls).toHaveLength(4);
    expect(waited).toEqual([250, 500, 1000]);
  });

  it('makes 5 attempts, then 5 more with the minimal timeout row', async () => {
    const { write, calls } = fakeWrite(Array(9).fill('disconnected'));
    const { waited, sleep } = sleeps();
    expect(await writeTerminal(write, record(), fallback, () => {}, sleep)).toBe('fallback_written');
    expect(calls).toHaveLength(10);
    expect(calls.slice(0, 5).every(c => c.recommendation === 'hold')).toBe(true);
    expect(calls[9].recommendation).toBe('timeout');
    expect(waited).toEqual([250, 500, 1000, 2000, 250, 500, 1000, 2000]);
  });

  it('stops retrying when the task is no longer claimed and logs that another write landed', async () => {
    const { write, calls } = fakeWrite(['task is timeout']);
    const logs: string[] = [];
    expect(await writeTerminal(write, record(), fallback, m => logs.push(m), sleeps().sleep)).toBe('already_terminal');
    expect(calls).toHaveLength(1);
    expect(logs.join('\n')).toMatch(/another terminal write already landed/);
  });

  it('goes straight to the minimal row when the payload is refused', async () => {
    const { write, calls } = fakeWrite(['payload too large']);
    expect(await writeTerminal(write, record(), fallback, () => {}, sleeps().sleep)).toBe('fallback_written');
    expect(calls.map(c => c.recommendation)).toEqual(['hold', 'timeout']);
  });
});

describe('ambiguous terminal writes', () => {
  it('treats task is investigated after a lost reply as success and never writes the fallback', async () => {
    // attempt 1 committed on the server but the reply was lost; attempt 2 is refused as a second terminal write
    const { write, calls } = fakeWrite(['connection reset', 'task is investigated']);
    let fallbackBuilt = 0;
    const outcome = await writeTerminal(write, record(), () => (fallbackBuilt++, fallback()), () => {}, sleeps().sleep);
    expect(outcome).toBe('already_terminal');
    expect(calls).toHaveLength(2);
    expect(calls.every(c => c.recommendation === 'hold')).toBe(true);
    expect(fallbackBuilt).toBe(0);
  });
});

describe('payload limits', () => {
  const at = '2026-10-24T00:00:00.000Z';
  it('caps tool_result content at 4000 characters with a marker', () => {
    const [s] = fitSteps([{ type: 'tool_result', at, toolUseId: 't', toolName: 'Read', content: 'x'.repeat(10_000), isError: false }]);
    expect(s.type === 'tool_result' && s.content.length).toBe(4000);
    expect(s.type === 'tool_result' && s.content.endsWith(' [truncated]')).toBe(true);
  });

  it('cuts the middle of an oversize steps array, keeping the first 10 and last 20', () => {
    const steps: Step[] = Array.from({ length: 200 }, (_, i) => ({ type: 'assistant', at, text: `${i} ${'y'.repeat(1990)}` }));
    expect(JSON.stringify(steps).length).toBeGreaterThan(STEPS_SOFT_LIMIT);
    const out = fitSteps(steps);
    expect(JSON.stringify(out).length).toBeLessThanOrEqual(STEPS_SOFT_LIMIT);
    expect(out).toHaveLength(31);
    expect(out[0]).toEqual(steps[0]);
    expect(out[9]).toEqual(steps[9]);
    expect(out[10]).toMatchObject({ type: 'note', text: '170 steps omitted to fit the ledger' });
    expect(out[30]).toEqual(steps[199]);
  });

  it('shrinks oversize single steps when cutting the middle is not enough', () => {
    const steps: Step[] = Array.from({ length: 25 }, (_, i) => ({ type: 'tool_call', at, name: 'Grep', toolUseId: `t${i}`, input: { blob: 'z'.repeat(20_000) } }));
    const out = fitSteps(steps);
    expect(out).toHaveLength(25);
    expect(JSON.stringify(out).length).toBeLessThanOrEqual(STEPS_SOFT_LIMIT);
  });

  it('keeps finding_json under 45,000 characters and adds a note', () => {
    // control characters escape to six characters each in JSON
    const evidence = Array.from({ length: 30 }, () => ({ source: 'kernel', ref: 'evidence.x', quote: '\u0001'.repeat(400) }));
    const r = toRecord({
      id: 1n,
      steps: [],
      finding: { finding: 'f'.repeat(1000), evidence, recommendation: 'hold', confidence: 0.5, status: 'ok' },
      recommendation: 'hold',
      source: 'live',
    });
    expect(r.findingJson.length).toBeLessThan(FINDING_SOFT_LIMIT);
    const f = JSON.parse(r.findingJson);
    expect(f.recommendation).toBe('hold');
    expect(f.evidence.length).toBeLessThan(30);
    expect(JSON.parse(r.stepsJson).at(-1).text).toMatch(/^finding_json shortened/);
  });

  it('always writes a finding recommendation of clear, hold or hold_and_ask, whatever the outcome', () => {
    for (const outcome of ['done', 'timeout'] as const) {
      const r = toRecord({ id: 1n, steps: [], finding: { finding: 'x', evidence: [], recommendation: outcome, confidence: 1, status: 'ok' }, recommendation: outcome, source: 'none' });
      expect(r.recommendation).toBe(outcome);
      expect(['clear', 'hold', 'hold_and_ask']).toContain(JSON.parse(r.findingJson).recommendation);
    }
  });
});

// ---------------------------------------------------------------------------
// WorkerLoop against an in-memory connection
// ---------------------------------------------------------------------------
const ME = 'c0ffee';
const brief = {
  txnRef: '7777',
  kind: 'card',
  code: 'location_mismatch',
  cents: '41200',
  day: 41,
  evidence: { truckId: 17, driverId: 23, cardId: 'FC-02', stationName: "Love's 412", distanceMiles: 96.3, thresholdMiles: 25, gallons: 120 },
  questionHint: 'Was this card used by a different truck or driver that day?',
};

function task(over: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 1n,
    txnRef: '7777',
    kind: 'investigate',
    status: 'open',
    version: 0,
    claimedBy: undefined,
    claimedAt: undefined,
    briefJson: JSON.stringify(brief),
    stepsJson: '[]',
    findingJson: '',
    source: 'none',
    createdDay: 41,
    createdAt: { microsSinceUnixEpoch: 0n },
    updatedAt: { microsSinceUnixEpoch: 0n },
    ...over,
  } as unknown as AgentTask;
}

function fakeConn(rows: AgentTask[]): Conn {
  return {
    isActive: true,
    db: {
      agentTask: { iter: () => rows.values(), onInsert: () => {} },
      matchResult: { iter: () => [].values() },
      hold: { txnRef: { find: () => undefined } },
    },
  } as unknown as Conn;
}

const cfg = (over: Partial<Config> = {}): Config => ({
  stdbUri: '',
  stdbDb: '',
  agentToken: 'x',
  mode: 'replay',
  requestedMode: 'replay',
  factoryApiKey: '',
  anthropicApiKey: '',
  kibanaUrl: '',
  elasticApiKey: '',
  evidenceDir: '/nonexistent',
  fixturesDir: '/nonexistent',
  costLog: '',
  pauseFile: '/nonexistent/PAUSE',
  concurrency: 2,
  taskTimeoutMs: 30,
  taskGraceMs: 0,
  pollMs: 60_000,
  ...over,
});

function loop(over: Partial<LoopDeps> & { rows?: AgentTask[] } = {}) {
  const written: RecordArgs[] = [];
  const logs: string[] = [];
  let claims = 0;
  const l = new WorkerLoop({
    conn: fakeConn(over.rows ?? []),
    cfg: cfg(),
    log: m => logs.push(m),
    identityHex: ME,
    sleep: async () => {},
    ...over,
    api: {
      claim: async () => (claims++, true),
      recordInvestigation: async (_conn, r) => void written.push(r),
      createRule: async () => {},
      ...over.api,
    },
  });
  return { l, written, logs, claims: () => claims };
}

describe('WorkerLoop timeout', () => {
  it('aborts the handler and writes the stand-in with source none and status timeout', async () => {
    let signal: AbortSignal | undefined;
    const { l, written } = loop({
      investigate: (_b, deps) =>
        new Promise((_resolve, reject) => {
          signal = deps.signal;
          deps.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    });
    await l.runTask(task());
    expect(signal?.aborted).toBe(true);
    expect(written).toHaveLength(1);
    const r = written[0];
    expect(r.recommendation).toBe('timeout');
    expect(r.source).toBe('none');
    const f = JSON.parse(r.findingJson);
    expect(f.status).toBe('timeout');
    expect(f.model).toBe('stand-in');
    expect(f.recommendation).toBe('hold_and_ask');
    expect(f.finding.startsWith('Scripted stand-in, not a model. Investigation did not finish (task exceeded 30 ms).')).toBe(true);
    expect(f.finding).toContain('96.3');
    expect(f.evidence.every((e: { source: string }) => e.source === 'kernel')).toBe(true);
    expect(r.question).toBe(brief.questionHint);
  });

  it('writes the result of a handler that finishes in time', async () => {
    const { l, written } = loop({
      investigate: async () => ({ finding: { finding: 'ok', evidence: [], recommendation: 'hold', confidence: 0.9, status: 'replayed' }, steps: [], source: 'replayed', recommendation: 'hold' }),
    });
    await l.runTask(task());
    expect(written.map(w => [w.recommendation, w.source])).toEqual([['hold', 'replayed']]);
  });
});

describe('WorkerLoop recovery and shutdown', () => {
  it('re-processes tasks left claimed by this identity without claiming them again, one log line each', async () => {
    const mine = task({ id: 5n, status: 'claimed', claimedBy: { toHexString: () => ME } as never });
    const theirs = task({ id: 6n, status: 'claimed', claimedBy: { toHexString: () => 'other' } as never });
    const { l, written, logs, claims } = loop({
      rows: [mine, theirs],
      investigate: async () => ({ finding: { finding: 'ok', evidence: [], recommendation: 'hold', confidence: 0.9, status: 'replayed' }, steps: [], source: 'replayed', recommendation: 'hold' }),
    });
    l.start();
    await l.stop();
    expect(claims()).toBe(0);
    expect(written.map(w => w.id)).toEqual([5n]);
    expect(logs.filter(m => m.includes('recovering'))).toEqual(['task 5 7777: recovering investigate task left claimed by this identity']);
  });

  it('stop waits for an in-flight terminal write instead of a fixed 5 s', async () => {
    let release!: () => void;
    const gate = new Promise<void>(r => (release = r));
    const { l, written } = loop({
      rows: [task()],
      cfg: cfg({ taskTimeoutMs: 10_000 }),
      investigate: async () => {
        await gate;
        return { finding: { finding: 'ok', evidence: [], recommendation: 'hold', confidence: 0.9, status: 'replayed' }, steps: [], source: 'replayed', recommendation: 'hold' };
      },
    });
    l.start();
    const stopped = l.stop();
    setTimeout(release, 50);
    await stopped;
    expect(written).toHaveLength(1);
  });
});
