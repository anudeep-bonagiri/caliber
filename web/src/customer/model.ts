// Everything the customer view says, built from ledger rows only.
// Sentences are templates over structured fields (match_result.evidence_json and the hold row), never the
// investigator's prose (G13): every number below is read from a row and formatted, none is computed for show.
import type { AgentTask, AuditEvent, Hold, IngestLog, MatchResult, Payment, Rule } from '../../../module_bindings/types';
import { parseJson, type Backtest, type Finding, type FindingEvidence, type RuleScope } from '../lib/types';
import { CARRIER_TIME_ZONE } from './carrier';

export type Evidence = {
  txnRef?: string;
  cardId?: string;
  truckId?: number;
  driverId?: number;
  driverName?: string;
  plate?: string;
  stationName?: string;
  stationLat?: number;
  stationLon?: number;
  gallons?: number;
  merchant?: string;
  atMicros?: string;
  date?: string;
  nearestPing?: { lat?: number; lon?: number; atMicros?: string; deltaMin?: number; engineOn?: boolean } | null;
  distanceMiles?: number;
  reason?: string;
  tankGal?: number;
  capacityLimitGal?: number;
  vendorId?: number;
  vendorName?: string;
  poId?: string | null;
  item?: string;
  qty?: number;
  unitCents?: string;
  receivedDay?: number;
  referenceKind?: string;
  contractRateCents?: string;
  variancePct?: number;
  duplicateOf?: string;
  daysApart?: number;
  daysSinceChange?: number;
  poQty?: number;
  receivedQty?: number;
  proposedPartialCents?: string;
  limitReason?: string;
  plazaName?: string;
};

// ---------------------------------------------------------------------------
// formatting
// ---------------------------------------------------------------------------
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function money(cents: bigint | number | string | undefined | null): string {
  if (cents === undefined || cents === null || cents === '') return '$0.00';
  const n = Number(cents);
  return Number.isFinite(n) ? usd.format(n / 100) : '$0.00';
}

export function qty(n: number | undefined): string {
  if (n === undefined || !Number.isFinite(n)) return '';
  return n.toLocaleString('en-US', { maximumFractionDigits: 3 });
}

/** "2026-08-26" -> "Aug 26" (UTC, so the simulated calendar never shifts). */
export function shortDate(iso: string | undefined): string {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  return m ? `${MON[Number(m[2]) - 1]} ${Number(m[3])}` : '';
}

// Same arithmetic as spacetimedb/src/calendar.ts: business day 1 is Wed 2026-07-01, weekends skipped.
const DAY_MS = 86_400_000;
const START_UTC = Date.UTC(2026, 6, 1);
export function dateForDay(day: number): string {
  if (day <= 0) return '2026-07-01';
  let remaining = day;
  let ms = START_UTC - DAY_MS;
  while (remaining > 0) {
    ms += DAY_MS;
    const dow = new Date(ms).getUTCDay();
    if (dow !== 0 && dow !== 6) remaining -= 1;
  }
  return new Date(ms).toISOString().slice(0, 10);
}
export const dayDate = (day: number) => shortDate(dateForDay(day));

const timeFmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: CARRIER_TIME_ZONE });
export function clockFromMicros(micros: string | bigint | undefined): string {
  if (micros === undefined || micros === '') return '';
  try {
    return timeFmt.format(new Date(Number(BigInt(micros) / 1000n)));
  } catch {
    return '';
  }
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
}

export function evidenceOf(m: MatchResult | undefined): Evidence {
  return m ? parseJson<Evidence>(m.evidenceJson, {}) : {};
}

// ---------------------------------------------------------------------------
// who: names come from the ledger's own evidence rows, never from a list in this file
// ---------------------------------------------------------------------------
export type Names = { drivers: Map<number, string>; vendors: Map<number, string>; cardToTruck: Map<string, number> };

export function namesFrom(matches: readonly MatchResult[]): Names {
  const drivers = new Map<number, string>();
  const vendors = new Map<number, string>();
  const cardToTruck = new Map<string, number>();
  for (const m of matches) {
    const ev = evidenceOf(m);
    if (typeof ev.driverId === 'number' && ev.driverName) drivers.set(ev.driverId, ev.driverName);
    if (typeof ev.vendorId === 'number' && ev.vendorName) vendors.set(ev.vendorId, ev.vendorName);
    if (ev.cardId && typeof ev.truckId === 'number' && !cardToTruck.has(ev.cardId)) cardToTruck.set(ev.cardId, ev.truckId);
  }
  return { drivers, vendors, cardToTruck };
}

export const driverWord = (names: Names, id: number) => names.drivers.get(id) ?? `driver ${id}`;
export const vendorWord = (names: Names, id: number) => names.vendors.get(id) ?? `vendor ${id}`;

// ---------------------------------------------------------------------------
// tiles
// ---------------------------------------------------------------------------
export const RESOLVED = new Set(['released', 'rejected', 'cleared_by_rule']);

export type Tiles = {
  needs: { cents: bigint; count: number; oldestDays: number | null; refs: string[] };
  paidToday: { cents: bigint; count: number };
  caught: { cents: bigint; holds: number; duplicates: number };
};

export function tilesFrom(holds: readonly Hold[], payments: readonly Payment[], matches: readonly MatchResult[], today: number | undefined): Tiles {
  let needCents = 0n;
  let oldest: number | null = null;
  const refs: string[] = [];
  let caughtCents = 0n;
  let caughtHolds = 0;
  for (const h of holds) {
    if (h.status === 'awaiting_controller') {
      needCents += h.cents;
      refs.push(h.txnRef);
      if (oldest === null || h.day < oldest) oldest = h.day;
    }
    if (h.code !== 'limit' && (h.status === 'rejected' || !RESOLVED.has(h.status))) {
      caughtCents += h.cents;
      caughtHolds++;
    }
  }
  let dupCount = 0;
  for (const m of matches) {
    if (m.code === 'duplicate_toll') {
      caughtCents += m.cents;
      dupCount++;
    }
  }
  let paidCents = 0n;
  let paidCount = 0;
  for (const p of payments) {
    if (today !== undefined && p.day === today && (p.releasedRole === 'kernel' || p.releasedRole === 'rule')) {
      paidCents += p.cents;
      paidCount++;
    }
  }
  return {
    needs: { cents: needCents, count: refs.length, oldestDays: oldest === null || today === undefined ? null : Math.max(0, today - oldest), refs },
    paidToday: { cents: paidCents, count: paidCount },
    caught: { cents: caughtCents, holds: caughtHolds, duplicates: dupCount },
  };
}

export const CAUGHT_DEFINITION =
  'Money Caliber stopped this quarter (the 92 business days of the simulation): charges it held for a problem, other than amounts held only for being over the auto-pay limit, that you turned down or that are still waiting, plus duplicate tolls it turned down on its own.';

// ---------------------------------------------------------------------------
// hold card sentence, one template per code
// ---------------------------------------------------------------------------
function onDate(ev: Evidence, h: Hold): string {
  return shortDate(ev.date) || dayDate(h.day);
}

// Item codes are stored as snake case ("brake_job"); a sentence says "brake job".
const itemWord = (item: string) => item.replace(/_/g, ' ');

function vendorOf(ev: Evidence, names: Names): string {
  if (ev.vendorName) return ev.vendorName;
  return typeof ev.vendorId === 'number' ? vendorWord(names, ev.vendorId) : 'A vendor';
}

function fuelLead(ev: Evidence, h: Hold): string {
  const card = ev.cardId ? `Fuel card ${ev.cardId}` : 'A fuel card';
  const truck = typeof ev.truckId === 'number' ? ` (Truck ${ev.truckId})` : '';
  const gal = ev.gallons !== undefined ? ` for ${qty(ev.gallons)} gallons` : '';
  const at = ev.stationName ? ` at ${ev.stationName}` : '';
  return `${card}${truck} paid ${money(h.cents)}${gal}${at} on ${onDate(ev, h)}.`;
}

export function holdSentence(h: Hold, ev: Evidence, names: Names): string {
  const truck = typeof ev.truckId === 'number' ? `Truck ${ev.truckId}` : 'The truck';
  switch (h.code) {
    case 'location_mismatch': {
      if (ev.reason === 'card not assigned to a truck') return `${fuelLead(ev, h)} That card is not assigned to any truck.`;
      const p = ev.nearestPing;
      if (!p) {
        const mins = ev.reason ? /(\d+)\s*minutes/.exec(ev.reason)?.[1] : undefined;
        return `${fuelLead(ev, h)} ${truck} sent no GPS position${mins ? ` within ${mins} minutes of the charge` : ' near the time of the charge'}.`;
      }
      const engine = p.engineOn === undefined ? '' : p.engineOn ? ' with the engine running' : ' with the engine off';
      const miles = ev.distanceMiles !== undefined ? `${qty(ev.distanceMiles)} miles away` : 'somewhere else';
      return `${fuelLead(ev, h)} ${truck}'s GPS at that time put it ${miles}${engine}.`;
    }
    case 'capacity_exceeded': {
      const tank = ev.tankGal !== undefined ? ` ${truck}'s tank holds ${qty(ev.tankGal)} gallons` : ` That is more than ${truck}'s tank holds`;
      const most = ev.capacityLimitGal !== undefined && ev.tankGal !== undefined ? `, so the most it can take in one fill is ${qty(ev.capacityLimitGal)} gallons.` : '.';
      return `${fuelLead(ev, h)}${tank}${most}`;
    }
    case 'rate_variance': {
      const what = ev.qty !== undefined && ev.item ? ` for ${qty(ev.qty)} x ${itemWord(ev.item)}` : ev.item ? ` for ${itemWord(ev.item)}` : '';
      const unit = ev.unitCents ? ` at ${money(ev.unitCents)} each` : '';
      const ref = ev.referenceKind === 'po' ? 'purchase order price' : 'contract rate';
      const rate = ev.contractRateCents ? ` The ${ref} is ${money(ev.contractRateCents)}${ev.variancePct !== undefined ? `, so this is ${qty(ev.variancePct)}% higher` : ''}.` : ` That is above the ${ref}.`;
      return `${vendorOf(ev, names)} billed ${money(h.cents)} on invoice ${h.txnRef}${what}${unit}.${rate}`;
    }
    case 'duplicate_invoice': {
      const days = ev.daysApart !== undefined ? ` from ${plural(ev.daysApart, 'day')} earlier` : '';
      const dup = ev.duplicateOf ? ` It matches invoice ${ev.duplicateOf}, same amount${days}, under a different purchase order.` : ' It looks like an invoice already on file.';
      return `${vendorOf(ev, names)} sent invoice ${h.txnRef} for ${money(h.cents)} on ${onDate(ev, h)}.${dup}`;
    }
    case 'short_received': {
      const what = ev.qty !== undefined && ev.item ? ` for ${qty(ev.qty)} x ${itemWord(ev.item)}` : '';
      const po = ev.poId ? ` on purchase order ${ev.poId}` : '';
      const recv = ev.receivedQty !== undefined && ev.poQty !== undefined ? ` Only ${qty(ev.receivedQty)} of ${qty(ev.poQty)} have been received.` : ' Not all of it has been received.';
      const part = ev.proposedPartialCents ? ` Paying for what arrived would be ${money(ev.proposedPartialCents)}.` : '';
      return `${vendorOf(ev, names)} billed ${money(h.cents)}${what}${po}.${recv}${part}`;
    }
    case 'vendor_bank_change': {
      const when = ev.daysSinceChange !== undefined ? (ev.daysSinceChange === 0 ? ' the same day the invoice arrived' : ` ${plural(ev.daysSinceChange, 'day')} before the invoice arrived`) : ' just before the invoice arrived';
      return `${vendorOf(ev, names)} sent invoice ${h.txnRef} for ${money(h.cents)}. Their bank details changed${when}.`;
    }
    case 'po_mismatch': {
      const why = ev.reason ? ` The purchase order check failed: ${ev.reason.charAt(0).toLowerCase()}${ev.reason.slice(1)}.` : " It doesn't match its purchase order.";
      return `${vendorOf(ev, names)} sent invoice ${h.txnRef} for ${money(h.cents)}.${why}`;
    }
    case 'limit': {
      const what = h.kind === 'card' ? fuelLead(ev, h) : h.kind === 'invoice' ? `${vendorOf(ev, names)} sent invoice ${h.txnRef} for ${money(h.cents)}.` : `Charge ${h.txnRef} is for ${money(h.cents)}.`;
      const why = ev.limitReason === 'daily_cap' ? " Every check passed, but paying it would take today's automatic payments over the daily limit." : ' Every check passed, but it is larger than Caliber may pay without you.';
      return `${what}${why}`;
    }
    default:
      return `Charge ${h.txnRef} for ${money(h.cents)} on ${onDate(ev, h)} needs your decision.`;
  }
}

// ---------------------------------------------------------------------------
// the stored investigation: replay flag and receipt quote (never the prose)
// ---------------------------------------------------------------------------
export function latestTask(tasks: readonly AgentTask[], txnRef: string, kind = 'investigate'): AgentTask | undefined {
  let best: AgentTask | undefined;
  for (const t of tasks) if (t.txnRef === txnRef && t.kind === kind && (!best || t.id > best.id)) best = t;
  return best;
}

export function findingOf(task: AgentTask | undefined): Finding | undefined {
  if (!task || !task.findingJson || task.findingJson === '{}') return undefined;
  return parseJson<Finding | undefined>(task.findingJson, undefined);
}

export function isReplay(task: AgentTask | undefined, f: Finding | undefined): boolean {
  return task?.source === 'replayed' || f?.status === 'replayed';
}

export function receiptOf(f: Finding | undefined): FindingEvidence | undefined {
  return f?.evidence?.find(e => typeof e.source === 'string' && e.source.startsWith('receipts/') && !!e.quote);
}

// ---------------------------------------------------------------------------
// rules as sentences
// ---------------------------------------------------------------------------
const RULE_WHAT: Record<string, string> = {
  location_mismatch: 'fuels a truck other than the one on the card',
  rate_variance: 'is billed above the contract rate',
  duplicate_invoice: 'sends an invoice that looks like one already on file',
  short_received: 'is billed for more than has been received',
  po_mismatch: "sends an invoice that doesn't match its purchase order",
};

function scopeWho(scope: RuleScope, names: Names): string {
  const parts: string[] = [];
  if (scope.driverId !== undefined) parts.push(driverWord(names, scope.driverId));
  if (scope.vendorId !== undefined) parts.push(vendorWord(names, scope.vendorId));
  if (scope.cardId) parts.push(`fuel card ${scope.cardId}`);
  if (scope.truckIds?.length) parts.push(scope.truckIds.length === 1 ? `Truck ${scope.truckIds[0]}` : `Trucks ${scope.truckIds.join(', ')}`);
  return parts.length ? parts.join(' on ') : 'anyone';
}

export function ruleSentence(r: Rule, names: Names): string {
  const scope = parseJson<RuleScope>(r.scopeJson, {});
  let what = RULE_WHAT[r.condition] ?? `has a charge held as ${r.condition.replace(/_/g, ' ')}`;
  if (r.condition === 'rate_variance' && scope.vendorId !== undefined) what = 'bills above the contract rate';
  const once = r.uses === 'one_time' ? ', for one charge only' : '';
  return `When ${scopeWho(scope, names)} ${what}, pay the charge. Good from ${dayDate(r.validFromDay)} to ${dayDate(r.validToDay)}${once}.`;
}

export function backtestSentence(r: Rule): string | undefined {
  const bt = parseJson<Backtest>(r.backtestJson, {});
  if (bt.wouldClear === undefined) return undefined;
  return `It would have cleared ${plural(bt.wouldClear, 'earlier charge')}.`;
}

export type LearnedItem =
  | { kind: 'rule'; rule: Rule; state: 'active' | 'candidate' | 'past'; sentence: string; lead?: string; note?: string; backtest?: string; command?: string }
  | { kind: 'answered'; hold: Hold; sentence: string };

const CONSUMED = 'one_time rule consumed by';

function eventDay(events: readonly AuditEvent[], action: string, ref: string, detail?: string): number | undefined {
  let best: AuditEvent | undefined;
  for (const e of events) {
    if (e.action !== action || e.ref !== ref) continue;
    if (detail !== undefined && e.detail !== detail) continue;
    if (!best || e.id > best.id) best = e;
  }
  return best?.day;
}

export function learnedFrom(rules: readonly Rule[], holds: readonly Hold[], events: readonly AuditEvent[], names: Names): LearnedItem[] {
  const items: LearnedItem[] = [];
  const order = { candidate: 0, active: 1, past: 2 } as const;
  const sorted = [...rules].sort((a, b) => Number(b.id - a.id));
  for (const r of sorted) {
    const sentence = ruleSentence(r, names);
    const backtest = backtestSentence(r);
    const answered = eventDay(events, 'answer_question', r.sourceTxnRef);
    if (r.status === 'candidate') {
      items.push({
        kind: 'rule', rule: r, state: 'candidate', sentence, backtest,
        lead: `Proposed from your answer${answered !== undefined ? ` on ${dayDate(answered)}` : ''}:`,
        note: 'Approve it in ASI:One:', command: `approve rule ${r.id}`,
      });
    } else if (r.status === 'approved') {
      const d = eventDay(events, 'approve_rule', String(r.id));
      items.push({ kind: 'rule', rule: r, state: 'active', sentence, backtest, note: r.approvedBy ? `You approved this${d !== undefined ? ` on ${dayDate(d)}` : ''}.` : undefined });
    } else {
      let note: string;
      if (r.status === 'expired' && r.reason.startsWith(CONSUMED)) {
        const ref = r.reason.slice(CONSUMED.length).trim();
        const d = eventDay(events, 'cleared_by_rule', ref, `rule ${r.id}`);
        note = `Used once${d !== undefined ? ` on ${dayDate(d)}` : ''}.`;
      } else if (r.status === 'expired') {
        const m = /expired on day (\d+)/.exec(r.reason);
        note = `Expired ${m ? dayDate(Number(m[1])) : dayDate(r.validToDay)}.`;
      } else if (r.status === 'rejected') {
        const d = eventDay(events, 'reject_rule', String(r.id));
        note = `You turned this down${d !== undefined ? ` on ${dayDate(d)}` : ''}.`;
      } else {
        note = 'No longer in use.';
      }
      items.push({ kind: 'rule', rule: r, state: 'past', sentence, backtest, note });
    }
  }
  items.sort((a, b) => (a.kind === 'rule' && b.kind === 'rule' ? order[a.state] - order[b.state] : 0));
  // An answer lands before its rule is drafted; say so at once, so the screen moves when the controller does.
  const drafted = new Set(rules.map(r => r.sourceTxnRef));
  const pending: LearnedItem[] = [];
  for (const h of holds) {
    if (h.status !== 'answered' || drafted.has(h.txnRef)) continue;
    const d = eventDay(events, 'answer_question', h.txnRef);
    pending.push({ kind: 'answered', hold: h, sentence: `You answered the question about charge ${h.txnRef}${d !== undefined ? ` on ${dayDate(d)}` : ''}. Caliber is turning your answer into a rule for you to approve.` });
  }
  return [...pending, ...items];
}

// ---------------------------------------------------------------------------
// activity: one plain sentence per audit_event row
// ---------------------------------------------------------------------------
const HOLD_WHY: Record<string, string> = {
  location_mismatch: 'the truck was somewhere else',
  capacity_exceeded: 'more fuel than the tank holds',
  rate_variance: 'billed above the contract rate',
  duplicate_invoice: 'looks like an invoice already on file',
  short_received: 'billed for more than was received',
  vendor_bank_change: "the vendor's bank details just changed",
  po_mismatch: "doesn't match its purchase order",
  limit: 'over the auto-pay limit',
};
const holdWhy = (code: string) => HOLD_WHY[code] ?? 'needs a closer look';

const FILE_KIND: Record<string, [string, string]> = {
  card: ['fuel-card', 'charge'],
  toll: ['toll', 'toll'],
  invoice: ['invoice', 'invoice'],
};

const SEED_WORD: Record<string, string> = {
  terminal: 'terminals', truck: 'trucks', driver: 'drivers', vendor: 'vendors', contract: 'contracts', po: 'purchase orders', invoice: 'invoices',
};

const ROLE_WORD: Record<string, string> = { agent: 'The investigator', reader: 'The read-only assistant', controller: 'Your seat', seed: 'Setup' };

export type Lookups = {
  holds: Map<string, Hold>;
  payments: Map<string, Payment>;
  rules: Map<string, Rule>;
  ingests: Map<string, IngestLog>;
};

export function lookupsFrom(holds: readonly Hold[], payments: readonly Payment[], rules: readonly Rule[], ingests: readonly IngestLog[]): Lookups {
  return {
    holds: new Map(holds.map(h => [h.txnRef, h])),
    payments: new Map(payments.map(p => [p.txnRef, p])),
    rules: new Map(rules.map(r => [String(r.id), r])),
    ingests: new Map(ingests.map(i => [i.fileName, i])),
  };
}

function amountFor(ref: string, lk: Lookups): string {
  const c = lk.payments.get(ref)?.cents ?? lk.holds.get(ref)?.cents;
  return c === undefined ? '' : `${money(c)} `;
}

export function activitySentence(e: AuditEvent, lk: Lookups): string {
  const ref = e.ref;
  switch (e.action) {
    case 'auto_pay':
      return `Paid ${amountFor(ref, lk)}for charge ${ref} automatically. Everything matched.`;
    case 'hold':
      return `Held ${amountFor(ref, lk)}charge ${ref}: ${holdWhy(e.detail)}.`;
    case 'hold_recoded': {
      const to = e.detail.split('->')[1]?.trim() ?? '';
      return `Charge ${ref} was checked again; the reason it is held is now: ${holdWhy(to)}.`;
    }
    case 'auto_reject': {
      const dup = /of (\S+)/.exec(e.detail)?.[1];
      return `Turned down toll ${ref}: it was a duplicate${dup ? ` of toll ${dup}` : ''}.`;
    }
    case 'answer_question':
      return `You answered the question about charge ${ref}.`;
    case 'create_rule': {
      const r = lk.rules.get(ref);
      return `Caliber proposed rule ${ref}${r ? ` from your answer about charge ${r.sourceTxnRef}` : ''}.`;
    }
    case 'approve_rule':
      return `You approved rule ${ref}.`;
    case 'reject_rule':
      return `You turned down rule ${ref}.`;
    case 'cleared_by_rule': {
      const rid = /rule (\d+)/.exec(e.detail)?.[1];
      return `Paid ${amountFor(ref, lk)}for charge ${ref} under ${rid ? `rule ${rid}, ` : ''}a rule you approved.`;
    }
    case 'approve_payment':
      return `You approved paying ${amountFor(ref, lk)}for charge ${ref}.`;
    case 'reject_payment':
      return `You turned down charge ${ref}. It will not be paid.`;
    case 'settle': {
      const id = /^bank id (\S+)$/.exec(e.detail)?.[1];
      if (!id || id.startsWith('offline-')) return `Payment for charge ${ref} recorded offline, no bank called.`;
      return `The bank sent payment for charge ${ref}, transfer ${id}.`;
    }
    case 'refused':
      return refusedSentence(e, lk);
    case 'seat_refused':
      return 'Someone not on your list tried to act from ASI:One. Refused.';
    case 'ingest': {
      const log = lk.ingests.get(ref);
      const kind = log?.kind ?? /^(\w+):/.exec(e.detail)?.[1] ?? '';
      const n = log?.rows ?? Number(/:\s*(\d+) rows/.exec(e.detail)?.[1] ?? NaN);
      const [file, unit] = FILE_KIND[kind] ?? ['data', 'row'];
      return Number.isFinite(n) ? `A ${file} file arrived: ${plural(n, unit)}.` : `A ${file} file arrived.`;
    }
    case 'set_clock':
      return e.detail === 'paused' ? 'The day clock was paused.' : 'The day clock started running.';
    case 'set_tick':
      return 'The day clock speed changed.';
    case 'claim_task':
      return `Caliber started looking into ${refWord(e.detail, lk)}.`;
    case 'record_investigation': {
      const { txnRef, recommendation } = investigationOf(e);
      return `Caliber looked into ${refWord(txnRef, lk)} ${OUTCOME[recommendation] ?? 'and finished'}.`;
    }
    case 'rematch':
      return `Charge ${ref} was checked again.`;
    case 'inject':
      return `A test charge, ${ref}, was added.`;
    case 'vendor_bank_change':
      return 'A vendor changed its bank details.';
    case 'init':
      return 'The ledger was set up.';
    case 'reset_sim':
      return 'The simulation was started over.';
    case 'grant_role':
      return 'A seat was set up.';
    case 'seed':
      return `Company records loaded: ${SEED_WORD[ref] ?? 'records'}.`;
    default:
      return 'Something was recorded in the ledger.';
  }
}

// record_investigation writes "<txnRef> <recommendation> (<source>)".
function investigationOf(e: AuditEvent): { txnRef: string; recommendation: string } {
  const [txnRef = e.ref, recommendation = ''] = e.detail.split(' ');
  return { txnRef, recommendation };
}

const OUTCOME: Record<string, string> = {
  hold_and_ask: 'and is holding it for you with a question',
  hold: 'and is holding it',
  clear: 'and found nothing wrong',
  timeout: "but couldn't finish; it stays held",
};
const NEEDS_YOU = new Set(['hold_and_ask']);

function refWord(ref: string, lk: Lookups): string {
  const kind = lk.holds.get(ref)?.kind;
  return kind === 'invoice' ? `invoice ${ref}` : kind === 'toll' ? `toll ${ref}` : `charge ${ref}`;
}

export type ActivityLine = { id: bigint; day: number; text: string };

const COLLAPSE_AT = 3;

/**
 * The feed, newest first. Claim rows are dropped (a finished investigation follows each one); a run of three or
 * more investigations on one day becomes one line that links to the newest of them. Everything else is one line.
 */
export function activityLines(events: readonly AuditEvent[], lk: Lookups): ActivityLine[] {
  const feed = events.filter(e => e.action !== 'claim_task').sort((a, b) => (a.id === b.id ? 0 : a.id > b.id ? -1 : 1));
  const out: ActivityLine[] = [];
  for (let i = 0; i < feed.length; ) {
    const e = feed[i];
    let j = i;
    if (e.action === 'record_investigation') while (j + 1 < feed.length && feed[j + 1].action === 'record_investigation' && feed[j + 1].day === e.day) j++;
    const run = feed.slice(i, j + 1);
    if (run.length >= COLLAPSE_AT) {
      const kinds = new Set(run.map(r => lk.holds.get(investigationOf(r).txnRef)?.kind ?? 'card'));
      const unit = kinds.size === 1 && kinds.has('invoice') ? 'invoice' : kinds.size === 1 && kinds.has('toll') ? 'toll' : 'charge';
      const asks = run.filter(r => NEEDS_YOU.has(investigationOf(r).recommendation)).length;
      const need = asks === 0 ? 'none need you' : asks === 1 ? '1 needs you' : `${asks} need you`;
      out.push({ id: e.id, day: e.day, text: `Caliber looked into ${plural(run.length, unit)}; ${need}.` });
    } else {
      for (const r of run) out.push({ id: r.id, day: r.day, text: activitySentence(r, lk) });
    }
    i = j + 1;
  }
  return out;
}

function refusedSentence(e: AuditEvent, lk: Lookups): string {
  const who = ROLE_WORD[e.actorRole] ?? 'Someone without a seat';
  const isHold = lk.holds.has(e.ref);
  const isRule = !isHold && lk.rules.has(e.ref);
  if (/may not do this \(needs controller\)/.test(e.detail)) {
    if (isHold) return `${who} tried to approve a payment. Only you can.`;
    if (isRule) return `${who} tried to approve a rule. Only you can.`;
    return `${who} tried to make a decision. Only you can.`;
  }
  if (e.detail === 'requester cannot approve') return `An approval for charge ${e.ref} was stopped: whoever raised a charge can't also approve it.`;
  if (e.detail === 'author cannot approve own rule') return `Rule ${e.ref} can't be approved by the one who wrote it. Refused.`;
  if (e.detail.startsWith('call-back note required')) return `An approval for charge ${e.ref} was stopped: the vendor's bank details changed, so a note about the call-back is required.`;
  return `A request about ${isRule ? 'rule' : 'charge'} ${e.ref} was refused by the ledger.`;
}

// ---------------------------------------------------------------------------
// vocabulary: words that belong to the machine room, never on a customer screen
// ---------------------------------------------------------------------------
export const FORBIDDEN_WORDS = ['kernel', 'reducer', 'actor', 'seed', 'finding', 'MCP', 'stand-in', 'FACTS'];

export function forbiddenIn(text: string): string[] {
  return FORBIDDEN_WORDS.filter(w => new RegExp(`(^|[^A-Za-z0-9-])${w.replace(/-/g, '\\-')}($|[^A-Za-z0-9-])`, 'i').test(text));
}
