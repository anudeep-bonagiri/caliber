import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Brief } from '../src/brief.js';
import { handleInvestigate } from '../src/investigate.js';
import { loadFixture, replayOrStandIn, standInFinding } from '../src/replay.js';

const FIXTURES = path.resolve(__dirname, '..', '..', 'seed', 'fixtures', 'investigations');

let tmp: string;
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dl-replay-'));
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
  it('serves the hand-written 2231 fixture as replayed', () => {
    const fx = loadFixture(FIXTURES, '2231');
    expect(fx?.recorded).toBe(true);
    const out = replayOrStandIn(brief({ txnRef: '2231' }), FIXTURES, tmp);
    expect(out.source).toBe('replayed');
    expect(out.finding.status).toBe('replayed');
    expect(out.finding.recommendation).toBe('hold_and_ask');
    expect(out.finding.confidence).toBe(0.86);
    expect(out.steps.at(-1)).toMatchObject({ type: 'note', text: 'replayed from fixtures/investigations/2231.json' });
    expect(out.steps.some(s => s.type === 'tool_call' && s.name === 'find_trips_near')).toBe(true);
  });

  it('refuses a txnRef that is not a plain reference', () => {
    expect(loadFixture(FIXTURES, '../answer_key')).toBeUndefined();
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
  });
});
