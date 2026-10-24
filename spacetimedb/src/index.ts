// Dispatch Ledger module. One shared room: all state and every permission check live here.
// Three roles (seed, agent, controller). Every reducer: requireRole, the change, audit.
import { SenderError, t, type InferSchema, type ReducerCtx } from 'spacetimedb/server';
import { ScheduleAt } from 'spacetimedb';
import spacetimedb, {
  agentTask, businessDay, cardTxn, contract, dayTimer, driver, hold, invoice, matchResult, payment,
  po, rule, terminal, tollTxn, tripPing, truck, vendor,
} from './schema';
import { T, FORBIDDEN_RULE_CONDITIONS } from './thresholds';
import { dateForDay } from './calendar';
import {
  autoPayDecision, evaluateCardTxn, evaluateInvoice, evaluateToll,
  type PingIn, type RuleIn, type TollIn, type InvoiceIn, type Verdict,
} from './kernel';

export { default } from './schema';

type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;

const TICK_MICROS = 2_000_000n;

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

function refuse(ctx: Ctx, ref: string, why: string): never {
  audit(ctx, 'refused', ref, why);
  throw new SenderError(why);
}

function requireRole(ctx: Ctx, ref: string, ...allowed: string[]) {
  const r = roleOf(ctx);
  if (!allowed.includes(r)) refuse(ctx, ref, `${r} may not do this (needs ${allowed.join(' or ')})`);
  return r;
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
  if (!['seed', 'agent', 'controller'].includes(r)) refuse(ctx, identity.toHexString(), `unknown role ${r}`);
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
export const setClock = spacetimedb.reducer({ paused: t.bool() }, (ctx, { paused }) => {
  requireRole(ctx, 'clock', 'seed', 'controller');
  const d = ctx.db.businessDay.id.find(1)!;
  ctx.db.businessDay.id.update({ ...d, paused });
  audit(ctx, 'set_clock', String(d.day), paused ? 'paused' : 'running');
});

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
export const stepDay = spacetimedb.reducer(ctx => {
  requireRole(ctx, 'clock', 'seed', 'controller');
  advance(ctx);
});

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
    if (r.validToDay < day) ctx.db.rule.id.update({ ...r, status: 'expired' });
  }
}

// ---------------------------------------------------------------------------
// the kernel, applied to one day. Internal: nobody can replay a day from outside.
// ---------------------------------------------------------------------------
function approvedRules(ctx: Ctx): RuleIn[] {
  const out: RuleIn[] = [];
  for (const r of ctx.db.rule.status.filter('approved')) {
    let scope = {};
    try { scope = JSON.parse(r.scopeJson); } catch { scope = {}; }
    out.push({ id: r.id, condition: r.condition, scope, validFromDay: r.validFromDay, validToDay: r.validToDay });
  }
  return out;
}

function pingsFor(ctx: Ctx, truckId: number, day: number): PingIn[] {
  const out: PingIn[] = [];
  for (const p of ctx.db.tripPing.by_truck_day.filter([truckId, day])) {
    out.push({ atMicros: p.at.microsSinceUnixEpoch, lat: p.lat, lon: p.lon, engineOn: p.engineOn, odometer: p.odometer });
  }
  return out;
}

function evaluateCard(ctx: Ctx, c: typeof cardTxn.rowType.type, rules: RuleIn[]): Verdict {
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

function evaluateTollRow(ctx: Ctx, tl: typeof tollTxn.rowType.type): Verdict {
  const earlier: TollIn[] = [];
  for (const e of ctx.db.tollTxn.plate.filter(tl.plate)) {
    if (e.at.microsSinceUnixEpoch <= tl.at.microsSinceUnixEpoch && e.id !== tl.id) {
      earlier.push({ id: e.id, plate: e.plate, truckId: e.truckId, atMicros: e.at.microsSinceUnixEpoch, day: e.day, plazaId: e.plazaId, plazaName: e.plazaName, cents: e.cents });
    }
  }
  const v = evaluateToll(
    { id: tl.id, plate: tl.plate, truckId: tl.truckId, atMicros: tl.at.microsSinceUnixEpoch, day: tl.day, plazaId: tl.plazaId, plazaName: tl.plazaName, cents: tl.cents },
    earlier
  );
  v.evidence = { ...v.evidence, atMicros: tl.at.microsSinceUnixEpoch.toString(), date: dateForDay(tl.day) };
  return v;
}

function evaluateInvoiceRow(ctx: Ctx, inv: typeof invoice.rowType.type, rules: RuleIn[]): Verdict {
  const p = inv.poId ? ctx.db.po.id.find(inv.poId) : undefined;
  const vend = ctx.db.vendor.id.find(inv.vendorId);
  let ct: typeof contract.rowType.type | undefined;
  if (p) {
    for (const c of ctx.db.contract.vendorId.filter(inv.vendorId)) {
      if (c.item === p.item && c.validFromDay <= inv.receivedDay && c.validToDay >= inv.receivedDay) { ct = c; break; }
    }
  }
  const earlier: InvoiceIn[] = [];
  for (const e of ctx.db.invoice.vendorId.filter(inv.vendorId)) {
    if (e.id !== inv.id && e.receivedDay <= inv.receivedDay) {
      earlier.push({ id: e.id, vendorId: e.vendorId, poId: e.poId, receivedDay: e.receivedDay, item: e.item, qty: e.qty, unitCents: e.unitCents, cents: e.cents, docRef: e.docRef });
    }
  }
  const v = evaluateInvoice(
    { id: inv.id, vendorId: inv.vendorId, poId: inv.poId, receivedDay: inv.receivedDay, item: inv.item, qty: inv.qty, unitCents: inv.unitCents, cents: inv.cents, docRef: inv.docRef },
    p ? { id: p.id, vendorId: p.vendorId, truckId: p.truckId, item: p.item, qty: p.qty, unitCents: p.unitCents, receivedQty: p.receivedQty } : undefined,
    ct ? { id: ct.id, vendorId: ct.vendorId, item: ct.item, rateCents: ct.rateCents, validFromDay: ct.validFromDay, validToDay: ct.validToDay } : undefined,
    vend ? { id: vend.id, name: vend.name, bankChangedDay: vend.bankChangedDay } : undefined,
    earlier,
    rules
  );
  v.evidence = { ...v.evidence, date: dateForDay(inv.receivedDay), contractClause: ct?.clause ?? '' };
  return v;
}

function bumpDay(ctx: Ctx, day: number, f: (t: typeof dayTotal_t) => typeof dayTotal_t) {
  const cur = ctx.db.dayTotal.day.find(day) ?? { day, autoPaidCents: 0n, autoPaidCount: 0, holdCount: 0, rejectedCount: 0, txnCount: 0 };
  const next = f(cur);
  if (ctx.db.dayTotal.day.find(day)) ctx.db.dayTotal.day.update(next); else ctx.db.dayTotal.insert(next);
}
type DayTotalRow = { day: number; autoPaidCents: bigint; autoPaidCount: number; holdCount: number; rejectedCount: number; txnCount: number };
declare const dayTotal_t: DayTotalRow;

const QUESTION_HINT: Record<string, string> = {
  location_mismatch: 'Was this card used by a different truck or driver that day?',
  rate_variance: 'Is the higher unit price agreed anywhere outside the contract?',
  duplicate_invoice: 'Which PO is the real one?',
  short_received: 'Pay the received quantity only, or wait for the rest?',
  vendor_bank_change: 'Call the vendor on a known number and record who confirmed the new account.',
  capacity_exceeded: '',
  limit: 'Approve this payment above the auto-pay limit?',
};

// Writes the outcome of one verdict: match_result, then payment or hold (+ task), with audit.
function settle(ctx: Ctx, txnRef: string, kind: string, cents: bigint, day: number, v: Verdict, rematch = false) {
  const evidenceJson = JSON.stringify(v.evidence);
  const existing = ctx.db.matchResult.txnRef.find(txnRef);
  const row = { txnRef, kind, code: v.code, cents, day, evidenceJson, ruleId: v.ruleId, decidedAt: ctx.timestamp };
  if (existing) ctx.db.matchResult.txnRef.update(row); else ctx.db.matchResult.insert(row);
  bumpDay(ctx, day, t => ({ ...t, txnCount: rematch ? t.txnCount : t.txnCount + 1 }));

  if (v.code === 'duplicate_toll') {
    bumpDay(ctx, day, t => ({ ...t, rejectedCount: t.rejectedCount + 1 }));
    audit(ctx, 'auto_reject', txnRef, `duplicate_toll of ${String(v.evidence.duplicateOf)}`);
    return;
  }

  if (v.code === 'matched') {
    const total = ctx.db.dayTotal.day.find(day)?.autoPaidCents ?? 0n;
    const decision = autoPayDecision(cents, total);
    if (decision === 'pay') {
      if (!ctx.db.payment.txnRef.find(txnRef)) {
        ctx.db.payment.insert({ txnRef, cents, day, releasedBy: ctx.sender, releasedRole: v.ruleId ? 'rule' : 'kernel', at: ctx.timestamp });
        bumpDay(ctx, day, t => ({ ...t, autoPaidCents: t.autoPaidCents + cents, autoPaidCount: t.autoPaidCount + 1 }));
      }
      const h = ctx.db.hold.txnRef.find(txnRef);
      if (h && h.status !== 'released') {
        ctx.db.hold.txnRef.update({ ...h, status: 'cleared_by_rule', ruleId: v.ruleId, actor: ctx.sender, updatedAt: ctx.timestamp });
      }
      audit(ctx, v.ruleId ? 'cleared_by_rule' : 'auto_pay', txnRef, v.ruleId ? `rule ${v.ruleId}` : `${cents} cents`);
      return;
    }
    v = { code: 'limit', evidence: { ...v.evidence, limitReason: cents > T.AUTO_PAY_MAX_CENTS ? 'per_transaction' : 'daily_cap' } };
    ctx.db.matchResult.txnRef.update({ ...row, code: 'limit', evidenceJson: JSON.stringify(v.evidence) });
  }

  // a hold, raised by code
  const h = ctx.db.hold.txnRef.find(txnRef);
  if (!h) {
    ctx.db.hold.insert({
      txnRef, kind, code: v.code, cents, day, requestedBy: ctx.identity, reason: `kernel: ${v.code}`,
      question: undefined, answer: undefined, callbackNote: undefined, status: 'open', ruleId: undefined, actor: ctx.sender, updatedAt: ctx.timestamp,
    });
    bumpDay(ctx, day, t => ({ ...t, holdCount: t.holdCount + 1 }));
    audit(ctx, 'hold', txnRef, v.code);
  } else if (h.code !== v.code) {
    ctx.db.hold.txnRef.update({ ...h, code: v.code, actor: ctx.sender, updatedAt: ctx.timestamp });
    audit(ctx, 'hold_recoded', txnRef, `${h.code} -> ${v.code}`);
  }
  if (!rematch && v.code !== 'limit') {
    const brief = { txnRef, kind, code: v.code, cents: cents.toString(), day, date: dateForDay(day), evidence: v.evidence, questionHint: QUESTION_HINT[v.code] ?? '' };
    ctx.db.agentTask.insert({
      id: 0n, txnRef, kind: 'investigate', status: 'open', version: 0, claimedBy: undefined, claimedAt: undefined,
      briefJson: JSON.stringify(brief), stepsJson: '[]', findingJson: '', source: 'none', createdDay: day, createdAt: ctx.timestamp, updatedAt: ctx.timestamp,
    });
  }
}

function matchDay(ctx: Ctx, day: number) {
  const rules = approvedRules(ctx);
  for (const c of ctx.db.cardTxn.day.filter(day)) {
    if (ctx.db.matchResult.txnRef.find(c.id)) continue; // re-running a day is a no-op
    settle(ctx, c.id, 'card', c.cents, day, evaluateCard(ctx, c, rules));
  }
  for (const tl of ctx.db.tollTxn.day.filter(day)) {
    if (ctx.db.matchResult.txnRef.find(tl.id)) continue;
    settle(ctx, tl.id, 'toll', tl.cents, day, evaluateTollRow(ctx, tl));
  }
  for (const inv of ctx.db.invoice.receivedDay.filter(day)) {
    if (ctx.db.matchResult.txnRef.find(inv.id)) continue;
    settle(ctx, inv.id, 'invoice', inv.cents, day, evaluateInvoiceRow(ctx, inv, rules));
  }
}

// Re-evaluate one transaction with the rules approved now (so the demo does not wait for the next tick).
function rematchOne(ctx: Ctx, txnRef: string) {
  const rules = approvedRules(ctx);
  const c = ctx.db.cardTxn.id.find(txnRef);
  if (c) { settle(ctx, c.id, 'card', c.cents, c.day, evaluateCard(ctx, c, rules), true); return; }
  const tl = ctx.db.tollTxn.id.find(txnRef);
  if (tl) { settle(ctx, tl.id, 'toll', tl.cents, tl.day, evaluateTollRow(ctx, tl), true); return; }
  const inv = ctx.db.invoice.id.find(txnRef);
  if (inv) { settle(ctx, inv.id, 'invoice', inv.cents, inv.receivedDay, evaluateInvoiceRow(ctx, inv, rules), true); return; }
  refuse(ctx, txnRef, 'no such transaction');
}

export const rematch = spacetimedb.reducer({ txnRef: t.string() }, (ctx, { txnRef }) => {
  requireRole(ctx, txnRef, 'controller', 'seed');
  rematchOne(ctx, txnRef);
  audit(ctx, 'rematch', txnRef, '');
});

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

// The worker writes back what Droid did and found. recommendation: clear | hold | hold_and_ask | timeout
export const recordInvestigation = spacetimedb.reducer(
  { id: t.u64(), stepsJson: t.string(), findingJson: t.string(), recommendation: t.string(), question: t.option(t.string()), source: t.string() },
  (ctx, { id, stepsJson, findingJson, recommendation, question, source }) => {
    requireRole(ctx, String(id), 'agent');
    const row = ctx.db.agentTask.id.find(id);
    if (!row) refuse(ctx, String(id), 'no such task');
    if (!row.claimedBy || !row.claimedBy.isEqual(ctx.sender)) refuse(ctx, String(id), 'task not claimed by caller');
    if (!['clear', 'hold', 'hold_and_ask', 'timeout', 'done'].includes(recommendation)) refuse(ctx, String(id), `bad recommendation ${recommendation}`);
    if (stepsJson.length > 200_000 || findingJson.length > 50_000) refuse(ctx, String(id), 'payload too large');
    const status = recommendation === 'timeout' ? 'timeout' : 'investigated';
    ctx.db.agentTask.id.update({ ...row, status, version: row.version + 1, stepsJson, findingJson, source, updatedAt: ctx.timestamp });

    const h = ctx.db.hold.txnRef.find(row.txnRef);
    if (h && h.status === 'open') {
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

export const createRule = spacetimedb.reducer(
  { sourceTxnRef: t.string(), scopeJson: t.string(), condition: t.string(), backtestJson: t.string(), uses: t.string(), validFromDay: t.i32(), validToDay: t.i32(), reason: t.string() },
  (ctx, { sourceTxnRef, scopeJson, condition, backtestJson, uses, validFromDay, validToDay, reason }) => {
    requireRole(ctx, sourceTxnRef, 'agent');
    if ((FORBIDDEN_RULE_CONDITIONS as readonly string[]).includes(condition)) refuse(ctx, sourceTxnRef, `rules may not target ${condition}`);
    if (!['one_time', 'standing'].includes(uses)) refuse(ctx, sourceTxnRef, `uses must be one_time or standing`);
    if (validToDay < validFromDay) refuse(ctx, sourceTxnRef, 'rule window is empty');
    if (validToDay - validFromDay > 92) refuse(ctx, sourceTxnRef, 'rule window too long');
    let scope: Record<string, unknown> = {};
    try { scope = JSON.parse(scopeJson); } catch { refuse(ctx, sourceTxnRef, 'scopeJson is not JSON'); }
    const scoped = ['driverId', 'truckIds', 'cardId', 'vendorId'].some(k => scope[k] !== undefined && scope[k] !== null && !(Array.isArray(scope[k]) && (scope[k] as unknown[]).length === 0));
    if (!scoped) refuse(ctx, sourceTxnRef, 'rule must be scoped to a driver, truck, card or vendor');
    let backtest: { trueExceptionsCleared?: number } = {};
    try { backtest = JSON.parse(backtestJson); } catch { refuse(ctx, sourceTxnRef, 'backtestJson is not JSON'); }
    if ((backtest.trueExceptionsCleared ?? 0) > 0) refuse(ctx, sourceTxnRef, 'rule would clear a confirmed exception');
    const inserted = ctx.db.rule.insert({
      id: 0n, sourceTxnRef, scopeJson, condition, action: 'clear', backtestJson, status: 'candidate', uses, validFromDay, validToDay,
      createdBy: ctx.sender, approvedBy: undefined, reason, createdAt: ctx.timestamp,
    });
    audit(ctx, 'create_rule', String(inserted.id), `${condition} for ${sourceTxnRef}`);
  }
);

// ---------------------------------------------------------------------------
// controller reducers (the ASI:One agent and the demo laptop)
// ---------------------------------------------------------------------------
export const answerQuestion = spacetimedb.reducer({ txnRef: t.string(), text: t.string() }, (ctx, { txnRef, text }) => {
  requireRole(ctx, txnRef, 'controller');
  const h = ctx.db.hold.txnRef.find(txnRef);
  if (!h) refuse(ctx, txnRef, 'no such hold');
  if (h.status === 'released' || h.status === 'rejected') refuse(ctx, txnRef, `hold already ${h.status}`);
  ctx.db.hold.txnRef.update({ ...h, answer: text, status: 'answered', actor: ctx.sender, updatedAt: ctx.timestamp });
  const mr = ctx.db.matchResult.txnRef.find(txnRef);
  const brief = { txnRef, kind: h.kind, code: h.code, cents: h.cents.toString(), day: h.day, question: h.question ?? '', answer: text, evidence: mr ? JSON.parse(mr.evidenceJson) : {} };
  const day = currentDay(ctx);
  ctx.db.agentTask.insert({
    id: 0n, txnRef, kind: 'draft_rule', status: 'open', version: 0, claimedBy: undefined, claimedAt: undefined,
    briefJson: JSON.stringify(brief), stepsJson: '[]', findingJson: '', source: 'none', createdDay: day, createdAt: ctx.timestamp, updatedAt: ctx.timestamp,
  });
  audit(ctx, 'answer_question', txnRef, text.slice(0, 200));
});

export const approveRule = spacetimedb.reducer({ id: t.u64() }, (ctx, { id }) => {
  requireRole(ctx, String(id), 'controller');
  const r = ctx.db.rule.id.find(id);
  if (!r) refuse(ctx, String(id), 'no such rule');
  if (r.status !== 'candidate') refuse(ctx, String(id), `rule is ${r.status}`);
  if (r.createdBy.isEqual(ctx.sender)) refuse(ctx, String(id), 'author cannot approve own rule');
  ctx.db.rule.id.update({ ...r, status: 'approved', approvedBy: ctx.sender });
  audit(ctx, 'approve_rule', String(id), `${r.condition} ${r.scopeJson}`);
  if (ctx.db.cardTxn.id.find(r.sourceTxnRef) || ctx.db.invoice.id.find(r.sourceTxnRef)) rematchOne(ctx, r.sourceTxnRef);
});

export const rejectRule = spacetimedb.reducer({ id: t.u64(), reason: t.string() }, (ctx, { id, reason }) => {
  requireRole(ctx, String(id), 'controller');
  const r = ctx.db.rule.id.find(id);
  if (!r) refuse(ctx, String(id), 'no such rule');
  ctx.db.rule.id.update({ ...r, status: 'rejected', reason });
  audit(ctx, 'reject_rule', String(id), reason);
});

export const approvePayment = spacetimedb.reducer({ txnRef: t.string(), callbackNote: t.option(t.string()) }, (ctx, { txnRef, callbackNote }) => {
  requireRole(ctx, txnRef, 'controller');
  const h = ctx.db.hold.txnRef.find(txnRef);
  if (!h) refuse(ctx, txnRef, 'no such hold');
  if (h.status === 'released') refuse(ctx, txnRef, 'already released');
  if (h.requestedBy.isEqual(ctx.sender)) refuse(ctx, txnRef, 'requester cannot approve');
  if (h.code === 'vendor_bank_change' && (!callbackNote || callbackNote.trim().length < 8)) refuse(ctx, txnRef, 'call-back note required for a bank change');
  if (ctx.db.payment.txnRef.find(txnRef)) refuse(ctx, txnRef, 'already paid');
  ctx.db.hold.txnRef.update({ ...h, status: 'released', callbackNote, actor: ctx.sender, updatedAt: ctx.timestamp });
  ctx.db.payment.insert({ txnRef, cents: h.cents, day: currentDay(ctx), releasedBy: ctx.sender, releasedRole: 'controller', at: ctx.timestamp });
  audit(ctx, 'approve_payment', txnRef, callbackNote ?? '');
});

export const rejectPayment = spacetimedb.reducer({ txnRef: t.string(), reason: t.string() }, (ctx, { txnRef, reason }) => {
  requireRole(ctx, txnRef, 'controller');
  const h = ctx.db.hold.txnRef.find(txnRef);
  if (!h) refuse(ctx, txnRef, 'no such hold');
  if (h.status === 'released') refuse(ctx, txnRef, 'already released');
  ctx.db.hold.txnRef.update({ ...h, status: 'rejected', reason, actor: ctx.sender, updatedAt: ctx.timestamp });
  audit(ctx, 'reject_payment', txnRef, reason);
});

// A judge scenario: insert one fuel transaction into the current day and run the kernel on it.
export const injectCardTxn = spacetimedb.reducer({ row: cardTxn.rowType }, (ctx, { row }) => {
  requireRole(ctx, row.id, 'seed', 'controller');
  if (ctx.db.cardTxn.id.find(row.id)) refuse(ctx, row.id, 'txn id exists');
  const day = currentDay(ctx);
  ctx.db.cardTxn.insert({ ...row, day });
  audit(ctx, 'inject', row.id, `truck ${row.truckId} ${row.gallons} gal`);
  settle(ctx, row.id, 'card', row.cents, day, evaluateCard(ctx, { ...row, day }, approvedRules(ctx)));
});
