import { describe, expect, it } from 'vitest';
import type { Brief } from '../src/brief.js';
import { backtest, decideDraft, handleDraftRule, isNegativeAnswer, type BacktestRow } from '../src/rules.js';

const base: Brief = {
  txnRef: '2231',
  kind: 'card',
  code: 'location_mismatch',
  cents: '41200',
  day: 41,
  evidence: { truckId: 17, driverId: 23, cardId: 'FC-02', distanceMiles: 96.3 },
  questionHint: '',
  question: 'Did Ramon Ortiz drive truck 22 on this day while truck 17 was in the shop?',
  answer: 'Yes, Ramon was in unit 22 that day, 17 was in the shop.',
};

const rows: BacktestRow[] = [
  { txnRef: '2231', code: 'location_mismatch', day: 41, evidence: { driverId: 23, truckId: 17 } },
  { txnRef: '2240', code: 'location_mismatch', day: 43, evidence: { driverId: 23, truckId: 17 } },
  { txnRef: '2250', code: 'location_mismatch', day: 45, evidence: { driverId: 23, truckId: 17 } },
  { txnRef: '2260', code: 'location_mismatch', day: 50, evidence: { driverId: 23, truckId: 17 } }, // outside window
  { txnRef: '2270', code: 'location_mismatch', day: 42, evidence: { driverId: 99, truckId: 5 } }, // other driver
  { txnRef: '2280', code: 'capacity_exceeded', day: 42, evidence: { driverId: 23, truckId: 17 } }, // other code
];
const holds: Record<string, string> = { '2231': 'answered', '2240': 'open', '2250': 'rejected', '2260': 'open', '2270': 'open' };

describe('backtest', () => {
  it('counts only rows with the code, inside the window, matching the scope', () => {
    const bt = backtest({ condition: 'location_mismatch', scope: { driverId: 23 }, validFromDay: 41, validToDay: 46 }, rows, ref => holds[ref]);
    expect(bt.n).toBe(3);
    expect(bt.wouldClear).toBe(3);
    expect(bt.openHoldsCovered).toBe(2);
    expect(bt.confirmedExceptionsCovered).toBe(1);
    expect(bt.trueExceptionsCleared).toBe(1);
    expect(bt.window).toEqual({ fromDay: 41, toDay: 46 });
  });
  it('is zero when nothing matches', () => {
    const bt = backtest({ condition: 'rate_variance', scope: { vendorId: 3 }, validFromDay: 41, validToDay: 46 }, rows, () => undefined);
    expect(bt.n).toBe(0);
    expect(bt.trueExceptionsCleared).toBe(0);
  });
});

describe('decideDraft', () => {
  it('drafts a one_time driver-scoped rule for a positive location_mismatch answer', () => {
    const d = decideDraft(base);
    expect(d.kind).toBe('draft');
    if (d.kind !== 'draft') return;
    expect(d.rule).toMatchObject({ condition: 'location_mismatch', scope: { driverId: 23 }, uses: 'one_time', validFromDay: 41, validToDay: 46 });
  });
  it('drafts a standing rule when the answer says always', () => {
    const d = decideDraft({ ...base, answer: 'He always takes unit 22 when 17 is in the shop' });
    expect(d.kind === 'draft' && d.rule.uses).toBe('standing');
    expect(d.kind === 'draft' && d.rule.validToDay).toBe(71);
  });
  it('scopes rate_variance to the vendor', () => {
    const d = decideDraft({ ...base, code: 'rate_variance', evidence: { vendorId: 3 }, answer: 'Yes, the surcharge was agreed by email' });
    expect(d.kind === 'draft' && d.rule.scope).toEqual({ vendorId: 3 });
  });
  it('never drafts for forbidden codes or per-invoice codes', () => {
    expect(decideDraft({ ...base, code: 'vendor_bank_change', answer: 'Yes, confirmed' }).kind).toBe('forbidden');
    expect(decideDraft({ ...base, code: 'duplicate_invoice', answer: 'Pay the first one' }).kind).toBe('no_rule');
  });
});

describe('negative answers', () => {
  it.each(['No, that was not ours', 'fraud, reject it', "He didn't drive that day", 'Ramon never had unit 22', 'did not happen'])('detects %s', a => {
    expect(isNegativeAnswer(a)).toBe(true);
  });
  it('does not flag a plain yes', () => {
    expect(isNegativeAnswer('Yes, Ramon took 22 while 17 was in the shop')).toBe(false);
  });

  it('records hold and does not call createRule on a negative answer', async () => {
    let created = 0;
    const r = await handleDraftRule({ ...base, answer: 'No, that card was not ours that day' }, {
      matchResults: () => rows,
      holdStatus: ref => holds[ref],
      createRule: async () => {
        created += 1;
      },
    });
    expect(created).toBe(0);
    expect(r.recommendation).toBe('hold');
    expect(r.finding.finding).toBe('Controller confirmed the exception; recommend reject');
  });
});

describe('handleDraftRule', () => {
  it('refuses to create a rule when the backtest clears a confirmed exception', async () => {
    let created = 0;
    const r = await handleDraftRule(base, { matchResults: () => rows, holdStatus: ref => holds[ref], createRule: async () => void (created += 1) });
    expect(created).toBe(0);
    expect(r.recommendation).toBe('hold');
    expect(r.finding.backtest?.trueExceptionsCleared).toBe(1);
  });

  it('creates a candidate rule and records done when the backtest is clean', async () => {
    const calls: unknown[] = [];
    const cleanHolds: Record<string, string> = { ...holds, '2250': 'open' };
    const r = await handleDraftRule(base, { matchResults: () => rows, holdStatus: ref => cleanHolds[ref], createRule: async a => void calls.push(a) });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ sourceTxnRef: '2231', condition: 'location_mismatch', uses: 'one_time', validFromDay: 41, validToDay: 46, scopeJson: '{"driverId":23}' });
    expect(r.recommendation).toBe('done');
    expect(r.finding.finding).toMatch(/^Drafted rule for controller approval/);
    expect(r.finding.backtest?.n).toBe(3);
  });

  it('falls back to the deterministic window when the model answer is invalid', async () => {
    const calls: Array<{ validToDay: number; uses: string }> = [];
    const cleanHolds: Record<string, string> = { ...holds, '2250': 'open' };
    await handleDraftRule(base, { matchResults: () => rows, holdStatus: ref => cleanHolds[ref], createRule: async a => void calls.push(a), ask: async () => '{"uses":"standing","toDay":999}' });
    expect(calls[0]).toMatchObject({ uses: 'one_time', validToDay: 46 });
  });
});
