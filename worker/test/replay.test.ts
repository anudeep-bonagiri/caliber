import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Brief } from '../src/brief.js';
import { classifyDroidFailure, type DroidRun } from '../src/droid.js';
import { handleInvestigate } from '../src/investigate.js';
import { fixtureRecordedBy, loadFixture, replayOrStandIn, standInFinding } from '../src/replay.js';

const FIXTURES = path.resolve(__dirname, '..', '..', 'seed', 'fixtures', 'investigations');
const EVIDENCE = path.resolve(__dirname, '..', '..', 'seed', 'fixtures', 'evidence');
const noteTexts = (steps: ReadonlyArray<{ type: string; text?: string }>) => steps.filter(s => s.type === 'note').map(s => s.text ?? '');

let tmp: string;
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dl-replay-'));
  // the 2231 fixture cites swap_log.txt; the file check runs when the evidence dir exists
  fs.writeFileSync(path.join(tmp, 'swap_log.txt'), '08/27 Ortiz R. -> unit 22 (17 in shop)\n');
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const brief = (over: Partial<Brief> = {}): Brief => ({
  txnRef: '7777',
  kind: 'card',
  code: 'location_mismatch',
  cents: '41200',
  day: 41,
  evidence: { truckId: 17, driverId: 23, cardId: 'FC-02', stationName: "Love's 412", distanceMiles: 96.3, thresholdMiles: 25, gallons: 120, nearestPing: { lat: 29.42, lon: -98.49, deltaMin: 4 } },
  questionHint: 'Was this card used by a different truck or driver that day?',
  ...over,
});

describe('stand-in', () => {
  it('is returned when no fixture exists, labelled and sourced none', () => {
    const out = replayOrStandIn(brief(), tmp, tmp);
    expect(out.source).toBe('none');
    expect(out.finding.status).toBe('no_fixture');
    expect(out.finding.finding.startsWith('Scripted stand-in, not a model.')).toBe(true);
    expect(out.finding.finding).toContain('location_mismatch');
    expect(out.finding.finding).toContain('96.3');
    expect(out.finding.confidence).toBe(0.5);
    expect(out.finding.evidence.every(e => e.source === 'kernel')).toBe(true);
    expect(out.steps.at(-1)?.type).toBe('note');
  });

  it('recommends by code', () => {
    expect(standInFinding(brief({ code: 'capacity_exceeded' }))).toMatchObject({ recommendation: 'hold' });
    expect(standInFinding(brief({ code: 'vendor_bank_change' }))).toMatchObject({ recommendation: 'hold', question_for_controller: 'Call the vendor on a known number; who confirmed the new account?' });
    for (const code of ['location_mismatch', 'rate_variance', 'duplicate_invoice', 'short_received']) {
      const f = standInFinding(brief({ code }));
      expect(f.recommendation).toBe('hold_and_ask');
      expect(f.question_for_controller).toBe('Was this card used by a different truck or driver that day?');
    }
  });
});

describe('replay', () => {
  it('serves the 2231 fixture (recorded from a live Droid run) as replayed', () => {
    const fx = loadFixture(FIXTURES, '2231');
    expect(fx?.recorded).toBe(true);
    const out = replayOrStandIn(brief({ txnRef: '2231' }), FIXTURES, EVIDENCE);
    expect(out.source).toBe('replayed');
    expect(out.finding.status).toBe('replayed');
    // the decoy is a legitimate unit swap only a person can confirm: the recording asks, it does not clear
    expect(out.finding.recommendation).toBe('hold_and_ask');
    expect(out.finding.question_for_controller).toMatch(/^Can Ramon Ortiz .*truck 22 .*\?$/);
    expect(out.finding.confidence).toBe(0.97);
    expect(out.finding.evidence.some(e => e.source === 'swap_log.txt')).toBe(true);
    expect(out.finding.evidence.some(e => e.source === 'find_trips_near')).toBe(true);
    expect(out.steps.at(-2)).toMatchObject({ type: 'note', text: 'replayed from fixtures/investigations/2231.json' });
    expect(out.steps.some(s => s.type === 'tool_call' && s.name === 'elastic___find_trips_near')).toBe(true);
  });

  it('drops fixture evidence that does not match its source and fails closed without an evidence dir', () => {
    const missing = path.join(tmp, 'absent');
    const out = replayOrStandIn(brief({ txnRef: '2231' }), FIXTURES, missing);
    expect(out.source).toBe('replayed');
    // file sources cannot be verified without the evidence tree; the tool quote is checked against the fixture's own tool_result
    expect(out.finding.evidence.some(e => e.source === 'swap_log.txt')).toBe(false);
    expect(out.finding.evidence.some(e => e.source === 'find_trips_near')).toBe(true);
    const notes = noteTexts(out.steps);
    expect(notes.some(t => t.startsWith('evidence dropped: swap_log.txt unverifiable'))).toBe(true);
    expect(notes).toContain('replayed from fixtures/investigations/2231.json');
  });

  it('refuses a txnRef that is not a plain reference', () => {
    expect(loadFixture(FIXTURES, '../answer_key')).toBeUndefined();
  });
});

describe('recorded-run labels', () => {
  it('carries recordedAt and recordedBy from a live-recorded fixture and says so in a note', () => {
    const out = replayOrStandIn(brief({ txnRef: '2231' }), FIXTURES, EVIDENCE);
    expect(out.finding.recordedAt).toBe('2026-10-24T21:07:04.498Z');
    expect(out.finding.recordedBy).toBe('droid live run');
    expect(out.steps.at(-1)).toMatchObject({ type: 'note', text: 'replayed from a recording made 2026-10-24 by droid live run' });
  });

  it('labels a fixture with no live-run note as hand-written', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dl-handfx-'));
    try {
      fs.writeFileSync(path.join(dir, '8888.json'), JSON.stringify({
        recorded: true,
        note: 'Written by hand for the offline demo.',
        recordedAt: '2026-10-20T09:00:00Z',
        finding: { finding: 'Truck 17 was 96.3 miles away.', evidence: [{ source: 'kernel', ref: 'evidence.distanceMiles', quote: '96.3' }], recommendation: 'hold', confidence: 0.6 },
        steps: [{ type: 'note', at: '2026-10-20T09:00:00Z', text: 'hand-written' }],
      }));
      const out = replayOrStandIn(brief({ txnRef: '8888' }), dir, tmp);
      expect(out.source).toBe('replayed');
      expect(out.finding).toMatchObject({ recordedAt: '2026-10-20T09:00:00Z', recordedBy: 'hand-written' });
      expect(out.steps.at(-1)).toMatchObject({ type: 'note', text: 'replayed from a recording made 2026-10-20 by hand-written' });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reads a live run from the note or the first steps, not from the recorded flag', () => {
    const step = (text: string) => ({ type: 'note' as const, at: 'x', text });
    expect(fixtureRecordedBy({ note: 'Recorded from a live Droid run in WORKER_MODE=record.', steps: [] })).toBe('droid live run');
    expect(fixtureRecordedBy({ steps: [step('live droid run (record) for 2231')] })).toBe('droid live run');
    expect(fixtureRecordedBy({ note: 'Hand-written; recorded for the demo.', steps: [step('replayed')] })).toBe('hand-written');
  });
});

describe('handleInvestigate in replay mode', () => {
  const cfg = { mode: 'replay' as const, evidenceDir: path.join(os.tmpdir(), 'dl-no-evidence'), fixturesDir: '', taskTimeoutMs: 1000, kibanaUrl: '', elasticApiKey: '', costLog: '', anthropicApiKey: '' };

  it('returns the stand-in with the template explanation and the hint as the question', async () => {
    const r = await handleInvestigate(brief(), { cfg: { ...cfg, fixturesDir: tmp }, log: () => {} });
    expect(r.source).toBe('none');
    expect(r.recommendation).toBe('hold_and_ask');
    expect(r.question).toBe('Was this card used by a different truck or driver that day?');
    expect(r.finding.finding.startsWith('Scripted stand-in, not a model. ')).toBe(true);
    expect(r.steps.some(s => s.type === 'note' && s.text === 'explanation from template')).toBe(true);
  });

  it('falls back to replay when a live run throws', async () => {
    const r = await handleInvestigate(brief({ txnRef: '2231' }), {
      cfg: { ...cfg, mode: 'live', fixturesDir: FIXTURES },
      log: () => {},
      droid: async () => {
        throw new Error('factory down');
      },
    });
    expect(r.source).toBe('replayed');
    expect(r.finding.status).toBe('replayed');
    expect(r.finding.recordedBy).toBe('droid live run');
  });
});

// Task 8.7: a rate limit or server error is retried once, then deferred. Never replayed in its place.
describe('live failure handling', () => {
  const cfg = { mode: 'live' as const, evidenceDir: path.join(os.tmpdir(), 'dl-no-evidence'), fixturesDir: FIXTURES, taskTimeoutMs: 1000, kibanaUrl: '', elasticApiKey: '', costLog: '', anthropicApiKey: '' };

  const success = (structuredOutput: unknown): DroidRun => ({
    aborted: false,
    disabledToolIds: [],
    result: { type: 'result', subtype: 'success', success: true, structuredOutput, durationMs: 1234, tokenUsage: { inputTokens: 10, outputTokens: 20 }, error: null } as unknown as DroidRun['result'],
  });
  const resultError = (message: string): DroidRun => ({
    aborted: false,
    disabledToolIds: [],
    result: { type: 'result', subtype: 'error_during_execution', success: false, durationMs: 50, tokenUsage: null, error: { type: 'error', message, errorType: 'Error', timestamp: 'x' } } as unknown as DroidRun['result'],
  });
  const liveOutput = {
    finding: 'Truck 17 fuelled 96.3 miles from its last ping; no swap is on file.',
    evidence: [{ source: 'kernel', ref: 'evidence.distanceMiles', quote: '96.3 miles' }],
    recommendation: 'hold',
    confidence: 0.7,
    recordedBy: 'hand-written',
  };

  it('retries once after 5 s on a 429 and returns the live finding', async () => {
    let calls = 0;
    const waited: number[] = [];
    const r = await handleInvestigate(brief({ txnRef: '2231' }), {
      cfg,
      log: () => {},
      sleep: async ms => void waited.push(ms),
      droid: async () => {
        calls += 1;
        if (calls === 1) throw new Error('Factory API responded 429 Too Many Requests');
        return success(liveOutput);
      },
    });
    expect(calls).toBe(2);
    expect(waited).toEqual([5000]);
    expect(r.source).toBe('live');
    expect(r.finding.status).toBe('ok');
    expect(r.recommendation).toBe('hold');
    expect(r.finding.recordedBy).toBeUndefined();
    expect(noteTexts(r.steps).some(t => t.startsWith('investigator unavailable (HTTP 429 rate limit)') && t.endsWith('retrying once in 5 s'))).toBe(true);
    expect(noteTexts(r.steps).filter(t => t.startsWith('live droid run (live) for 2231'))).toHaveLength(2);
  });

  it('defers after two 5xx failures, waits 2 s, and does not replay the existing fixture', async () => {
    let calls = 0;
    const waited: number[] = [];
    const logs: string[] = [];
    const r = await handleInvestigate(brief({ txnRef: '2231' }), {
      cfg,
      log: m => logs.push(m),
      sleep: async ms => void waited.push(ms),
      droid: async () => {
        calls += 1;
        throw new Error('upstream returned HTTP 503 Service Unavailable');
      },
    });
    expect(calls).toBe(2);
    expect(waited).toEqual([2000]);
    expect(r.source).toBe('none');
    expect(r.finding.status).toBe('deferred');
    expect(r.finding.recommendation).toBe('hold');
    expect(r.recommendation).toBe('hold');
    expect(r.question).toBeUndefined();
    expect(r.finding.confidence).toBe(0);
    expect(r.finding.evidence).toEqual([]);
    expect(r.finding.finding.startsWith('Deferred: the investigator was unavailable (HTTP 503 server error). The hold stays open; no stand-in was written.')).toBe(true);
    expect(r.finding.recordedAt).toBeUndefined();
    expect(noteTexts(r.steps).some(t => t.startsWith('replayed from'))).toBe(false);
    expect(noteTexts(r.steps).at(-1)).toMatch(/^investigator unavailable again \(HTTP 503 server error\)/);
    expect(logs.some(m => m.includes('falling back'))).toBe(false);
  });

  it('treats an error_during_execution result as an API error and writes no fixture in record mode', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dl-recfx-'));
    try {
      const waited: number[] = [];
      const r = await handleInvestigate(brief(), {
        cfg: { ...cfg, mode: 'record', fixturesDir: dir },
        log: () => {},
        sleep: async ms => void waited.push(ms),
        droid: async () => resultError('stream closed'),
      });
      expect(waited).toEqual([2000]);
      expect(r.finding.status).toBe('deferred');
      expect(r.finding.finding).toContain('(API error during execution)');
      expect(fs.readdirSync(dir)).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('classifies 429 and 5xx messages and leaves other errors alone', () => {
    expect(classifyDroidFailure('rate limit exceeded')).toEqual({ kind: 'rate_limit', reason: 'HTTP 429 rate limit' });
    expect(classifyDroidFailure('status 502 Bad Gateway')).toEqual({ kind: 'server', reason: 'HTTP 502 server error' });
    expect(classifyDroidFailure('model overloaded')).toEqual({ kind: 'server', reason: 'HTTP 5xx server error' });
    expect(classifyDroidFailure('droid result error_during_execution', 'error_during_execution')).toMatchObject({ kind: 'server' });
    expect(classifyDroidFailure('factory down')).toBeUndefined();
    expect(classifyDroidFailure('droid aborted at the time limit')).toBeUndefined();
    expect(classifyDroidFailure('connection to port 5432 refused')).toBeUndefined();
  });
});
