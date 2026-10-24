// The kernel. Pure TypeScript: plain rows in, { code, evidence } out.
// It never imports the database, a connector or a model client, so vitest on fixtures is meaningful.
import { T, type Code } from './thresholds';

export type Evidence = Record<string, unknown>;
export interface Verdict {
  code: Code;
  evidence: Evidence;
  ruleId?: bigint;
}

export interface PingIn {
  atMicros: bigint;
  lat: number;
  lon: number;
  engineOn: boolean;
  odometer: number;
}
export interface TruckIn {
  id: number;
  plate: string;
  tankGal: number;
  fuelCardId: string;
}
export interface CardTxnIn {
  id: string;
  cardId: string;
  truckId: number;
  driverId: number;
  atMicros: bigint;
  day: number;
  stationName: string;
  stationLat: number;
  stationLon: number;
  gallons: number;
  cents: bigint;
  merchant: string;
}
export interface TollIn {
  id: string;
  plate: string;
  truckId: number;
  atMicros: bigint;
  day: number;
  plazaId: string;
  plazaName: string;
  cents: bigint;
}
export interface VendorIn {
  id: number;
  name: string;
  bankChangedDay: number;
}
export interface ContractIn {
  id: number;
  vendorId: number;
  item: string;
  rateCents: bigint;
  validFromDay: number;
  validToDay: number;
}
export interface PoIn {
  id: string;
  vendorId: number;
  truckId: number;
  item: string;
  qty: number;
  unitCents: bigint;
  receivedQty: number;
}
export interface InvoiceIn {
  id: string;
  vendorId: number;
  poId: string | undefined;
  receivedDay: number;
  item: string;
  qty: number;
  unitCents: bigint;
  cents: bigint;
  docRef: string;
}
export interface RuleScope {
  driverId?: number;
  truckIds?: number[];
  cardId?: string;
  vendorId?: number;
}
export interface RuleIn {
  id: bigint;
  condition: string;
  scope: RuleScope;
  validFromDay: number;
  validToDay: number;
}
export interface RuleFacts {
  day: number;
  driverId?: number;
  truckId?: number;
  cardId?: string;
  vendorId?: number;
}

const toRad = (deg: number) => (deg * Math.PI) / 180;

export function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.7613;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

// Nearest ping by raw microsecond distance; minutes are derived only for the evidence.
export function nearestPing(pings: readonly PingIn[], atMicros: bigint, windowMin: number) {
  const window = BigInt(windowMin) * 60_000_000n;
  let best: { ping: PingIn; delta: bigint } | null = null;
  for (const p of pings) {
    const delta = p.atMicros > atMicros ? p.atMicros - atMicros : atMicros - p.atMicros;
    if (delta > window) continue;
    if (!best || delta < best.delta) best = { ping: p, delta };
  }
  return best ? { ping: best.ping, deltaMin: Number(best.delta / 60_000_000n) } : null;
}

export function ruleCovers(rule: RuleIn, code: string, facts: RuleFacts): boolean {
  if (rule.condition !== code) return false;
  if (facts.day < rule.validFromDay || facts.day > rule.validToDay) return false;
  const s = rule.scope ?? {};
  const hasScope =
    s.driverId !== undefined || (s.truckIds && s.truckIds.length) || s.cardId !== undefined || s.vendorId !== undefined;
  if (!hasScope) return false; // an unscoped rule never applies
  if (s.driverId !== undefined && s.driverId !== facts.driverId) return false;
  if (s.truckIds && s.truckIds.length && (facts.truckId === undefined || !s.truckIds.includes(facts.truckId))) return false;
  if (s.cardId !== undefined && s.cardId !== facts.cardId) return false;
  if (s.vendorId !== undefined && s.vendorId !== facts.vendorId) return false;
  return true;
}

// Lowest rule id wins when several approved rules cover the same row.
function firstCoveringRule(rules: readonly RuleIn[], code: string, facts: RuleFacts) {
  let best: RuleIn | undefined;
  for (const r of rules) if (ruleCovers(r, code, facts) && (!best || r.id < best.id)) best = r;
  return best;
}

// Rule 1 and 2: fuel capacity, then fuel location (with approved-rule lookup).
export function evaluateCardTxn(
  txn: CardTxnIn,
  truck: TruckIn | undefined,
  pings: readonly PingIn[],
  rules: readonly RuleIn[]
): Verdict {
  const base: Evidence = {
    txnRef: txn.id,
    cardId: txn.cardId,
    truckId: txn.truckId,
    driverId: txn.driverId,
    stationName: txn.stationName,
    stationLat: txn.stationLat,
    stationLon: txn.stationLon,
    gallons: txn.gallons,
    cents: txn.cents.toString(),
    merchant: txn.merchant,
    day: txn.day,
  };
  if (!truck) return { code: 'location_mismatch', evidence: { ...base, reason: 'card not assigned to a truck' } };

  const capacityLimit = truck.tankGal * T.TANK_FACTOR;
  if (txn.gallons > capacityLimit) {
    return {
      code: 'capacity_exceeded',
      evidence: { ...base, tankGal: truck.tankGal, capacityLimitGal: Number(capacityLimit.toFixed(1)) },
    };
  }

  const near = nearestPing(pings, txn.atMicros, T.PING_WINDOW_MIN);
  const facts: RuleFacts = { day: txn.day, driverId: txn.driverId, truckId: txn.truckId, cardId: txn.cardId };
  if (!near) {
    const rule = firstCoveringRule(rules, 'location_mismatch', facts);
    const ev = { ...base, nearestPing: null, reason: `no ping within ${T.PING_WINDOW_MIN} minutes` };
    return rule
      ? { code: 'matched', evidence: { ...ev, clearedBy: 'rule', ruleId: rule.id.toString() }, ruleId: rule.id }
      : { code: 'location_mismatch', evidence: ev };
  }
  const miles = haversineMiles(near.ping.lat, near.ping.lon, txn.stationLat, txn.stationLon);
  const ev: Evidence = {
    ...base,
    nearestPing: {
      lat: near.ping.lat,
      lon: near.ping.lon,
      atMicros: near.ping.atMicros.toString(),
      deltaMin: near.deltaMin,
      engineOn: near.ping.engineOn,
      odometer: near.ping.odometer,
    },
    distanceMiles: Number(miles.toFixed(1)),
    thresholdMiles: T.LOCATION_MILES,
  };
  if (miles > T.LOCATION_MILES) {
    const rule = firstCoveringRule(rules, 'location_mismatch', facts);
    if (rule) return { code: 'matched', evidence: { ...ev, clearedBy: 'rule', ruleId: rule.id.toString() }, ruleId: rule.id };
    return { code: 'location_mismatch', evidence: ev };
  }
  return { code: 'matched', evidence: ev };
}

// A toll is "earlier" if it happened strictly before, or at the same instant with a smaller id,
// so exactly one of two simultaneous tolls is the later one.
export function isEarlierToll(e: TollIn, txn: TollIn): boolean {
  return e.atMicros < txn.atMicros || (e.atMicros === txn.atMicros && e.id < txn.id);
}

// Rule 3: toll duplicate.
export function evaluateToll(txn: TollIn, earlier: readonly TollIn[]): Verdict {
  const window = BigInt(T.TOLL_DUP_MIN) * 60_000_000n;
  const base: Evidence = {
    txnRef: txn.id,
    plate: txn.plate,
    truckId: txn.truckId,
    plazaId: txn.plazaId,
    plazaName: txn.plazaName,
    cents: txn.cents.toString(),
    day: txn.day,
  };
  let dup: TollIn | undefined;
  for (const e of earlier) {
    if (e.id === txn.id || e.plazaId !== txn.plazaId || !isEarlierToll(e, txn)) continue;
    const delta = txn.atMicros - e.atMicros;
    if (delta <= window && (!dup || e.atMicros > dup.atMicros)) dup = e;
  }
  if (dup) {
    return {
      code: 'duplicate_toll',
      evidence: { ...base, duplicateOf: dup.id, minutesApart: Number((txn.atMicros - dup.atMicros) / 60_000_000n), windowMin: T.TOLL_DUP_MIN },
    };
  }
  return { code: 'matched', evidence: base };
}

export function isEarlierInvoice(e: InvoiceIn, inv: InvoiceIn): boolean {
  return e.receivedDay < inv.receivedDay || (e.receivedDay === inv.receivedDay && e.id < inv.id);
}

// Rules 4, 5, 6: vendor bank change, duplicates, PO integrity, contract rate, receiving.
export function evaluateInvoice(
  inv: InvoiceIn,
  po: PoIn | undefined,
  contract: ContractIn | undefined,
  vendor: VendorIn | undefined,
  earlierSameVendor: readonly InvoiceIn[],
  rules: readonly RuleIn[]
): Verdict {
  const base: Evidence = {
    txnRef: inv.id,
    vendorId: inv.vendorId,
    vendorName: vendor?.name ?? '',
    poId: inv.poId ?? null,
    item: inv.item,
    qty: inv.qty,
    unitCents: inv.unitCents.toString(),
    cents: inv.cents.toString(),
    receivedDay: inv.receivedDay,
    docRef: inv.docRef,
  };

  if (vendor && inv.cents > T.BANK_CHANGE_MIN_CENTS) {
    const since = inv.receivedDay - vendor.bankChangedDay;
    if (vendor.bankChangedDay > 0 && since >= 0 && since <= T.BANK_CHANGE_DAYS) {
      return {
        code: 'vendor_bank_change',
        evidence: { ...base, bankChangedDay: vendor.bankChangedDay, daysSinceChange: since, thresholdDays: T.BANK_CHANGE_DAYS },
      };
    }
  }

  for (const e of earlierSameVendor) {
    if (e.id === inv.id || !isEarlierInvoice(e, inv)) continue;
    const apart = inv.receivedDay - e.receivedDay;
    if (e.cents === inv.cents && (e.poId ?? '') !== (inv.poId ?? '') && apart <= T.INVOICE_DUP_DAYS) {
      return {
        code: 'duplicate_invoice',
        evidence: { ...base, duplicateOf: e.id, otherPoId: e.poId ?? null, daysApart: apart, windowDays: T.INVOICE_DUP_DAYS },
      };
    }
  }

  if (inv.poId && !po) return { code: 'po_mismatch', evidence: { ...base, reason: 'PO not found' } };
  if (po && po.vendorId !== inv.vendorId) return { code: 'po_mismatch', evidence: { ...base, reason: 'PO belongs to another vendor', poVendorId: po.vendorId } };
  if (po && po.item !== inv.item) return { code: 'po_mismatch', evidence: { ...base, reason: 'PO item differs', poItem: po.item } };

  let ruleId: bigint | undefined;
  let rateEvidence: Evidence = {};
  if (po) {
    // Price: against the contract valid on the receipt day when one exists, otherwise against the PO.
    const reference = contract
      ? { kind: 'contract', id: String(contract.id), rateCents: contract.rateCents }
      : { kind: 'po', id: po.id, rateCents: po.unitCents };
    const limit = (reference.rateCents * BigInt(Math.round((1 + T.RATE_VARIANCE) * 10_000))) / 10_000n;
    if (inv.unitCents > limit) {
      const facts: RuleFacts = { day: inv.receivedDay, vendorId: inv.vendorId, truckId: po.truckId };
      const rule = firstCoveringRule(rules, 'rate_variance', facts);
      rateEvidence = {
        referenceKind: reference.kind,
        referenceId: reference.id,
        contractId: contract?.id ?? null,
        contractRateCents: reference.rateCents.toString(),
        allowedUnitCents: limit.toString(),
        variancePct: Number((((Number(inv.unitCents) - Number(reference.rateCents)) / Number(reference.rateCents)) * 100).toFixed(1)),
      };
      if (!rule) return { code: 'rate_variance', evidence: { ...base, ...rateEvidence } };
      ruleId = rule.id;
      rateEvidence = { ...rateEvidence, clearedBy: 'rule', ruleId: rule.id.toString() };
    }
    if (inv.qty > po.receivedQty) {
      // Quantity at three decimals so a fractional receipt does not round before the multiply.
      const partial = (BigInt(Math.round(po.receivedQty * 1000)) * inv.unitCents) / 1000n;
      return {
        code: 'short_received',
        evidence: { ...base, ...rateEvidence, poQty: po.qty, receivedQty: po.receivedQty, proposedPartialCents: partial.toString() },
      };
    }
  }
  return { code: 'matched', evidence: { ...base, ...rateEvidence }, ruleId };
}

// Rule 7: auto-pay limits. A clean row above the per-transaction cap, or one that would push the day
// above the daily cap, becomes a policy hold with code 'limit'.
export function autoPayDecision(cents: bigint, dayAutoPaidCents: bigint): 'pay' | 'limit' {
  if (cents > T.AUTO_PAY_MAX_CENTS) return 'limit';
  if (dayAutoPaidCents + cents > T.AUTO_PAY_DAY_MAX_CENTS) return 'limit';
  return 'pay';
}
