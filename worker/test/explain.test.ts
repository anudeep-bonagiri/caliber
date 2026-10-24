import { describe, expect, it } from 'vitest';
import type { Brief } from '../src/brief.js';
import { digitsAreGrounded, explain, templateExplanation, withExplanation } from '../src/explain.js';
import { standInFinding } from '../src/replay.js';

const brief: Brief = {
  txnRef: '2231',
  kind: 'card',
  code: 'location_mismatch',
  cents: '41200',
  day: 41,
  date: '2026-08-27',
  evidence: {
    truckId: 17,
    driverId: 23,
    driverName: 'Ramon Ortiz',
    plate: 'TX-1017',
    cardId: 'FC-02',
    stationName: "Love's 412, Schulenburg TX",
    stationLat: 29.68,
    stationLon: -96.9,
    nearestPing: { lat: 29.42, lon: -98.49, deltaMin: 4, engineOn: false, odometer: 183210.4 },
    distanceMiles: 96.3,
    thresholdMiles: 25,
    gallons: 120,
    merchant: 'LOVES #412',
  },
  questionHint: 'Was this card used by a different truck or driver that day?',
};

describe('digitsAreGrounded', () => {
  const evidenceJson = JSON.stringify(brief);
  it('accepts text whose digits all appear in the evidence', () => {
    expect(digitsAreGrounded('Truck 17 was 96.3 miles away, above 25 miles.', evidenceJson)).toBe(true);
  });
  it('rejects text with an invented digit sequence', () => {
    expect(digitsAreGrounded('Truck 17 was 96.3 miles away, about 155 km.', evidenceJson)).toBe(false);
  });
});

describe('explain', () => {
  it('uses the template when no key and no asker are given', async () => {
    const e = await explain(brief, {});
    expect(e.source).toBe('template');
    expect(e.text).toBe(templateExplanation(brief));
    expect(e.text).toContain('96.3');
  });

  it('rejects model prose that contains digits not in the evidence and falls back', async () => {
    const e = await explain(brief, { ask: async () => 'Truck 17 fueled 120 gallons 96.3 miles from its ping. The station is about 155 km from the yard.' });
    expect(e.source).toBe('template');
  });

  it('accepts model prose whose digits are all grounded', async () => {
    const e = await explain(brief, { ask: async () => 'Truck 17 fueled 120 gallons at a station 96.3 miles from its nearest ping. The 25 mile threshold was exceeded, so the hold stands.' });
    expect(e.source).toBe('model');
  });

  it('puts the sentence into a stand-in finding behind the label', () => {
    const f = withExplanation(standInFinding(brief), { text: 'Two sentences.', source: 'template' });
    expect(f.finding.startsWith('Scripted stand-in, not a model. Two sentences.')).toBe(true);
    expect(f.status).toBe('no_fixture');
  });
});
