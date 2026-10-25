import fs from 'node:fs';
import path from 'node:path';
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

// Council item 1 (Task 28): the backtest reads match_result and hold rows only, never the answer key.
describe('backtest provenance', () => {
  const SRC = path.resolve(__dirname, '..', 'src');
  const read = (f: string) => fs.readFileSync(path.join(SRC, f), 'utf8');
  const code = (text: string) => text.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

  it('takes only a rule, match_result rows and a hold status lookup', () => {
    expect(backtest.length).toBe(3);
    const rules = read('rules.ts');
    const imports = [...rules.matchAll(/^import .* from '([^']+)';$/gm)].map(m => m[1]);
    expect(imports.sort()).toEqual(['./brief.js', './config.js', './finding.js', './replay.js', 'zod']);
    expect(code(rules)).not.toMatch(/answer_key|node:fs|readFile/);
  });

  it('is wired to conn.db.matchResult and conn.db.hold in the worker loop', () => {
    const loop = read('loop.ts');
    expect(loop).toContain('matchResults: () => matchResultRows(conn),');
    expect(loop).toContain('holdStatus: ref => holdStatus(conn, ref),');
    expect(loop).toMatch(/function matchResultRows\(conn: Conn\): BacktestRow\[\] \{[\s\S]*?for \(const r of conn\.db\.matchResult\.iter\(\)\)/);
    expect(read('stdb.ts')).toMatch(/export function holdStatus\(conn: Conn, txnRef: string\): string \| undefined \{\s*return conn\.db\.hold\.txnRef\.find\(txnRef\)\?\.status;/);
  });

  it('no worker source file reads the answer key', () => {
    for (const f of fs.readdirSync(SRC).filter(n => n.endsWith('.ts'))) {
      expect(code(read(f)), f).not.toMatch(/answer_key/);
    }
  });

  it('counts as confirmed only holds the controller rejected, whatever else a row carries', () => {
    const scope = { condition: 'location_mismatch', scope: { driverId: 23 }, validFromDay: 41, validToDay: 46 };
    const tagged: BacktestRow[] = rows.map(r => ({ ...r, evidence: { ...r.evidence, planted: true, expected: 'hold' } }));
    const plain = backtest(scope, rows, ref => holds[ref]);
    const withTags = backtest(scope, tagged, ref => holds[ref]);
    expect({ ...withTags, computedAt: '' }).toEqual({ ...plain, computedAt: '' });
    for (const status of ['open', 'awaiting_controller', 'answered', 'released', 'cleared_by_rule', undefined]) {
      expect(backtest(scope, rows, () => status).confirmedExceptionsCovered).toBe(0);
    }
    expect(backtest(scope, rows, () => 'rejected').confirmedExceptionsCovered).toBe(3);
  });
});
