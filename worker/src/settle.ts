// Settlement watcher. An approved payment has to land somewhere: for every payment row without a bank
// transaction id, send one transfer to the payee through the bank (Nessie, a mock) and write the returned id with
// record_settlement. In replay mode or without a key it writes `offline-<txnRef>` instead, so the dashboard says
// plainly that no bank was called. It never creates a payment (there is no reducer for that; G3).
import fs from 'node:fs';
import type { NessieConfig, WorkerMode } from './config.js';
import { NessieClient, type Bank } from './nessie.js';
import { recordSettlement, type Conn } from './stdb.js';

export const SETTLE_CONCURRENCY = 4;
export const SWEEP_MS = 60_000;
export const DEFAULT_MAX_PER_SECOND = 5;
const RETRY_DELAY_MS = 1_000;

// NESSIE_MAX_PER_SECOND caps bank calls across the concurrent settlers; a full live run is about 7,900 transfers.
export function parseMaxPerSecond(env: NodeJS.ProcessEnv = process.env): number {
  const raw = (env.NESSIE_MAX_PER_SECOND ?? '').trim();
  if (!raw) return DEFAULT_MAX_PER_SECOND;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`NESSIE_MAX_PER_SECOND must be a positive number, got "${raw}"`);
  return n;
}

// Hands out send slots 1000/maxPerSecond ms apart. A caller takes the next free slot and waits for it; nothing is
// dropped or merged, so one payment still means exactly one transfer.
export class RateLimiter {
  private nextAt = 0;
  constructor(
    readonly maxPerSecond: number,
    private readonly now: () => number = Date.now,
    private readonly sleep: (ms: number) => Promise<void> = ms => new Promise(r => setTimeout(r, ms)),
  ) {
    if (!(maxPerSecond > 0)) throw new Error('maxPerSecond must be positive');
  }

  async take(): Promise<void> {
    const t = this.now();
    const slot = Math.max(t, this.nextAt);
    this.nextAt = slot + 1000 / this.maxPerSecond;
    if (slot > t) await this.sleep(slot - t);
  }
}

export interface SettlePayment {
  txnRef: string;
  cents: bigint;
  bankTxnId?: string;
}

// What the watcher needs from SpacetimeDB. connLedger() adapts the client cache; tests pass a fake.
export interface SettleLedger {
  payments(): SettlePayment[];
  payment(txnRef: string): SettlePayment | undefined;
  onPayment(cb: (p: SettlePayment) => void): void;
  // match_result.evidence_json.vendorId; undefined for card (fuel) and toll rows
  vendorIdOf(txnRef: string): number | undefined;
  recordSettlement(txnRef: string, bankTxnId: string): Promise<void>;
}

export interface NessieAccounts {
  carrierAccountId: string;
  fuelTollsAccountId: string;
  vendors: Record<string, string>;
}

export type SettleMode = { kind: 'live'; bank: Bank; accounts: NessieAccounts } | { kind: 'offline'; reason: string };

export type SettleOutcome = 'settled' | 'already_settled' | 'skipped' | 'failed';

export function offlineId(txnRef: string): string {
  return `offline-${txnRef}`;
}

export function isAlreadySettled(err: unknown): boolean {
  const msg = (err as Error)?.message ?? String(err);
  return msg.includes('already settled');
}

// Invoices go to their vendor's payee account; anything without a vendor id (fuel cards, tolls) goes to the single
// fuel-and-tolls payee. An invoice whose vendor has no seeded account is not guessed at: it stays unsettled.
export function payeeFor(accounts: NessieAccounts, vendorId: number | undefined): { account: string; label: string } | undefined {
  if (vendorId === undefined) return { account: accounts.fuelTollsAccountId, label: 'fuel and tolls' };
  const account = accounts.vendors[String(vendorId)];
  return account ? { account, label: `vendor ${vendorId}` } : undefined;
}

export function readAccounts(file: string): NessieAccounts | undefined {
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
  const j = JSON.parse(raw) as Partial<NessieAccounts>;
  if (typeof j.carrierAccountId !== 'string' || typeof j.fuelTollsAccountId !== 'string' || !j.vendors || typeof j.vendors !== 'object') {
    throw new Error(`${file} is missing carrierAccountId, fuelTollsAccountId or vendors; rerun scripts/nessie_seed.py`);
  }
  return { carrierAccountId: j.carrierAccountId, fuelTollsAccountId: j.fuelTollsAccountId, vendors: { ...j.vendors } };
}

// Live needs NESSIE_API_KEY, WORKER_MODE other than replay, and the accounts written by scripts/nessie_seed.py.
// WORKER_MODE is the requested mode: a missing Factory key forces investigations to replay but does not make the
// bank call paid, so it does not switch settlement off.
export function resolveSettleMode(n: NessieConfig, workerMode: WorkerMode, read: (file: string) => NessieAccounts | undefined = readAccounts): SettleMode {
  if (!n.apiKey) return { kind: 'offline', reason: 'NESSIE_API_KEY is empty' };
  if (workerMode === 'replay') return { kind: 'offline', reason: 'WORKER_MODE=replay' };
  const accounts = read(n.accountsFile);
  if (!accounts) return { kind: 'offline', reason: `${n.accountsFile} not found; run scripts/nessie_seed.py` };
  return { kind: 'live', bank: new NessieClient({ apiKey: n.apiKey, base: n.base }), accounts };
}

export interface WatcherDeps {
  ledger: SettleLedger;
  mode: SettleMode;
  log: (m: string) => void;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  sweepMs?: number;
  maxPerSecond?: number;
}

export class SettlementWatcher {
  private readonly ledger: SettleLedger;
  private readonly mode: SettleMode;
  private readonly log: (m: string) => void;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly sweepMs: number;
  private readonly limiter: RateLimiter;
  private readonly queue: SettlePayment[] = [];
  private readonly busy = new Set<string>();
  // Bank ids already returned whose record_settlement did not land: re-record these, never transfer twice.
  private readonly unrecorded = new Map<string, string>();
  private readonly inflight = new Set<Promise<void>>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private stopped = false;

  constructor(d: WatcherDeps) {
    this.ledger = d.ledger;
    this.mode = d.mode;
    this.log = d.log;
    this.sleep = d.sleep ?? (ms => new Promise(r => setTimeout(r, ms)));
    this.sweepMs = d.sweepMs ?? SWEEP_MS;
    this.limiter = new RateLimiter(d.maxPerSecond ?? DEFAULT_MAX_PER_SECOND, d.now ?? Date.now, this.sleep);
  }

  start(): void {
    this.log(
      this.mode.kind === 'live'
        ? `settlement: live through Nessie (mock bank), at most ${this.limiter.maxPerSecond} transfers per second, ${SETTLE_CONCURRENCY} in flight`
        : `settlement: offline (${this.mode.reason}); writing offline-<txnRef> ids`,
    );
    this.ledger.onPayment(p => this.enqueue(p));
    this.sweep();
    if (this.sweepMs > 0) {
      this.timer = setInterval(() => this.sweep(), this.sweepMs);
      this.timer.unref?.();
    }
  }

  // Picks up rows that were present before start() and rows whose last attempt failed.
  sweep(): void {
    for (const p of this.ledger.payments()) this.enqueue(p);
  }

  enqueue(p: SettlePayment): void {
    if (this.stopped || p.bankTxnId !== undefined || this.busy.has(p.txnRef)) return;
    this.busy.add(p.txnRef);
    this.queue.push(p);
    this.pump();
  }

  // Resolves once nothing is queued or running.
  async idle(): Promise<void> {
    while (this.inflight.size > 0) await Promise.allSettled([...this.inflight]);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    for (const p of this.queue.splice(0)) this.busy.delete(p.txnRef);
    await this.idle();
  }

  private pump(): void {
    while (this.inflight.size < SETTLE_CONCURRENCY && this.queue.length > 0) {
      const p = this.queue.shift()!;
      const job: Promise<void> = this.settleOne(p)
        .then(() => undefined, err => this.log(`settlement ${p.txnRef}: ${(err as Error)?.message ?? String(err)}`))
        .finally(() => {
          this.inflight.delete(job);
          this.busy.delete(p.txnRef);
          this.pump();
        });
      this.inflight.add(job);
    }
  }

  async settleOne(p: SettlePayment): Promise<SettleOutcome> {
    const current = this.ledger.payment(p.txnRef);
    if (!current || current.bankTxnId !== undefined) return 'skipped';

    let bankId = this.unrecorded.get(p.txnRef);
    if (bankId === undefined) {
      if (this.mode.kind === 'offline') {
        bankId = offlineId(p.txnRef);
      } else {
        const vendorId = this.ledger.vendorIdOf(p.txnRef);
        if (vendorId === undefined && p.txnRef.startsWith('INV-')) {
          this.log(`settlement ${p.txnRef}: invoice without a vendor id in match_result; left unsettled`);
          return 'skipped';
        }
        const payee = payeeFor(this.mode.accounts, vendorId);
        if (!payee) {
          this.log(`settlement ${p.txnRef}: vendor ${vendorId} has no Nessie account; rerun scripts/nessie_seed.py`);
          return 'skipped';
        }
        const sent = await this.transferWithRetry(p, payee.account);
        if (sent === undefined) return 'failed';
        bankId = sent;
        this.unrecorded.set(p.txnRef, bankId);
      }
    }

    try {
      await this.ledger.recordSettlement(p.txnRef, bankId);
      this.unrecorded.delete(p.txnRef);
      this.log(`settled ${p.txnRef} bank id ${bankId}`);
      return 'settled';
    } catch (err) {
      if (isAlreadySettled(err)) {
        this.unrecorded.delete(p.txnRef);
        return 'already_settled';
      }
      this.log(`settlement ${p.txnRef}: record_settlement failed (${(err as Error)?.message ?? String(err)}); will re-record ${bankId} on the next sweep`);
      return 'failed';
    }
  }

  // One retry on a failed call. A 4xx refusal is not retried: the same body gets the same answer.
  private async transferWithRetry(p: SettlePayment, toAccount: string): Promise<string | undefined> {
    if (this.mode.kind !== 'live') return undefined;
    const args = { fromAccount: this.mode.accounts.carrierAccountId, toAccount, cents: p.cents, description: `txn_ref ${p.txnRef}` };
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await this.limiter.take();
        return await this.mode.bank.transfer(args);
      } catch (err) {
        const retryable = (err as { retryable?: boolean })?.retryable !== false;
        this.log(`settlement ${p.txnRef}: Nessie transfer attempt ${attempt} failed: ${(err as Error)?.message ?? String(err)}`);
        if (attempt === 2 || !retryable) return undefined;
        await this.sleep(RETRY_DELAY_MS);
      }
    }
    return undefined;
  }
}

// Adapts the SpacetimeDB client cache (payment and match_result subscriptions in stdb.ts).
export function connLedger(conn: Conn): SettleLedger {
  const view = (r: { txnRef: string; cents: bigint; bankTxnId?: string }): SettlePayment => ({ txnRef: r.txnRef, cents: r.cents, bankTxnId: r.bankTxnId });
  return {
    payments: () => [...conn.db.payment.iter()].map(view),
    payment: txnRef => {
      const r = conn.db.payment.txnRef.find(txnRef);
      return r ? view(r) : undefined;
    },
    onPayment: cb => conn.db.payment.onInsert((_ctx, row) => cb(view(row))),
    vendorIdOf: txnRef => {
      const m = conn.db.matchResult.txnRef.find(txnRef);
      if (!m) return undefined;
      try {
        const v = (JSON.parse(m.evidenceJson) as { vendorId?: unknown }).vendorId;
        return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
      } catch {
        return undefined;
      }
    },
    recordSettlement: (txnRef, bankTxnId) => recordSettlement(conn, txnRef, bankTxnId),
  };
}

export function startSettlement(o: { conn: Conn; nessie: NessieConfig; workerMode: WorkerMode; log: (m: string) => void }): SettlementWatcher {
  const w = new SettlementWatcher({ ledger: connLedger(o.conn), mode: resolveSettleMode(o.nessie, o.workerMode), log: o.log, maxPerSecond: parseMaxPerSecond() });
  w.start();
  return w;
}
