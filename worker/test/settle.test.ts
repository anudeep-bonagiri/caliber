import { describe, expect, it } from 'vitest';
import { NessieClient, NessieError, centsToDollars, createdId, type Bank, type TransferArgs } from '../src/nessie.js';
import { SETTLE_CONCURRENCY, SettlementWatcher, offlineId, payeeFor, resolveSettleMode, type NessieAccounts, type SettleLedger, type SettleMode, type SettlePayment } from '../src/settle.js';

const ACCOUNTS: NessieAccounts = { carrierAccountId: 'acct-carrier', fuelTollsAccountId: 'acct-fuel', vendors: { '3': 'acct-v3', '5': 'acct-v5' } };

function fakeLedger(rows: SettlePayment[], vendors: Record<string, number> = {}, refusals: Record<string, string> = {}) {
  const table = new Map(rows.map(r => [r.txnRef, { ...r }]));
  const writes: Array<{ txnRef: string; bankTxnId: string }> = [];
  let insert: ((p: SettlePayment) => void) | undefined;
  const ledger: SettleLedger = {
    payments: () => [...table.values()],
    payment: ref => table.get(ref),
    onPayment: cb => void (insert = cb),
    vendorIdOf: ref => vendors[ref],
    recordSettlement: async (txnRef, bankTxnId) => {
      writes.push({ txnRef, bankTxnId });
      const why = refusals[txnRef];
      if (why) throw new Error(why);
      const row = table.get(txnRef);
      if (!row) throw new Error('no payment to settle');
      if (row.bankTxnId !== undefined) throw new Error(`already settled as ${row.bankTxnId}`);
      row.bankTxnId = bankTxnId;
    },
  };
  const add = (p: SettlePayment) => {
    table.set(p.txnRef, { ...p });
    insert?.(p);
  };
  return { ledger, writes, add, table };
}

function fakeBank(fail: Array<Error | undefined> = []) {
  const calls: TransferArgs[] = [];
  let n = 0;
  let active = 0;
  let peak = 0;
  const bank: Bank = {
    transfer: async a => {
      calls.push(a);
      active++;
      peak = Math.max(peak, active);
      await new Promise(r => setTimeout(r, 2));
      active--;
      const e = fail.shift();
      if (e) throw e;
      return `nessie-${++n}`;
    },
  };
  return { bank, calls, peak: () => peak };
}

const live = (bank: Bank): SettleMode => ({ kind: 'live', bank, accounts: ACCOUNTS });
const noSleep = async () => {};

function watcher(ledger: SettleLedger, mode: SettleMode, logs: string[] = []) {
  return new SettlementWatcher({ ledger, mode, log: m => logs.push(m), sleep: noSleep, sweepMs: 0 });
}

describe('settlement watcher', () => {
  it('live: transfers to the vendor payee and writes the returned bank id', async () => {
    const { ledger, writes } = fakeLedger([{ txnRef: 'INV-1077', cents: 98012n }], { 'INV-1077': 3 });
    const { bank, calls } = fakeBank();
    const w = watcher(ledger, live(bank));
    w.start();
    await w.idle();
    expect(calls).toEqual([{ fromAccount: 'acct-carrier', toAccount: 'acct-v3', cents: 98012n, description: 'txn_ref INV-1077' }]);
    expect(writes).toEqual([{ txnRef: 'INV-1077', bankTxnId: 'nessie-1' }]);
  });

  it('offline: writes offline-<txnRef> and never calls a bank', async () => {
    const { ledger, writes } = fakeLedger([{ txnRef: '2231', cents: 41200n }, { txnRef: 'T1042', cents: 650n }]);
    const w = watcher(ledger, { kind: 'offline', reason: 'NESSIE_API_KEY is empty' });
    w.start();
    await w.idle();
    expect(writes).toEqual([
      { txnRef: '2231', bankTxnId: offlineId('2231') },
      { txnRef: 'T1042', bankTxnId: 'offline-T1042' },
    ]);
  });

  it('treats the refusal "already settled" as success', async () => {
    const { ledger } = fakeLedger([{ txnRef: '2231', cents: 41200n }], {}, { '2231': 'already settled as nessie-9' });
    const w = watcher(ledger, { kind: 'offline', reason: 'test' });
    expect(await w.settleOne({ txnRef: '2231', cents: 41200n })).toBe('already_settled');
  });

  it('a payment without a vendor id goes to the fuel-and-tolls payee', async () => {
    const { ledger, writes } = fakeLedger([{ txnRef: 'T1042', cents: 650n }]);
    const { bank, calls } = fakeBank();
    const w = watcher(ledger, live(bank));
    w.start();
    await w.idle();
    expect(calls[0].toAccount).toBe('acct-fuel');
    expect(writes[0]).toEqual({ txnRef: 'T1042', bankTxnId: 'nessie-1' });
    expect(payeeFor(ACCOUNTS, undefined)?.label).toBe('fuel and tolls');
  });

  it('skips rows that already carry a bank id and picks up later inserts', async () => {
    const { ledger, writes, add } = fakeLedger([{ txnRef: '1', cents: 100n, bankTxnId: 'nessie-old' }]);
    const w = watcher(ledger, { kind: 'offline', reason: 'test' });
    w.start();
    add({ txnRef: '2', cents: 200n });
    await w.idle();
    expect(writes).toEqual([{ txnRef: '2', bankTxnId: 'offline-2' }]);
  });

  it('retries a failed Nessie call once, then succeeds', async () => {
    const { ledger, writes } = fakeLedger([{ txnRef: '7', cents: 100n }]);
    const { bank, calls } = fakeBank([new NessieError('network', 'reset')]);
    const w = watcher(ledger, live(bank));
    w.start();
    await w.idle();
    expect(calls).toHaveLength(2);
    expect(writes).toEqual([{ txnRef: '7', bankTxnId: 'nessie-1' }]);
  });

  it('gives up after the retry and writes nothing, so a fake id never lands', async () => {
    const { ledger, writes } = fakeLedger([{ txnRef: '7', cents: 100n }]);
    const { bank, calls } = fakeBank([new NessieError('http', '502', 502), new NessieError('http', '502', 502)]);
    const w = watcher(ledger, live(bank));
    expect(await w.settleOne({ txnRef: '7', cents: 100n })).toBe('failed');
    expect(calls).toHaveLength(2);
    expect(writes).toEqual([]);
  });

  it('does not retry a 4xx refusal', async () => {
    const { ledger } = fakeLedger([{ txnRef: '7', cents: 100n }]);
    const { bank, calls } = fakeBank([new NessieError('http', 'bad body', 400)]);
    expect(await watcher(ledger, live(bank)).settleOne({ txnRef: '7', cents: 100n })).toBe('failed');
    expect(calls).toHaveLength(1);
  });

  it('re-records the same bank id after a failed write instead of transferring twice', async () => {
    const { ledger, writes } = fakeLedger([{ txnRef: '7', cents: 100n }], {}, { '7': 'disconnected' });
    const { bank, calls } = fakeBank();
    const w = watcher(ledger, live(bank));
    expect(await w.settleOne({ txnRef: '7', cents: 100n })).toBe('failed');
    const { ledger: again, writes: rewrites } = fakeLedger([{ txnRef: '7', cents: 100n }]);
    ledger.recordSettlement = again.recordSettlement;
    ledger.payment = again.payment;
    expect(await w.settleOne({ txnRef: '7', cents: 100n })).toBe('settled');
    expect(calls).toHaveLength(1);
    expect([...writes, ...rewrites].map(x => x.bankTxnId)).toEqual(['nessie-1', 'nessie-1']);
  });

  it('leaves an invoice unsettled when its vendor has no account or no vendor id', async () => {
    const { ledger, writes } = fakeLedger([{ txnRef: 'INV-9', cents: 100n }, { txnRef: 'INV-10', cents: 100n }], { 'INV-9': 4 });
    const { bank, calls } = fakeBank();
    const w = watcher(ledger, live(bank));
    expect(await w.settleOne({ txnRef: 'INV-9', cents: 100n })).toBe('skipped');
    expect(await w.settleOne({ txnRef: 'INV-10', cents: 100n })).toBe('skipped');
    expect(calls).toEqual([]);
    expect(writes).toEqual([]);
  });

  it(`runs at most ${SETTLE_CONCURRENCY} bank calls at once`, async () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({ txnRef: String(i + 1), cents: 100n }));
    const { ledger, writes } = fakeLedger(rows);
    const { bank, peak } = fakeBank();
    const w = watcher(ledger, live(bank));
    w.start();
    await w.idle();
    expect(writes).toHaveLength(12);
    expect(peak()).toBe(SETTLE_CONCURRENCY);
  });
});

describe('settle mode', () => {
  const n = { apiKey: 'k', base: 'https://api.nessieisreal.com', accountsFile: '/nope.json' };
  it('is offline without a key, in replay, or without seeded accounts', () => {
    expect(resolveSettleMode({ ...n, apiKey: '' }, 'live', () => ACCOUNTS).kind).toBe('offline');
    expect(resolveSettleMode(n, 'replay', () => ACCOUNTS).kind).toBe('offline');
    expect(resolveSettleMode(n, 'live', () => undefined).kind).toBe('offline');
    expect(resolveSettleMode(n, 'record', () => ACCOUNTS).kind).toBe('live');
  });
});

describe('nessie client', () => {
  function fakeFetch(responses: Array<{ status: number; body: string }>) {
    const seen: Array<{ url: string; body: Record<string, unknown> }> = [];
    const f = (async (url: string, init: RequestInit) => {
      seen.push({ url, body: JSON.parse(String(init.body)) });
      const r = responses.shift()!;
      return new Response(r.body, { status: r.status });
    }) as unknown as typeof fetch;
    return { f, seen };
  }

  it('posts the documented shape in dollars and returns objectCreated._id', async () => {
    const { f, seen } = fakeFetch([{ status: 201, body: '{"code":201,"objectCreated":{"_id":"tr-1"}}' }]);
    const c = new NessieClient({ apiKey: 'SECRET', base: 'https://x.test/', fetchImpl: f, today: () => '2026-10-24' });
    expect(await c.transfer({ fromAccount: 'a1', toAccount: 'a2', cents: 41237n, description: 'txn_ref 2231' })).toBe('tr-1');
    expect(seen[0].url).toBe('https://x.test/accounts/a1/transfers?key=SECRET');
    expect(seen[0].body).toEqual({ medium: 'balance', payee_id: 'a2', amount: 412.37, transaction_date: '2026-10-24', description: 'txn_ref 2231' });
  });

  it('switches to the compact shape when the server refuses medium and payee_id', async () => {
    const { f, seen } = fakeFetch([
      { status: 400, body: '"2 validation errors for TransferCreate\\nmedium\\n  extra fields not permitted"' },
      { status: 201, body: '{"objectCreated":{"_id":"tr-2"}}' },
      { status: 201, body: '{"objectCreated":{"_id":"tr-3"}}' },
    ]);
    const c = new NessieClient({ apiKey: 'SECRET', base: 'https://x.test', fetchImpl: f, today: () => '2026-10-24' });
    expect(await c.transfer({ fromAccount: 'a1', toAccount: 'a2', cents: 41237n, description: 'txn_ref 2231' })).toBe('tr-2');
    expect(seen[1].body).toEqual({ amount: 412, transaction_date: '2026-10-24', status: 'pending', description: 'txn_ref 2231 payee a2 amount $412.37' });
    expect(await c.transfer({ fromAccount: 'a1', toAccount: 'a2', cents: 100n, description: 'txn_ref 2' })).toBe('tr-3');
    expect(seen).toHaveLength(3);
  });

  it('raises a typed error that never contains the key', async () => {
    const { f } = fakeFetch([{ status: 401, body: 'Invalid API key SECRET' }]);
    const c = new NessieClient({ apiKey: 'SECRET', base: 'https://x.test', fetchImpl: f });
    const err = await c.transfer({ fromAccount: 'a', toAccount: 'b', cents: 1n, description: 'd' }).catch(e => e);
    expect(err).toBeInstanceOf(NessieError);
    expect(err.kind).toBe('http');
    expect(err.status).toBe(401);
    expect(err.retryable).toBe(false);
    expect(err.message).not.toContain('SECRET');
  });

  it('converts cents exactly and parses created ids', () => {
    expect(centsToDollars(98012n)).toBe(980.12);
    expect(centsToDollars(5n)).toBe(0.05);
    expect(createdId('{"_id":"x"}')).toBe('x');
    expect(createdId('{"objectCreated":{}}')).toBeUndefined();
  });
});
