import { describe, expect, it } from 'vitest';
import {
  autoPayDecision, evaluateCardTxn, evaluateInvoice, evaluateToll, haversineMiles, nearestPing, ruleCovers,
  type CardTxnIn, type InvoiceIn, type PingIn, type PoIn, type ContractIn, type RuleIn, type TollIn, type TruckIn,
} from './kernel';
import { T } from './thresholds';
import { dateForDay } from './calendar';

const MIN = 60_000_000n;
const t0 = 1_787_000_000_000_000n; // arbitrary micros
const SA = { lat: 29.4241, lon: -98.4936 }; // San Antonio terminal
const SCHULENBURG = { lat: 29.6816, lon: -96.9036 }; // Love's 412

const truck17: TruckIn = { id: 17, plate: 'TX-1017', tankGal: 150, fuelCardId: 'FC-1017' };
const ping = (p: Partial<PingIn> = {}): PingIn => ({ atMicros: t0, lat: SA.lat, lon: SA.lon, engineOn: false, odometer: 100, ...p });
const card = (c: Partial<CardTxnIn> = {}): CardTxnIn => ({
  id: '2231', cardId: 'FC-1017', truckId: 17, driverId: 23, atMicros: t0 + 4n * MIN, day: 41,
  stationName: "Love's 412", stationLat: SCHULENBURG.lat, stationLon: SCHULENBURG.lon, gallons: 120, cents: 41200n, merchant: 'LOVES', ...c,
});

describe('calendar', () => {
  it('skips weekends from 2026-07-01', () => {
    expect(dateForDay(1)).toBe('2026-07-01');
    expect(dateForDay(3)).toBe('2026-07-03');
    expect(dateForDay(4)).toBe('2026-07-06');
    expect(dateForDay(23)).toBe('2026-07-31');
    expect(dateForDay(92)).toBe('2026-11-05');
  });
});

describe('haversine and pings', () => {
  it('San Antonio to Schulenburg is about 96 miles', () => {
    const m = haversineMiles(SA.lat, SA.lon, SCHULENBURG.lat, SCHULENBURG.lon);
    expect(m).toBeGreaterThan(90);
    expect(m).toBeLessThan(102);
  });
  it('nearestPing ignores pings outside the window', () => {
    expect(nearestPing([ping({ atMicros: t0 - 31n * MIN })], t0, 30)).toBeNull();
    expect(nearestPing([ping({ atMicros: t0 - 29n * MIN }), ping({ atMicros: t0 + 2n * MIN })], t0, 30)?.deltaMin).toBe(2);
  });
});

describe('fuel rules', () => {
  it('raises location_mismatch when the truck pinged 96 miles away', () => {
    const v = evaluateCardTxn(card(), truck17, [ping()], []);
    expect(v.code).toBe('location_mismatch');
    expect(v.evidence.distanceMiles).toBeGreaterThan(T.LOCATION_MILES);
  });
  it('matches when the truck is at the pump', () => {
    const v = evaluateCardTxn(card(), truck17, [ping({ lat: SCHULENBURG.lat + 0.01, lon: SCHULENBURG.lon })], []);
    expect(v.code).toBe('matched');
  });
  it('raises location_mismatch when no ping is inside 30 minutes', () => {
    const v = evaluateCardTxn(card(), truck17, [ping({ atMicros: t0 - 60n * MIN, ...SCHULENBURG })], []);
    expect(v.code).toBe('location_mismatch');
  });
  it('capacity beats location and never asks', () => {
    const v = evaluateCardTxn(card({ gallons: 170 }), truck17, [ping()], []);
    expect(v.code).toBe('capacity_exceeded');
    expect(v.evidence.capacityLimitGal).toBe(165);
  });
  it('exactly 10 percent over the tank is still allowed', () => {
    const v = evaluateCardTxn(card({ gallons: 165 }), truck17, [ping(SCHULENBURG)], []);
    expect(v.code).toBe('matched');
  });
  it('a decoy clears only through an approved, scoped, in-window rule', () => {
    const rule: RuleIn = { id: 7n, condition: 'location_mismatch', scope: { driverId: 23 }, validFromDay: 41, validToDay: 46 };
    expect(evaluateCardTxn(card(), truck17, [ping()], [rule]).code).toBe('matched');
    expect(evaluateCardTxn(card(), truck17, [ping()], [rule]).ruleId).toBe(7n);
    expect(evaluateCardTxn(card({ driverId: 24 }), truck17, [ping()], [rule]).code).toBe('location_mismatch');
    expect(evaluateCardTxn(card({ day: 47 }), truck17, [ping()], [rule]).code).toBe('location_mismatch');
    expect(evaluateCardTxn(card(), truck17, [ping()], [{ ...rule, condition: 'rate_variance' }]).code).toBe('location_mismatch');
    expect(evaluateCardTxn(card(), truck17, [ping()], [{ ...rule, scope: {} }]).code).toBe('location_mismatch');
  });
  it('a rule never clears capacity_exceeded', () => {
    const rule: RuleIn = { id: 1n, condition: 'capacity_exceeded', scope: { driverId: 23 }, validFromDay: 1, validToDay: 92 };
    expect(evaluateCardTxn(card({ gallons: 200 }), truck17, [ping()], [rule]).code).toBe('capacity_exceeded');
  });
});

describe('tolls', () => {
  const toll = (t: Partial<TollIn> = {}): TollIn => ({ id: 'T2', plate: 'TX-1001', truckId: 1, atMicros: t0 + 5n * MIN, day: 3, plazaId: 'P1', plazaName: 'P', cents: 850n, ...t });
  it('rejects the later of two tolls within 10 minutes', () => {
    const v = evaluateToll(toll(), [toll({ id: 'T1', atMicros: t0 })]);
    expect(v.code).toBe('duplicate_toll');
    expect(v.evidence.duplicateOf).toBe('T1');
  });
  it('accepts tolls 11 minutes apart or at a different plaza', () => {
    expect(evaluateToll(toll({ atMicros: t0 + 11n * MIN }), [toll({ id: 'T1', atMicros: t0 })]).code).toBe('matched');
    expect(evaluateToll(toll(), [toll({ id: 'T1', atMicros: t0, plazaId: 'P2' })]).code).toBe('matched');
  });
});

describe('invoices', () => {
  const po: PoIn = { id: 'PO-1', vendorId: 3, truckId: 17, item: 'brake_job', qty: 4, unitCents: 24500n, receivedQty: 4 };
  const contract: ContractIn = { id: 1, vendorId: 3, item: 'brake_job', rateCents: 24500n, validFromDay: 1, validToDay: 92 };
  const vendor = { id: 3, name: 'Gulf Coast Diesel', bankChangedDay: 0 };
  const inv = (i: Partial<InvoiceIn> = {}): InvoiceIn => ({ id: 'INV-1', vendorId: 3, poId: 'PO-1', receivedDay: 44, item: 'brake_job', qty: 4, unitCents: 24500n, cents: 98000n, docRef: 'd', ...i });

  it('matches a clean invoice', () => {
    expect(evaluateInvoice(inv(), po, contract, vendor, [], []).code).toBe('matched');
  });
  it('allows exactly 5 percent over contract and flags 5.1 percent', () => {
    expect(evaluateInvoice(inv({ unitCents: 25725n }), po, contract, vendor, [], []).code).toBe('matched');
    expect(evaluateInvoice(inv({ unitCents: 25750n }), po, contract, vendor, [], []).code).toBe('rate_variance');
  });
  it('flags short receipts with the partial amount in cents', () => {
    const v = evaluateInvoice(inv(), { ...po, receivedQty: 3 }, contract, vendor, [], []);
    expect(v.code).toBe('short_received');
    expect(v.evidence.proposedPartialCents).toBe('73500');
  });
  it('flags a duplicate under another PO within 30 days, not after', () => {
    const earlier = inv({ id: 'INV-0', poId: 'PO-9', receivedDay: 20 });
    expect(evaluateInvoice(inv(), po, contract, vendor, [earlier], []).code).toBe('duplicate_invoice');
    expect(evaluateInvoice(inv({ receivedDay: 51 }), po, contract, vendor, [earlier], []).code).toBe('matched');
    expect(evaluateInvoice(inv(), po, contract, vendor, [inv({ id: 'INV-0', receivedDay: 20 })], []).code).toBe('matched'); // same PO is not a dup here
  });
  it('hard-holds a payment over $5,000 within 7 days of a bank change, and a rule cannot clear it', () => {
    const v = evaluateInvoice(inv({ cents: 980000n, unitCents: 245000n }), po, contract, { ...vendor, bankChangedDay: 42 }, [], [
      { id: 1n, condition: 'vendor_bank_change', scope: { vendorId: 3 }, validFromDay: 1, validToDay: 92 },
    ]);
    expect(v.code).toBe('vendor_bank_change');
    expect(evaluateInvoice(inv({ cents: 980000n }), po, contract, { ...vendor, bankChangedDay: 36 }, [], []).code).not.toBe('vendor_bank_change');
    expect(evaluateInvoice(inv({ cents: 500000n }), po, contract, { ...vendor, bankChangedDay: 42 }, [], []).code).toBe('matched');
  });
});

describe('invoice integrity and rule ordering (from review)', () => {
  const po: PoIn = { id: 'PO-1', vendorId: 3, truckId: 17, item: 'brake_job', qty: 4, unitCents: 24500n, receivedQty: 4 };
  const contract: ContractIn = { id: 1, vendorId: 3, item: 'brake_job', rateCents: 24500n, validFromDay: 1, validToDay: 92 };
  const vendor = { id: 3, name: 'Gulf Coast Diesel', bankChangedDay: 0 };
  const inv = (i: Partial<InvoiceIn> = {}): InvoiceIn => ({ id: 'INV-1', vendorId: 3, poId: 'PO-1', receivedDay: 44, item: 'brake_job', qty: 4, unitCents: 24500n, cents: 98000n, docRef: 'd', ...i });
  const rateRule: RuleIn = { id: 3n, condition: 'rate_variance', scope: { vendorId: 3 }, validFromDay: 40, validToDay: 50 };

  it('an approved rate rule does not clear a short-received invoice', () => {
    const v = evaluateInvoice(inv({ unitCents: 30000n }), { ...po, receivedQty: 2 }, contract, vendor, [], [rateRule]);
    expect(v.code).toBe('short_received');
  });
  it('an approved rate rule clears a fully received invoice and records the rule', () => {
    const v = evaluateInvoice(inv({ unitCents: 30000n }), po, contract, vendor, [], [rateRule]);
    expect(v.code).toBe('matched');
    expect(v.ruleId).toBe(3n);
  });
  it('flags a PO that is missing, belongs to another vendor, or names another item', () => {
    expect(evaluateInvoice(inv(), undefined, contract, vendor, [], []).code).toBe('po_mismatch');
    expect(evaluateInvoice(inv(), { ...po, vendorId: 4 }, contract, vendor, [], []).code).toBe('po_mismatch');
    expect(evaluateInvoice(inv(), { ...po, item: 'oil_service' }, contract, vendor, [], []).code).toBe('po_mismatch');
  });
  it('without a contract the PO unit price is the reference', () => {
    expect(evaluateInvoice(inv({ unitCents: 30000n }), po, undefined, vendor, [], []).code).toBe('rate_variance');
    expect(evaluateInvoice(inv(), po, undefined, vendor, [], []).code).toBe('matched');
  });
  it('fractional receipts are priced without rounding the quantity first', () => {
    const v = evaluateInvoice(inv({ qty: 4 }), { ...po, receivedQty: 2.5 }, contract, vendor, [], []);
    expect(v.evidence.proposedPartialCents).toBe('61250');
  });
  it('two tolls at the same instant: exactly one is the duplicate', () => {
    const a: TollIn = { id: 'T1', plate: 'P', truckId: 1, atMicros: t0, day: 1, plazaId: 'X', plazaName: 'X', cents: 1n };
    const b: TollIn = { ...a, id: 'T2' };
    expect(evaluateToll(b, [a]).code).toBe('duplicate_toll');
    expect(evaluateToll(a, [b]).code).toBe('matched');
  });
  it('nearestPing uses raw microseconds, not truncated minutes', () => {
    const far = ping({ atMicros: t0 + 90n * 1_000_000n, lat: 0, lon: 0 });
    const close = ping({ atMicros: t0 + 100n * 1_000_000n, ...SCHULENBURG });
    expect(nearestPing([close, far], t0, 30)?.ping.lat).toBe(0);
  });
  it('the lowest rule id wins when two rules cover a row', () => {
    const r9: RuleIn = { id: 9n, condition: 'location_mismatch', scope: { driverId: 23 }, validFromDay: 41, validToDay: 46 };
    const r4: RuleIn = { id: 4n, condition: 'location_mismatch', scope: { truckIds: [17] }, validFromDay: 41, validToDay: 46 };
    expect(evaluateCardTxn(card(), truck17, [ping()], [r9, r4]).ruleId).toBe(4n);
  });
});

describe('auto-pay limits', () => {
  it('holds above $2,500 per transaction and above the daily cap', () => {
    expect(autoPayDecision(250_000n, 0n)).toBe('pay');
    expect(autoPayDecision(250_001n, 0n)).toBe('limit');
    expect(autoPayDecision(100n, T.AUTO_PAY_DAY_MAX_CENTS)).toBe('limit');
  });
});

describe('ruleCovers', () => {
  it('requires every present scope key to match', () => {
    const r: RuleIn = { id: 1n, condition: 'location_mismatch', scope: { driverId: 23, truckIds: [17] }, validFromDay: 1, validToDay: 9 };
    expect(ruleCovers(r, 'location_mismatch', { day: 5, driverId: 23, truckId: 17 })).toBe(true);
    expect(ruleCovers(r, 'location_mismatch', { day: 5, driverId: 23, truckId: 18 })).toBe(false);
    expect(ruleCovers(r, 'location_mismatch', { day: 10, driverId: 23, truckId: 17 })).toBe(false);
  });
});
