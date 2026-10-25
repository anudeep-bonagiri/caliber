// Dispatch Ledger module. One shared room: all state and every permission check live here.
// Three roles (seed, agent, controller). Every action: check, the change, audit.
//
// Two entry points per controller action:
//   - a reducer (`approve_payment`): used by SDK clients; a refusal throws SenderError and the
//     transaction rolls back, so the caller sees the message but nothing is written.
//   - a procedure (`try_approve_payment`): runs the same check in its own committed transaction,
//     so a refusal leaves an `audit_event` row with action 'refused' and returns {ok:false, message}.
//     The ASI:One agent and the demo scripts use these so refusals are visible in the ledger.
import { SenderError, t, type InferSchema, type ReducerCtx } from 'spacetimedb/server';
import { ScheduleAt, Timestamp } from 'spacetimedb';
import spacetimedb, {
  agentTask, businessDay, cardTxn, contract, dayTimer, driver, hold, ingestLog, invoice, matchResult, payment,
  po, rule, terminal, tollTxn, tripPing, truck, vendor,
} from './schema';
import { T, RULE_CONDITIONS } from './thresholds';
import { dateForDay } from './calendar';
import {
  autoPayDecision, evaluateCardTxn, evaluateInvoice, evaluateToll, isEarlierInvoice, isEarlierToll, ruleCovers,
  type PingIn, type RuleIn, type RuleScope, type TollIn, type InvoiceIn, type Verdict,
} from './kernel';

export { default } from './schema';

type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;
type Refusal = string | null;
type Identity = Ctx['sender'];

const TICK_MICROS = 2_000_000n;
const APPROVABLE = ['open', 'awaiting_controller', 'answered'];
const Outcome = t.object('Outcome', { ok: t.bool(), message: t.string() });

// ---------------------------------------------------------------------------
// roles and audit
// ---------------------------------------------------------------------------
function roleOf(ctx: Ctx, who = ctx.sender): string {
  if (who.isEqual(ctx.identity)) return 'database';
  return ctx.db.role.identity.find(who)?.role ?? 'anonymous';
}

function currentDay(ctx: Ctx): number {
  return ctx.db.businessDay.id.find(1)?.day ?? 0;
}

function audit(ctx: Ctx, action: string, ref: string, detail: string) {
  ctx.db.auditEvent.insert({
    id: 0n, at: ctx.timestamp, day: currentDay(ctx), actor: ctx.sender, actorRole: roleOf(ctx), action, ref, detail,
  });
}

function checkRole(ctx: Ctx, ...allowed: string[]): Refusal {
  const r = roleOf(ctx);
  return allowed.includes(r) ? null : `${r} may not do this (needs ${allowed.join(' or ')})`;
}

// Reducer path: audit then throw (the audit row rolls back with the transaction; the message reaches the caller).
function guard(ctx: Ctx, ref: string, refusal: Refusal, perform: () => void) {
  if (refusal) {
    audit(ctx, 'refused', ref, refusal);
    throw new SenderError(refusal);
  }
  perform();
}

function refuse(ctx: Ctx, ref: string, why: string): never {
  audit(ctx, 'refused', ref, why);
  throw new SenderError(why);
}

function requireRole(ctx: Ctx, ref: string, ...allowed: string[]) {
  const r = checkRole(ctx, ...allowed);
  if (r) refuse(ctx, ref, r);
}

// Procedure path: the refusal is written in a committed transaction and returned, never thrown.
type TxRunner = { withTx<R>(body: (tx: Ctx) => R): R };
function attempt(ctx: TxRunner, ref: string, check: (tx: Ctx) => Refusal, perform: (tx: Ctx) => void) {
  const result = ctx.withTx(tx => {
    const r = check(tx);
    if (r) { audit(tx, 'refused', ref, r); return r; }
    perform(tx);
    return null;
  });
  return result ? { ok: false, message: result } : { ok: true, message: 'ok' };
}

// ---------------------------------------------------------------------------
// lifecycle
// ---------------------------------------------------------------------------
export const init = spacetimedb.init(ctx => {
  ctx.db.role.insert({ identity: ctx.sender, role: 'seed' });
  ctx.db.businessDay.insert({ id: 1, day: 0, date: dateForDay(0), paused: true, tickMicros: TICK_MICROS });
  ctx.db.dayTimer.insert({ scheduledId: 0n, scheduledAt: ScheduleAt.interval(TICK_MICROS) });
  ctx.db.auditEvent.insert({
    id: 0n, at: ctx.timestamp, day: 0, actor: ctx.sender, actorRole: 'seed', action: 'init', ref: 'module', detail: 'publisher granted seed',
  });
});

export const grantRole = spacetimedb.reducer({ identity: t.identity(), role: t.string() }, (ctx, { identity, role: r }) => {
  requireRole(ctx, identity.toHexString(), 'seed');
  if (!['seed', 'agent', 'controller', 'reader'].includes(r)) refuse(ctx, identity.toHexString(), `unknown role ${r}`);
  const existing = ctx.db.role.identity.find(identity);
  if (existing) ctx.db.role.identity.update({ ...existing, role: r });
  else ctx.db.role.insert({ identity, role: r });
  audit(ctx, 'grant_role', identity.toHexString(), r);
});

// ---------------------------------------------------------------------------
// seeding (seed role only). Typed arrays, 500 rows per call is comfortable.
// ---------------------------------------------------------------------------
export const seedTerminals = spacetimedb.reducer({ rows: t.array(terminal.rowType) }, (ctx, { rows }) => {
  requireRole(ctx, 'seed', 'seed');
  for (const r of rows) if (!ctx.db.terminal.id.find(r.id)) ctx.db.terminal.insert(r);
  audit(ctx, 'seed', 'terminal', `${rows.length} rows`);
});
export const seedTrucks = spacetimedb.reducer({ rows: t.array(truck.rowType) }, (ctx, { rows }) => {
  requireRole(ctx, 'seed', 'seed');
  for (const r of rows) if (!ctx.db.truck.id.find(r.id)) ctx.db.truck.insert(r);
  audit(ctx, 'seed', 'truck', `${rows.length} rows`);
});
export const seedDrivers = spacetimedb.reducer({ rows: t.array(driver.rowType) }, (ctx, { rows }) => {
  requireRole(ctx, 'seed', 'seed');
  for (const r of rows) if (!ctx.db.driver.id.find(r.id)) ctx.db.driver.insert(r);
  audit(ctx, 'seed', 'driver', `${rows.length} rows`);
});
export const seedPings = spacetimedb.reducer({ rows: t.array(tripPing.rowType) }, (ctx, { rows }) => {
  requireRole(ctx, 'seed', 'seed');
  for (const r of rows) ctx.db.tripPing.insert({ ...r, id: 0n });
});
export const seedCardTxns = spacetimedb.reducer({ rows: t.array(cardTxn.rowType) }, (ctx, { rows }) => {
  requireRole(ctx, 'seed', 'seed');
  for (const r of rows) if (!ctx.db.cardTxn.id.find(r.id)) ctx.db.cardTxn.insert(r);
});
export const seedTollTxns = spacetimedb.reducer({ rows: t.array(tollTxn.rowType) }, (ctx, { rows }) => {
  requireRole(ctx, 'seed', 'seed');
  for (const r of rows) if (!ctx.db.tollTxn.id.find(r.id)) ctx.db.tollTxn.insert(r);
});
export const seedVendors = spacetimedb.reducer({ rows: t.array(vendor.rowType) }, (ctx, { rows }) => {
  requireRole(ctx, 'seed', 'seed');
  for (const r of rows) if (!ctx.db.vendor.id.find(r.id)) ctx.db.vendor.insert(r);
  audit(ctx, 'seed', 'vendor', `${rows.length} rows`);
});
export const seedContracts = spacetimedb.reducer({ rows: t.array(contract.rowType) }, (ctx, { rows }) => {
  requireRole(ctx, 'seed', 'seed');
  for (const r of rows) if (!ctx.db.contract.id.find(r.id)) ctx.db.contract.insert(r);
  audit(ctx, 'seed', 'contract', `${rows.length} rows`);
});
export const seedPos = spacetimedb.reducer({ rows: t.array(po.rowType) }, (ctx, { rows }) => {
  requireRole(ctx, 'seed', 'seed');
  for (const r of rows) if (!ctx.db.po.id.find(r.id)) ctx.db.po.insert(r);
  audit(ctx, 'seed', 'po', `${rows.length} rows`);
});
export const seedInvoices = spacetimedb.reducer({ rows: t.array(invoice.rowType) }, (ctx, { rows }) => {
  requireRole(ctx, 'seed', 'seed');
  for (const r of rows) if (!ctx.db.invoice.id.find(r.id)) ctx.db.invoice.insert(r);
  audit(ctx, 'seed', 'invoice', `${rows.length} rows`);
});

// A vendor changes its bank details on a given day (seed only; the kernel reads bankChangedDay).
export const vendorBankChange = spacetimedb.reducer({ vendorId: t.u32(), bankLast4: t.string(), day: t.i32() }, (ctx, { vendorId, bankLast4, day }) => {
  requireRole(ctx, String(vendorId), 'seed');
  const v = ctx.db.vendor.id.find(vendorId);
  if (!v) refuse(ctx, String(vendorId), 'no such vendor');
  ctx.db.vendor.id.update({ ...v, bankLast4, bankChangedDay: day });
  audit(ctx, 'vendor_bank_change', String(vendorId), `day ${day}`);
});

// Wipe operational state so the demo can replay from day 0 without republishing. Company data stays.
export const resetSim = spacetimedb.reducer(ctx => {
  requireRole(ctx, 'sim', 'seed');
  ctx.db.matchResult.clear();
  ctx.db.payment.clear();
  ctx.db.dayTotal.clear();
  ctx.db.agentTask.clear();
  ctx.db.hold.clear();
  ctx.db.rule.clear();
  const d = ctx.db.businessDay.id.find(1)!;
  ctx.db.businessDay.id.update({ ...d, day: 0, date: dateForDay(0), paused: true });
  audit(ctx, 'reset_sim', 'day', '0');
});

// ---------------------------------------------------------------------------
// the clock
// ---------------------------------------------------------------------------
function performSetClock(ctx: Ctx, paused: boolean) {
  const d = ctx.db.businessDay.id.find(1)!;
  ctx.db.businessDay.id.update({ ...d, paused });
  audit(ctx, 'set_clock', String(d.day), paused ? 'paused' : 'running');
}
export const setClock = spacetimedb.reducer({ paused: t.bool() }, (ctx, { paused }) =>
  guard(ctx, 'clock', checkRole(ctx, 'seed', 'controller'), () => performSetClock(ctx, paused)));
export const trySetClock = spacetimedb.procedure({ paused: t.bool() }, Outcome, (ctx, { paused }) =>
  attempt(ctx, 'clock', tx => checkRole(tx, 'seed', 'controller'), tx => performSetClock(tx, paused)));

export const setTickMicros = spacetimedb.reducer({ micros: t.u64() }, (ctx, { micros }) => {
  requireRole(ctx, 'clock', 'seed', 'controller');
  if (micros < 100_000n) refuse(ctx, 'clock', 'tick must be at least 100ms');
  const d = ctx.db.businessDay.id.find(1)!;
  ctx.db.businessDay.id.update({ ...d, tickMicros: micros });
  for (const timer of ctx.db.dayTimer.iter()) ctx.db.dayTimer.scheduledId.delete(timer.scheduledId);
  ctx.db.dayTimer.insert({ scheduledId: 0n, scheduledAt: ScheduleAt.interval(micros) });
  audit(ctx, 'set_tick', String(d.day), `${micros} us`);
});

// Advance exactly one business day, paused or not. For tests and the demo "step" control.
export const stepDay = spacetimedb.reducer(ctx =>
  guard(ctx, 'clock', checkRole(ctx, 'seed', 'controller'), () => advance(ctx)));
export const tryStepDay = spacetimedb.procedure(Outcome, ctx =>
  attempt(ctx, 'clock', tx => checkRole(tx, 'seed', 'controller'), tx => advance(tx)));

// Scheduled: only the database itself may call it.
export const advanceDay = spacetimedb.reducer({ onSchedule: dayTimer }, { timer: dayTimer.rowType }, (ctx, _args) => {
  if (!ctx.sender.isEqual(ctx.identity)) throw new SenderError('scheduled only');
  const d = ctx.db.businessDay.id.find(1)!;
  if (d.paused || d.day >= T.TOTAL_DAYS) return;
  advance(ctx);
});

function advance(ctx: Ctx) {
  const d = ctx.db.businessDay.id.find(1)!;
  if (d.day >= T.TOTAL_DAYS) return;
  const next = d.day + 1;
  ctx.db.businessDay.id.update({ ...d, day: next, date: dateForDay(next) });
  expireRules(ctx, next);
  matchDay(ctx, next);
}

function expireRules(ctx: Ctx, day: number) {
  for (const r of ctx.db.rule.status.filter('approved')) {
    if (r.validToDay < day) ctx.db.rule.id.update({ ...r, status: 'expired', reason: `expired on day ${day}` });
  }
}

// ---------------------------------------------------------------------------
// the kernel, applied to one day. Internal: nobody can replay a day from outside.
// ---------------------------------------------------------------------------
function parseScope(json: string): RuleScope {
  try {
    const s = JSON.parse(json) as Record<string, unknown>;
    const out: RuleScope = {};
    if (typeof s.driverId === 'number') out.driverId = s.driverId;
    if (Array.isArray(s.truckIds)) out.truckIds = s.truckIds.filter((x): x is number => typeof x === 'number');
    if (typeof s.cardId === 'string') out.cardId = s.cardId;
    if (typeof s.vendorId === 'number') out.vendorId = s.vendorId;
    return out;
  } catch {
    return {};
  }
}

function approvedRules(ctx: Ctx): RuleIn[] {
  const out: RuleIn[] = [];
  for (const r of ctx.db.rule.status.filter('approved')) {
    out.push({ id: r.id, condition: r.condition, scope: parseScope(r.scopeJson), validFromDay: r.validFromDay, validToDay: r.validToDay });
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function pingsFor(ctx: Ctx, truckId: number, day: number): PingIn[] {
  const out: PingIn[] = [];
  for (const p of ctx.db.tripPing.by_truck_day.filter([truckId, day])) {
    out.push({ atMicros: p.at.microsSinceUnixEpoch, lat: p.lat, lon: p.lon, engineOn: p.engineOn, odometer: p.odometer });
  }
  return out;
}

type CardRow = typeof cardTxn.rowType.type;
type TollRow = typeof tollTxn.rowType.type;
type InvoiceRow = typeof invoice.rowType.type;

function evaluateCard(ctx: Ctx, c: CardRow, rules: RuleIn[]): Verdict {
  const tr = ctx.db.truck.id.find(c.truckId);
  const pings = pingsFor(ctx, c.truckId, c.day);
  const drv = ctx.db.driver.id.find(c.driverId);
  const v = evaluateCardTxn(
    { id: c.id, cardId: c.cardId, truckId: c.truckId, driverId: c.driverId, atMicros: c.at.microsSinceUnixEpoch, day: c.day,
      stationName: c.stationName, stationLat: c.stationLat, stationLon: c.stationLon, gallons: c.gallons, cents: c.cents, merchant: c.merchant },
    tr ? { id: tr.id, plate: tr.plate, tankGal: tr.tankGal, fuelCardId: tr.fuelCardId } : undefined,
    pings,
    rules
  );
  v.evidence = { ...v.evidence, driverName: drv?.name ?? '', plate: tr?.plate ?? '', atMicros: c.at.microsSinceUnixEpoch.toString(), date: dateForDay(c.day) };
  return v;
}

function evaluateTollRow(ctx: Ctx, tl: TollRow): Verdict {
  const me: TollIn = { id: tl.id, plate: tl.plate, truckId: tl.truckId, atMicros: tl.at.microsSinceUnixEpoch, day: tl.day, plazaId: tl.plazaId, plazaName: tl.plazaName, cents: tl.cents };
  const earlier: TollIn[] = [];
  for (const e of ctx.db.tollTxn.plate.filter(tl.plate)) {
    const row: TollIn = { id: e.id, plate: e.plate, truckId: e.truckId, atMicros: e.at.microsSinceUnixEpoch, day: e.day, plazaId: e.plazaId, plazaName: e.plazaName, cents: e.cents };
    if (e.id !== tl.id && isEarlierToll(row, me)) earlier.push(row);
  }
  const v = evaluateToll(me, earlier);
  v.evidence = { ...v.evidence, atMicros: tl.at.microsSinceUnixEpoch.toString(), date: dateForDay(tl.day) };
  return v;
}

function evaluateInvoiceRow(ctx: Ctx, inv: InvoiceRow, rules: RuleIn[]): Verdict {
  const me: InvoiceIn = { id: inv.id, vendorId: inv.vendorId, poId: inv.poId, receivedDay: inv.receivedDay, item: inv.item, qty: inv.qty, unitCents: inv.unitCents, cents: inv.cents, docRef: inv.docRef };
  const p = inv.poId ? ctx.db.po.id.find(inv.poId) : undefined;
  const vend = ctx.db.vendor.id.find(inv.vendorId);
  // The contract valid on the receipt day; the most recently started one wins, lowest id breaks ties.
  let ct: typeof contract.rowType.type | undefined;
  if (p) {
    for (const c of ctx.db.contract.vendorId.filter(inv.vendorId)) {
      if (c.item !== p.item || c.validFromDay > inv.receivedDay || c.validToDay < inv.receivedDay) continue;
      if (!ct || c.validFromDay > ct.validFromDay || (c.validFromDay === ct.validFromDay && c.id < ct.id)) ct = c;
    }
  }
  const earlier: InvoiceIn[] = [];
  for (const e of ctx.db.invoice.vendorId.filter(inv.vendorId)) {
    const row: InvoiceIn = { id: e.id, vendorId: e.vendorId, poId: e.poId, receivedDay: e.receivedDay, item: e.item, qty: e.qty, unitCents: e.unitCents, cents: e.cents, docRef: e.docRef };
    if (e.id !== inv.id && isEarlierInvoice(row, me)) earlier.push(row);
  }
  const v = evaluateInvoice(
    me,
    p ? { id: p.id, vendorId: p.vendorId, truckId: p.truckId, item: p.item, qty: p.qty, unitCents: p.unitCents, receivedQty: p.receivedQty } : undefined,
    ct ? { id: ct.id, vendorId: ct.vendorId, item: ct.item, rateCents: ct.rateCents, validFromDay: ct.validFromDay, validToDay: ct.validToDay } : undefined,
    vend ? { id: vend.id, name: vend.name, bankChangedDay: vend.bankChangedDay } : undefined,
    earlier,
    rules
  );
  v.evidence = { ...v.evidence, date: dateForDay(inv.receivedDay), contractClause: ct?.clause ?? '' };
  return v;
}

type DayTotalRow = { day: number; autoPaidCents: bigint; autoPaidCount: number; holdCount: number; rejectedCount: number; txnCount: number };
function bumpDay(ctx: Ctx, day: number, f: (t: DayTotalRow) => DayTotalRow) {
  const cur = ctx.db.dayTotal.day.find(day);
  const next = f(cur ?? { day, autoPaidCents: 0n, autoPaidCount: 0, holdCount: 0, rejectedCount: 0, txnCount: 0 });
  if (cur) ctx.db.dayTotal.day.update(next); else ctx.db.dayTotal.insert(next);
}

const QUESTION_HINT: Record<string, string> = {
  location_mismatch: 'Was this card used by a different truck or driver that day?',
  rate_variance: 'Is the higher unit price agreed anywhere outside the contract?',
  duplicate_invoice: 'Which PO is the real one?',
  short_received: 'Pay the received quantity only, or wait for the rest?',
  vendor_bank_change: 'Call the vendor on a known number and record who confirmed the new account.',
  po_mismatch: 'Which PO does this invoice belong to?',
  capacity_exceeded: '',
  limit: 'Approve this payment above the auto-pay limit?',
};

// Writes the outcome of one verdict: match_result, then payment or hold (+ task), with audit.
// `requester` is who caused this evaluation (the database for the clock, the caller for an injected row).
function settle(ctx: Ctx, txnRef: string, kind: string, cents: bigint, day: number, v: Verdict, opts: { rematch?: boolean; requester?: Identity } = {}) {
  const existing = ctx.db.matchResult.txnRef.find(txnRef);
  const row = { txnRef, kind, code: v.code, cents, day, evidenceJson: JSON.stringify(v.evidence), ruleId: v.ruleId, decidedAt: ctx.timestamp };
  if (existing) ctx.db.matchResult.txnRef.update(row); else ctx.db.matchResult.insert(row);
  if (!opts.rematch) bumpDay(ctx, day, t => ({ ...t, txnCount: t.txnCount + 1 }));

  if (v.code === 'duplicate_toll') {
    if (existing?.code !== 'duplicate_toll') bumpDay(ctx, day, t => ({ ...t, rejectedCount: t.rejectedCount + 1 }));
    audit(ctx, 'auto_reject', txnRef, `duplicate_toll of ${String(v.evidence.duplicateOf)}`);
    return;
  }

  if (v.code === 'matched') {
    const total = ctx.db.dayTotal.day.find(day)?.autoPaidCents ?? 0n;
    const decision = autoPayDecision(cents, total);
    if (decision === 'pay') {
      if (!ctx.db.payment.txnRef.find(txnRef)) {
        ctx.db.payment.insert({ txnRef, cents, day, releasedBy: ctx.sender, releasedRole: v.ruleId ? 'rule' : 'kernel', at: ctx.timestamp, bankTxnId: undefined });
        bumpDay(ctx, day, t => ({ ...t, autoPaidCents: t.autoPaidCents + cents, autoPaidCount: t.autoPaidCount + 1 }));
      }
      const h = ctx.db.hold.txnRef.find(txnRef);
      if (h && h.status !== 'released') {
        ctx.db.hold.txnRef.update({ ...h, status: 'cleared_by_rule', ruleId: v.ruleId, actor: ctx.sender, updatedAt: ctx.timestamp });
      }
      if (v.ruleId !== undefined) {
        const r = ctx.db.rule.id.find(v.ruleId);
        if (r && r.uses === 'one_time') ctx.db.rule.id.update({ ...r, status: 'expired', reason: `one_time rule consumed by ${txnRef}` });
      }
      audit(ctx, v.ruleId !== undefined ? 'cleared_by_rule' : 'auto_pay', txnRef, v.ruleId !== undefined ? `rule ${v.ruleId}` : `${cents} cents`);
      return;
    }
    v = { code: 'limit', evidence: { ...v.evidence, limitReason: cents > T.AUTO_PAY_MAX_CENTS ? 'per_transaction' : 'daily_cap' } };
    ctx.db.matchResult.txnRef.update({ ...row, code: 'limit', evidenceJson: JSON.stringify(v.evidence) });
  }

  // a hold, raised by code
  const h = ctx.db.hold.txnRef.find(txnRef);
  if (!h) {
    ctx.db.hold.insert({
      txnRef, kind, code: v.code, cents, day, requestedBy: opts.requester ?? ctx.identity, reason: `kernel: ${v.code}`,
      question: undefined, answer: undefined, callbackNote: undefined, status: 'open', ruleId: undefined, actor: ctx.sender, updatedAt: ctx.timestamp,
    });
    bumpDay(ctx, day, t => ({ ...t, holdCount: t.holdCount + 1 }));
    audit(ctx, 'hold', txnRef, v.code);
  } else if (h.code !== v.code) {
    ctx.db.hold.txnRef.update({ ...h, code: v.code, actor: ctx.sender, updatedAt: ctx.timestamp });
    audit(ctx, 'hold_recoded', txnRef, `${h.code} -> ${v.code}`);
  }
  if (!opts.rematch && v.code !== 'limit') {
    const brief = { txnRef, kind, code: v.code, cents: cents.toString(), day, date: dateForDay(day), evidence: v.evidence, questionHint: QUESTION_HINT[v.code] ?? '' };
    ctx.db.agentTask.insert({
      id: 0n, txnRef, kind: 'investigate', status: 'open', version: 0, claimedBy: undefined, claimedAt: undefined,
      briefJson: JSON.stringify(brief), stepsJson: '[]', findingJson: '', source: 'none', createdDay: day, createdAt: ctx.timestamp, updatedAt: ctx.timestamp,
    });
    // Task 16: a vendor whose bank details changed is vetted against external records (business credit,
    // public records, OFAC). Nothing about drivers or people is ever sent; the brief carries vendor fields only.
    if (v.code === 'vendor_bank_change') vendorCheckTask(ctx, txnRef, kind, cents, day, 'bank_change', v.evidence);
  }
}

function vendorCheckTask(ctx: Ctx, txnRef: string, kind: string, cents: bigint, day: number, trigger: string, evidence: Record<string, unknown>) {
  const vendorId = typeof evidence.vendorId === 'number' ? evidence.vendorId : undefined;
  if (vendorId === undefined) return;
  for (const t of ctx.db.agentTask.txnRef.filter(txnRef)) if (t.kind === 'vendor_check') return;
  const vend = ctx.db.vendor.id.find(vendorId);
  const brief = {
    txnRef, kind, code: 'vendor_check', trigger, cents: cents.toString(), day, date: dateForDay(day),
    vendor: { id: vendorId, name: vend?.name ?? '', bankChangedDay: vend?.bankChangedDay ?? 0 },
    questionHint: 'Vendor check: approve with a call-back note, or reject?',
  };
  ctx.db.agentTask.insert({
    id: 0n, txnRef, kind: 'vendor_check', status: 'open', version: 0, claimedBy: undefined, claimedAt: undefined,
    briefJson: JSON.stringify(brief), stepsJson: '[]', findingJson: '', source: 'none', createdDay: day, createdAt: ctx.timestamp, updatedAt: ctx.timestamp,
  });
}

const byTime = <R extends { id: string; at: { microsSinceUnixEpoch: bigint } }>(a: R, b: R) =>
  a.at.microsSinceUnixEpoch < b.at.microsSinceUnixEpoch ? -1 : a.at.microsSinceUnixEpoch > b.at.microsSinceUnixEpoch ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

// One row through the kernel. These three are the only way a card, toll or invoice row becomes a match_result,
// a payment or a hold: advance_day calls them for the day's rows and ingest_rows calls them for rows that arrive
// on or after their day (Task 21). Each returns false when the row was already matched (re-running is a no-op).
const byId = <R extends { id: string }>(a: R, b: R) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
function matchCardRow(ctx: Ctx, c: CardRow, rules: RuleIn[]): boolean {
  if (ctx.db.matchResult.txnRef.find(c.id)) return false;
  settle(ctx, c.id, 'card', c.cents, c.day, evaluateCard(ctx, c, rules));
  return true;
}
function matchTollRow(ctx: Ctx, tl: TollRow): boolean {
  if (ctx.db.matchResult.txnRef.find(tl.id)) return false;
  settle(ctx, tl.id, 'toll', tl.cents, tl.day, evaluateTollRow(ctx, tl));
  return true;
}
function matchInvoiceRow(ctx: Ctx, inv: InvoiceRow, rules: RuleIn[]): boolean {
  if (ctx.db.matchResult.txnRef.find(inv.id)) return false;
  const v = evaluateInvoiceRow(ctx, inv, rules);
  settle(ctx, inv.id, 'invoice', inv.cents, inv.receivedDay, v);
  // a vendor's first invoice is vetted too, whatever the kernel decided about the invoice itself
  let earlier = false;
  for (const e of ctx.db.invoice.vendorId.filter(inv.vendorId)) {
    if (e.id !== inv.id && (e.receivedDay < inv.receivedDay || (e.receivedDay === inv.receivedDay && e.id < inv.id))) { earlier = true; break; }
  }
  if (!earlier) vendorCheckTask(ctx, inv.id, 'invoice', inv.cents, inv.receivedDay, 'first_invoice', { vendorId: inv.vendorId });
  return true;
}

function matchDay(ctx: Ctx, day: number) {
  const rules = approvedRules(ctx);
  for (const c of [...ctx.db.cardTxn.day.filter(day)].sort(byTime)) matchCardRow(ctx, c, rules);
  for (const tl of [...ctx.db.tollTxn.day.filter(day)].sort(byTime)) matchTollRow(ctx, tl);
  for (const inv of [...ctx.db.invoice.receivedDay.filter(day)].sort(byId)) matchInvoiceRow(ctx, inv, rules);
}

// ---------------------------------------------------------------------------
// Task 21: the inbox file connector. scripts/ingest_watch.py parses a dropped CSV (docs/CONNECTORS.md) and sends
// its rows here in batches. Rows are inserted like the seed_* reducers do (an existing id is skipped, nothing is
// overwritten), then every inserted row dated on or before the current business day goes through matchCardRow,
// matchTollRow or matchInvoiceRow, the same path advance_day uses, so holds, auto-pay limits and duplicate
// auto-rejects apply unchanged; rows dated later wait in their table for the clock. A file never names a truck:
// the truck comes from the card number or the plate. An unknown card, plate or vendor, a bad day or a malformed
// row refuses the whole batch and nothing is written. Label everywhere: file connector; API connectors not built.
// ---------------------------------------------------------------------------
const INGEST_KINDS = ['card', 'toll', 'invoice'];
const INGEST_BATCH_MAX = 1000;
type J = Record<string, unknown>;
function jStr(ctx: Ctx, r: J, k: string, ref: string): string {
  const v = r[k];
  if (typeof v !== 'string' || v === '') refuse(ctx, ref, `${k} missing`);
  return v;
}
function jNum(ctx: Ctx, r: J, k: string, ref: string): number {
  const v = r[k];
  if (typeof v !== 'number' || !Number.isFinite(v)) refuse(ctx, ref, `${k} is not a number`);
  return v;
}
function jInt(ctx: Ctx, r: J, k: string, ref: string): number {
  const v = jNum(ctx, r, k, ref);
  if (!Number.isInteger(v)) refuse(ctx, ref, `${k} is not an integer`);
  return v;
}
function jBig(ctx: Ctx, r: J, k: string, ref: string): bigint {
  const v = r[k];
  if (typeof v === 'number' && Number.isInteger(v)) return BigInt(v);
  if (typeof v === 'string' && /^-?\d{1,18}$/.test(v)) return BigInt(v);
  refuse(ctx, ref, `${k} is not an integer`);
}
function jDay(ctx: Ctx, r: J, k: string, ref: string): number {
  const d = jInt(ctx, r, k, ref);
  if (d < 1 || d > T.TOTAL_DAYS) refuse(ctx, ref, `${k} ${d} is outside 1 to ${T.TOTAL_DAYS}`);
  return d;
}
const byDayTime = <R extends { id: string; day: number; at: { microsSinceUnixEpoch: bigint } }>(a: R, b: R) => a.day - b.day || byTime(a, b);

export const ingestRows = spacetimedb.reducer({ fileName: t.string(), kind: t.string(), batchJson: t.string() }, (ctx, { fileName, kind, batchJson }) => {
  requireRole(ctx, fileName, 'seed');
  if (!INGEST_KINDS.includes(kind)) refuse(ctx, fileName, `unknown kind ${kind} (card, toll or invoice)`);
  let batch: unknown;
  try { batch = JSON.parse(batchJson); } catch { refuse(ctx, fileName, 'batch is not JSON'); }
  if (!Array.isArray(batch)) refuse(ctx, fileName, 'batch is not a JSON array');
  if (batch.length > INGEST_BATCH_MAX) refuse(ctx, fileName, `batch over ${INGEST_BATCH_MAX} rows`);
  const today = currentDay(ctx);
  const byCard = new Map<string, number>();
  const byPlate = new Map<string, number>();
  for (const tr of ctx.db.truck.iter()) { byCard.set(tr.fuelCardId, tr.id); byPlate.set(tr.plate, tr.id); }

  let skipped = 0;
  const cards: CardRow[] = [];
  const tolls: TollRow[] = [];
  const invs: InvoiceRow[] = [];
  for (const raw of batch) {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) refuse(ctx, fileName, 'row is not an object');
    const r = raw as J;
    const id = jStr(ctx, r, 'id', fileName);
    if (kind === 'card') {
      if (ctx.db.cardTxn.id.find(id)) { skipped++; continue; }
      const cardId = jStr(ctx, r, 'cardId', id);
      const truckId = byCard.get(cardId);
      if (truckId === undefined) refuse(ctx, id, `unknown card ${cardId}`);
      const row: CardRow = {
        id, cardId, truckId, driverId: jInt(ctx, r, 'driverId', id), at: new Timestamp(jBig(ctx, r, 'atMicros', id)), day: jDay(ctx, r, 'day', id),
        stationName: jStr(ctx, r, 'stationName', id), stationLat: jNum(ctx, r, 'stationLat', id), stationLon: jNum(ctx, r, 'stationLon', id),
        gallons: jNum(ctx, r, 'gallons', id), cents: jBig(ctx, r, 'cents', id), merchant: jStr(ctx, r, 'merchant', id),
      };
      ctx.db.cardTxn.insert(row);
      cards.push(row);
    } else if (kind === 'toll') {
      if (ctx.db.tollTxn.id.find(id)) { skipped++; continue; }
      const plate = jStr(ctx, r, 'plate', id);
      const truckId = byPlate.get(plate);
      if (truckId === undefined) refuse(ctx, id, `unknown plate ${plate}`);
      const row: TollRow = {
        id, plate, truckId, at: new Timestamp(jBig(ctx, r, 'atMicros', id)), day: jDay(ctx, r, 'day', id),
        plazaId: jStr(ctx, r, 'plazaId', id), plazaName: jStr(ctx, r, 'plazaName', id), cents: jBig(ctx, r, 'cents', id),
      };
      ctx.db.tollTxn.insert(row);
      tolls.push(row);
    } else {
      if (ctx.db.invoice.id.find(id)) { skipped++; continue; }
      const vendorId = jInt(ctx, r, 'vendorId', id);
      if (!ctx.db.vendor.id.find(vendorId)) refuse(ctx, id, `unknown vendor ${vendorId}`);
      const poRaw = r.poId;
      const poId = poRaw === null || poRaw === undefined || poRaw === '' ? undefined : jStr(ctx, r, 'poId', id);
      const row: InvoiceRow = {
        id, vendorId, poId, receivedDay: jDay(ctx, r, 'receivedDay', id), item: jStr(ctx, r, 'item', id), qty: jNum(ctx, r, 'qty', id),
        unitCents: jBig(ctx, r, 'unitCents', id), cents: jBig(ctx, r, 'cents', id), docRef: jStr(ctx, r, 'docRef', id),
      };
      ctx.db.invoice.insert(row);
      invs.push(row);
    }
  }

  // Rows already due are matched now, in the order advance_day would have used; later rows wait for the clock.
  const rules = approvedRules(ctx);
  let matched = 0;
  for (const c of cards.filter(c => c.day <= today).sort(byDayTime)) if (matchCardRow(ctx, c, rules)) matched++;
  for (const tl of tolls.filter(tl => tl.day <= today).sort(byDayTime)) if (matchTollRow(ctx, tl)) matched++;
  for (const inv of invs.filter(inv => inv.receivedDay <= today).sort((a, b) => a.receivedDay - b.receivedDay || byId(a, b))) if (matchInvoiceRow(ctx, inv, rules)) matched++;

  const waiting = batch.length - skipped - matched;
  ctx.db.ingestLog.insert({ id: 0n, at: ctx.timestamp, fileName, kind, rows: batch.length, skipped, matched, actor: ctx.sender });
  audit(ctx, 'ingest', fileName, `${kind}: ${batch.length} rows, ${skipped} skipped (already on file), ${matched} matched now, ${waiting} waiting for their day; file connector`);
});

// Re-evaluate one transaction with the rules approved now (so the demo does not wait for the next tick).
function checkRematch(ctx: Ctx, txnRef: string): Refusal {
  const h = ctx.db.hold.txnRef.find(txnRef);
  if (h && (h.status === 'released' || h.status === 'rejected')) return `hold already ${h.status}`;
  if (!ctx.db.cardTxn.id.find(txnRef) && !ctx.db.tollTxn.id.find(txnRef) && !ctx.db.invoice.id.find(txnRef)) return 'no such transaction';
  return null;
}
function rematchOne(ctx: Ctx, txnRef: string) {
  const rules = approvedRules(ctx);
  const c = ctx.db.cardTxn.id.find(txnRef);
  if (c) { settle(ctx, c.id, 'card', c.cents, c.day, evaluateCard(ctx, c, rules), { rematch: true }); return; }
  const tl = ctx.db.tollTxn.id.find(txnRef);
  if (tl) { settle(ctx, tl.id, 'toll', tl.cents, tl.day, evaluateTollRow(ctx, tl), { rematch: true }); return; }
  const inv = ctx.db.invoice.id.find(txnRef);
  if (inv) { settle(ctx, inv.id, 'invoice', inv.cents, inv.receivedDay, evaluateInvoiceRow(ctx, inv, rules), { rematch: true }); return; }
}
function performRematch(ctx: Ctx, txnRef: string) {
  rematchOne(ctx, txnRef);
  audit(ctx, 'rematch', txnRef, '');
}
export const rematch = spacetimedb.reducer({ txnRef: t.string() }, (ctx, { txnRef }) =>
  guard(ctx, txnRef, checkRole(ctx, 'controller') ?? checkRematch(ctx, txnRef), () => performRematch(ctx, txnRef)));
export const tryRematch = spacetimedb.procedure({ txnRef: t.string() }, Outcome, (ctx, { txnRef }) =>
  attempt(ctx, txnRef, tx => checkRole(tx, 'controller') ?? checkRematch(tx, txnRef), tx => performRematch(tx, txnRef)));

// ---------------------------------------------------------------------------
// agent reducers (the worker). Version-locked claim makes two workers safe.
// ---------------------------------------------------------------------------
export const claimTask = spacetimedb.reducer({ id: t.u64(), version: t.u32() }, (ctx, { id, version }) => {
  requireRole(ctx, String(id), 'agent');
  const row = ctx.db.agentTask.id.find(id);
  if (!row || row.status !== 'open') throw new SenderError('task unavailable or already claimed');
  if (row.version !== version) throw new SenderError('stale claim');
  ctx.db.agentTask.id.update({ ...row, status: 'claimed', version: row.version + 1, claimedBy: ctx.sender, claimedAt: ctx.timestamp, updatedAt: ctx.timestamp });
  audit(ctx, 'claim_task', String(id), row.txnRef);
});

// The worker writes back what Droid did and found. recommendation: clear | hold | hold_and_ask | timeout | done
export const recordInvestigation = spacetimedb.reducer(
  { id: t.u64(), stepsJson: t.string(), findingJson: t.string(), recommendation: t.string(), question: t.option(t.string()), source: t.string() },
  (ctx, { id, stepsJson, findingJson, recommendation, question, source }) => {
    requireRole(ctx, String(id), 'agent');
    const row = ctx.db.agentTask.id.find(id);
    if (!row) refuse(ctx, String(id), 'no such task');
    if (!row.claimedBy || !row.claimedBy.isEqual(ctx.sender)) refuse(ctx, String(id), 'task not claimed by caller');
    if (row.status !== 'claimed') refuse(ctx, String(id), `task is ${row.status}`);
    if (!['clear', 'hold', 'hold_and_ask', 'timeout', 'done'].includes(recommendation)) refuse(ctx, String(id), `bad recommendation ${recommendation}`);
    if (stepsJson.length > 200_000 || findingJson.length > 50_000) refuse(ctx, String(id), 'payload too large');
    const status = recommendation === 'timeout' ? 'timeout' : 'investigated';
    ctx.db.agentTask.id.update({ ...row, status, version: row.version + 1, stepsJson, findingJson, source, updatedAt: ctx.timestamp });

    const h = ctx.db.hold.txnRef.find(row.txnRef);
    // Two tasks can land on one hold (investigate and vendor_check). The investigation owns the question:
    // a vendor check only asks when nobody has asked yet, and an investigation may replace a vendor check's question.
    const isVendorCheck = row.kind === 'vendor_check';
    const canAsk = h != null && h.answer === undefined && h.status !== 'released' && h.status !== 'rejected' && h.status !== 'cleared_by_rule'
      && (h.status === 'open' || (!isVendorCheck && h.status === 'awaiting_controller'));
    if (h && isVendorCheck && canAsk && h.question === undefined && (recommendation === 'hold_and_ask' || recommendation === 'hold') && question) {
      ctx.db.hold.txnRef.update({ ...h, question, status: 'awaiting_controller', actor: ctx.sender, updatedAt: ctx.timestamp });
    } else if (h && !isVendorCheck && canAsk) {
      if (recommendation === 'hold_and_ask' && question) {
        ctx.db.hold.txnRef.update({ ...h, question, status: 'awaiting_controller', actor: ctx.sender, updatedAt: ctx.timestamp });
      } else if (recommendation === 'clear') {
        // the agent proposes release; it can never approve its own proposal (see approvePayment)
        ctx.db.hold.txnRef.update({ ...h, requestedBy: ctx.sender, reason: 'agent recommends release', question: question ?? 'Agent recommends release. Approve the payment?', status: 'awaiting_controller', actor: ctx.sender, updatedAt: ctx.timestamp });
      } else if (recommendation === 'hold') {
        ctx.db.hold.txnRef.update({ ...h, reason: 'agent confirms hold', question: question ?? h.question, status: question ? 'awaiting_controller' : 'open', actor: ctx.sender, updatedAt: ctx.timestamp });
      }
    }
    audit(ctx, 'record_investigation', String(id), `${row.txnRef} ${recommendation} (${source})`);
  }
);

// The module computes the backtest itself from match_result and hold. The worker's numbers are a preview only.
function backtest(ctx: Ctx, condition: string, scope: RuleScope, fromDay: number, toDay: number) {
  const probe: RuleIn = { id: 0n, condition, scope, validFromDay: fromDay, validToDay: toDay };
  let n = 0, open = 0, confirmed = 0;
  const refs: string[] = [];
  const consider = (txnRef: string, day: number, evidenceJson: string) => {
    let ev: Record<string, unknown> = {};
    try { ev = JSON.parse(evidenceJson); } catch { ev = {}; }
    const facts = {
      day,
      driverId: typeof ev.driverId === 'number' ? ev.driverId : undefined,
      truckId: typeof ev.truckId === 'number' ? ev.truckId : undefined,
      cardId: typeof ev.cardId === 'string' ? ev.cardId : undefined,
      vendorId: typeof ev.vendorId === 'number' ? ev.vendorId : undefined,
    };
    if (!ruleCovers(probe, condition, facts)) return;
    n += 1;
    refs.push(txnRef);
    const h = ctx.db.hold.txnRef.find(txnRef);
    if (h?.status === 'rejected') confirmed += 1;
    else if (h && APPROVABLE.includes(h.status)) open += 1;
  };
  // rows still flagged with this code, plus holds that carry the code (their match_result may have changed)
  const seen = new Set<string>();
  for (const m of ctx.db.matchResult.code.filter(condition)) { seen.add(m.txnRef); consider(m.txnRef, m.day, m.evidenceJson); }
  for (const h of ctx.db.hold.code.filter(condition)) {
    if (seen.has(h.txnRef)) continue;
    const m = ctx.db.matchResult.txnRef.find(h.txnRef);
    if (m) consider(h.txnRef, h.day, m.evidenceJson);
  }
  return { n, wouldClear: n, openHoldsCovered: open, confirmedExceptionsCovered: confirmed, trueExceptionsCleared: confirmed,
    window: { fromDay, toDay }, sampleRefs: refs.slice(0, 12), computedBy: 'module' };
}

export const createRule = spacetimedb.reducer(
  { sourceTxnRef: t.string(), scopeJson: t.string(), condition: t.string(), backtestJson: t.string(), uses: t.string(), validFromDay: t.i32(), validToDay: t.i32(), reason: t.string() },
  (ctx, { sourceTxnRef, scopeJson, condition, backtestJson, uses, validFromDay, validToDay, reason }) => {
    requireRole(ctx, sourceTxnRef, 'agent');
    if (!(RULE_CONDITIONS as readonly string[]).includes(condition)) refuse(ctx, sourceTxnRef, `rules may not target ${condition}`);
    if (!['one_time', 'standing'].includes(uses)) refuse(ctx, sourceTxnRef, 'uses must be one_time or standing');
    if (validToDay < validFromDay) refuse(ctx, sourceTxnRef, 'rule window is empty');
    if (validToDay - validFromDay > 92) refuse(ctx, sourceTxnRef, 'rule window too long');
    const scope = parseScope(scopeJson);
    const scoped = scope.driverId !== undefined || (scope.truckIds && scope.truckIds.length > 0) || scope.cardId !== undefined || scope.vendorId !== undefined;
    if (!scoped) refuse(ctx, sourceTxnRef, 'rule must be scoped to a driver, truck, card or vendor');
    const bt = backtest(ctx, condition, scope, validFromDay, validToDay);
    if (bt.trueExceptionsCleared > 0) refuse(ctx, sourceTxnRef, `rule would clear ${bt.trueExceptionsCleared} confirmed exception(s)`);
    let preview: unknown = null;
    try { preview = JSON.parse(backtestJson); } catch { preview = null; }
    const inserted = ctx.db.rule.insert({
      id: 0n, sourceTxnRef, scopeJson: JSON.stringify(scope), condition, action: 'clear', backtestJson: JSON.stringify({ ...bt, workerPreview: preview }),
      status: 'candidate', uses, validFromDay, validToDay, createdBy: ctx.sender, approvedBy: undefined, reason, createdAt: ctx.timestamp,
    });
    audit(ctx, 'create_rule', String(inserted.id), `${condition} ${JSON.stringify(scope)} days ${validFromDay}-${validToDay}; backtest n=${bt.n} confirmed=${bt.confirmedExceptionsCovered}`);
  }
);

// ---------------------------------------------------------------------------
// controller actions (the ASI:One agent and the demo laptop)
// ---------------------------------------------------------------------------
const MAX_TEXT = 1000;
const MAX_NOTE = 500;
function textLimit(text: string | undefined, max: number, what: string): Refusal {
  if (text === undefined) return null;
  if (text.trim().length === 0) return `${what} is empty`;
  if (text.length > max) return `${what} is longer than ${max} characters`;
  return null;
}
function checkAnswerQuestion(ctx: Ctx, txnRef: string, text?: string): Refusal {
  const r = checkRole(ctx, 'controller'); if (r) return r;
  const h = ctx.db.hold.txnRef.find(txnRef);
  if (!h) return 'no such hold';
  if (h.status === 'released' || h.status === 'rejected' || h.status === 'cleared_by_rule') return `hold already ${h.status}`;
  return textLimit(text, MAX_TEXT, 'answer');
}
function performAnswerQuestion(ctx: Ctx, txnRef: string, text: string) {
  const h = ctx.db.hold.txnRef.find(txnRef)!;
  ctx.db.hold.txnRef.update({ ...h, answer: text, status: 'answered', actor: ctx.sender, updatedAt: ctx.timestamp });
  const mr = ctx.db.matchResult.txnRef.find(txnRef);
  let evidence: unknown = {};
  try { evidence = mr ? JSON.parse(mr.evidenceJson) : {}; } catch { evidence = {}; }
  const brief = { txnRef, kind: h.kind, code: h.code, cents: h.cents.toString(), day: h.day, date: dateForDay(h.day), question: h.question ?? '', answer: text, evidence };
  const day = currentDay(ctx);
  ctx.db.agentTask.insert({
    id: 0n, txnRef, kind: 'draft_rule', status: 'open', version: 0, claimedBy: undefined, claimedAt: undefined,
    briefJson: JSON.stringify(brief), stepsJson: '[]', findingJson: '', source: 'none', createdDay: day, createdAt: ctx.timestamp, updatedAt: ctx.timestamp,
  });
  audit(ctx, 'answer_question', txnRef, text.slice(0, 200));
}
export const answerQuestion = spacetimedb.reducer({ txnRef: t.string(), text: t.string() }, (ctx, { txnRef, text }) =>
  guard(ctx, txnRef, checkAnswerQuestion(ctx, txnRef, text), () => performAnswerQuestion(ctx, txnRef, text)));
export const tryAnswerQuestion = spacetimedb.procedure({ txnRef: t.string(), text: t.string() }, Outcome, (ctx, { txnRef, text }) =>
  attempt(ctx, txnRef, tx => checkAnswerQuestion(tx, txnRef, text), tx => performAnswerQuestion(tx, txnRef, text)));

function checkApproveRule(ctx: Ctx, id: bigint): Refusal {
  const r = checkRole(ctx, 'controller'); if (r) return r;
  const rule_ = ctx.db.rule.id.find(id);
  if (!rule_) return 'no such rule';
  if (rule_.status !== 'candidate') return `rule is ${rule_.status}`;
  if (rule_.createdBy.isEqual(ctx.sender)) return 'author cannot approve own rule';
  return null;
}
function performApproveRule(ctx: Ctx, id: bigint) {
  const r = ctx.db.rule.id.find(id)!;
  ctx.db.rule.id.update({ ...r, status: 'approved', approvedBy: ctx.sender });
  audit(ctx, 'approve_rule', String(id), `${r.condition} ${r.scopeJson}`);
  if (checkRematch(ctx, r.sourceTxnRef) === null) rematchOne(ctx, r.sourceTxnRef);
}
export const approveRule = spacetimedb.reducer({ id: t.u64() }, (ctx, { id }) =>
  guard(ctx, String(id), checkApproveRule(ctx, id), () => performApproveRule(ctx, id)));
export const tryApproveRule = spacetimedb.procedure({ id: t.u64() }, Outcome, (ctx, { id }) =>
  attempt(ctx, String(id), tx => checkApproveRule(tx, id), tx => performApproveRule(tx, id)));

function checkRejectRule(ctx: Ctx, id: bigint): Refusal {
  const r = checkRole(ctx, 'controller'); if (r) return r;
  const rule_ = ctx.db.rule.id.find(id);
  if (!rule_) return 'no such rule';
  if (rule_.status !== 'candidate') return `rule is ${rule_.status}`;
  return null;
}
function performRejectRule(ctx: Ctx, id: bigint, reason: string) {
  const r = ctx.db.rule.id.find(id)!;
  ctx.db.rule.id.update({ ...r, status: 'rejected', reason });
  audit(ctx, 'reject_rule', String(id), reason);
}
export const rejectRule = spacetimedb.reducer({ id: t.u64(), reason: t.string() }, (ctx, { id, reason }) =>
  guard(ctx, String(id), checkRejectRule(ctx, id), () => performRejectRule(ctx, id, reason)));
export const tryRejectRule = spacetimedb.procedure({ id: t.u64(), reason: t.string() }, Outcome, (ctx, { id, reason }) =>
  attempt(ctx, String(id), tx => checkRejectRule(tx, id), tx => performRejectRule(tx, id, reason)));

// A bank change is re-checked at approval time, not only at receipt: a vendor whose account changed
// within the window before today still needs a call-back note on any payment over the threshold.
function bankChangeActive(ctx: Ctx, txnRef: string, cents: bigint): boolean {
  if (cents <= T.BANK_CHANGE_MIN_CENTS) return false;
  const inv = ctx.db.invoice.id.find(txnRef);
  if (!inv) return false;
  const v = ctx.db.vendor.id.find(inv.vendorId);
  if (!v || v.bankChangedDay <= 0) return false;
  const since = currentDay(ctx) - v.bankChangedDay;
  return since >= 0 && since <= T.BANK_CHANGE_DAYS;
}
function checkApprovePayment(ctx: Ctx, txnRef: string, callbackNote: string | undefined): Refusal {
  const r = checkRole(ctx, 'controller'); if (r) return r;
  const h = ctx.db.hold.txnRef.find(txnRef);
  if (!h) return 'no such hold';
  if (!APPROVABLE.includes(h.status)) return `hold is ${h.status}`;
  if (h.requestedBy.isEqual(ctx.sender)) return 'requester cannot approve';
  if (ctx.db.payment.txnRef.find(txnRef)) return 'already paid';
  const needsNote = h.code === 'vendor_bank_change' || bankChangeActive(ctx, txnRef, h.cents);
  if (needsNote && (!callbackNote || callbackNote.trim().length < 8)) return 'call-back note required for a bank change';
  return textLimit(callbackNote, MAX_NOTE, 'call-back note');
}
function performApprovePayment(ctx: Ctx, txnRef: string, callbackNote: string | undefined) {
  const h = ctx.db.hold.txnRef.find(txnRef)!;
  ctx.db.hold.txnRef.update({ ...h, status: 'released', callbackNote, actor: ctx.sender, updatedAt: ctx.timestamp });
  ctx.db.payment.insert({ txnRef, cents: h.cents, day: currentDay(ctx), releasedBy: ctx.sender, releasedRole: 'controller', at: ctx.timestamp, bankTxnId: undefined });
  audit(ctx, 'approve_payment', txnRef, callbackNote ?? '');
}

// Settlement (Task 17). The worker records the mock bank's transfer id on an existing payment. There is no
// path here to create a payment: a settlement with no payment row is refused, so G3 holds.
export const recordSettlement = spacetimedb.reducer({ txnRef: t.string(), bankTxnId: t.string() }, (ctx, { txnRef, bankTxnId }) => {
  requireRole(ctx, txnRef, 'agent');
  const p = ctx.db.payment.txnRef.find(txnRef);
  if (!p) refuse(ctx, txnRef, 'no payment to settle');
  if (p.bankTxnId !== undefined) refuse(ctx, txnRef, `already settled as ${p.bankTxnId}`);
  if (bankTxnId.trim().length === 0 || bankTxnId.length > 120) refuse(ctx, txnRef, 'bank transaction id must be 1 to 120 characters');
  ctx.db.payment.txnRef.update({ ...p, bankTxnId });
  audit(ctx, 'settle', txnRef, `bank id ${bankTxnId}`);
});
export const approvePayment = spacetimedb.reducer({ txnRef: t.string(), callbackNote: t.option(t.string()) }, (ctx, { txnRef, callbackNote }) =>
  guard(ctx, txnRef, checkApprovePayment(ctx, txnRef, callbackNote), () => performApprovePayment(ctx, txnRef, callbackNote)));
export const tryApprovePayment = spacetimedb.procedure({ txnRef: t.string(), callbackNote: t.option(t.string()) }, Outcome, (ctx, { txnRef, callbackNote }) =>
  attempt(ctx, txnRef, tx => checkApprovePayment(tx, txnRef, callbackNote), tx => performApprovePayment(tx, txnRef, callbackNote)));

function checkRejectPayment(ctx: Ctx, txnRef: string, reason?: string): Refusal {
  const r = checkRole(ctx, 'controller'); if (r) return r;
  const h = ctx.db.hold.txnRef.find(txnRef);
  if (!h) return 'no such hold';
  if (!APPROVABLE.includes(h.status)) return `hold is ${h.status}`;
  return textLimit(reason, MAX_NOTE, 'reason');
}
function performRejectPayment(ctx: Ctx, txnRef: string, reason: string) {
  const h = ctx.db.hold.txnRef.find(txnRef)!;
  ctx.db.hold.txnRef.update({ ...h, status: 'rejected', reason, actor: ctx.sender, updatedAt: ctx.timestamp });
  audit(ctx, 'reject_payment', txnRef, reason);
}
export const rejectPayment = spacetimedb.reducer({ txnRef: t.string(), reason: t.string() }, (ctx, { txnRef, reason }) =>
  guard(ctx, txnRef, checkRejectPayment(ctx, txnRef, reason), () => performRejectPayment(ctx, txnRef, reason)));
export const tryRejectPayment = spacetimedb.procedure({ txnRef: t.string(), reason: t.string() }, Outcome, (ctx, { txnRef, reason }) =>
  attempt(ctx, txnRef, tx => checkRejectPayment(tx, txnRef, reason), tx => performRejectPayment(tx, txnRef, reason)));

// The ASI:One agent refused a write because the chat sender is not on its allowlist (ASI_ALLOWED_SENDERS).
// The controller identity records that refusal here; nothing else is written or performed.
const MAX_SENDER = 120;
function performRecordSeatRefusal(ctx: Ctx, sender: string) {
  const clean = sender.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim().slice(0, MAX_SENDER);
  audit(ctx, 'seat_refused', 'controller seat', `not authorised for this seat: ${clean}`);
}
export const tryRecordSeatRefusal = spacetimedb.procedure({ sender: t.string() }, Outcome, (ctx, { sender }) => {
  const out = attempt(ctx, 'controller seat', tx => checkRole(tx, 'controller'), tx => performRecordSeatRefusal(tx, sender));
  return out.ok ? { ok: true, message: 'recorded' } : out;
});

// A judge scenario: insert one fuel transaction into the current day and run the kernel on it.
// The caller is recorded as the hold's requester, so the same controller cannot approve what it injected.
export const injectCardTxn = spacetimedb.reducer({ row: cardTxn.rowType }, (ctx, { row }) => {
  requireRole(ctx, row.id, 'controller');
  if (ctx.db.cardTxn.id.find(row.id)) refuse(ctx, row.id, 'txn id exists');
  const day = currentDay(ctx);
  const inserted = { ...row, day };
  ctx.db.cardTxn.insert(inserted);
  audit(ctx, 'inject', row.id, `truck ${row.truckId} ${row.gallons} gal`);
  settle(ctx, row.id, 'card', row.cents, day, evaluateCard(ctx, inserted, approvedRules(ctx)), { requester: ctx.sender });
});
