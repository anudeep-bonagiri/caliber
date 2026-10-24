// In-process world builder for module.test.ts. One harness per test: the SDK's portable
// datastore runs the real module code (schema, reducers, procedures) inside Node.
import { createModuleTestHarness, TestAuth } from 'spacetimedb/server/test-utils';
import { ConnectionId, Identity, Timestamp } from 'spacetimedb';
import type { InferSchema, ReducerCtx } from 'spacetimedb/server';
import spacetimedb from './schema';
import * as mod from './index';
import { microsForDay } from './calendar';

// Callers. Every human or service caller is derived from a JWT payload: SpacetimeDB hashes
// `iss` + `sub` into an Identity, so the same payload is the same caller on any connection.
// The publisher (the CLI identity that runs `init` and so holds `seed`) is one of these: it must
// NOT be the harness's internal identity, because that one is the database itself and
// `roleOf` reports it as 'database' before ever reading the role table (index.ts:37).
// `internal` is kept for the scheduled reducer, whose sender is the database.
let nextConn = 1n;
export const jwt = (sub: string) =>
  TestAuth.fromJwtPayload(JSON.stringify({ iss: 'dispatch-ledger-test', sub }), new ConnectionId(nextConn++));
export const publisher = jwt('publisher-cli');
export const internal = TestAuth.internal();

export const SA = { lat: 29.4241, lon: -98.4936 }; // San Antonio terminal
export const SCHULENBURG = { lat: 29.6816, lon: -96.9036 }; // Love's 412, ~96 miles from SA
export const EL_PASO = { lat: 31.7619, lon: -106.485 };

const ts = (day: number, h: number, m: number) => new Timestamp(microsForDay(day, h, m));

export function makeWorld() {
  const h = createModuleTestHarness(spacetimedb, mod);
  h.clock.set(ts(41, 8, 0));

  const anon = jwt('nobody');
  const agent = jwt('worker-1');
  const controller = jwt('controller-1');

  type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;
  // Run `body` as `auth` inside one reducer transaction (commit on return, abort on throw).
  const run = <T>(auth: TestAuth, body: (ctx: Ctx) => T): T => h.withReducerTx(auth, body);
  const identityOf = (auth: TestAuth): Identity => run(auth, ctx => ctx.sender);

  // init as the publisher, then grant the two working roles. Identities are resolved before the
  // granting transaction opens: withReducerTx cannot nest (the datastore holds one lock).
  run(publisher, ctx => mod.init(ctx, {}));
  const grant = (auth: TestAuth, role: string) => {
    const identity = identityOf(auth);
    run(publisher, ctx => mod.grantRole(ctx, { identity, role }));
  };
  grant(agent, 'agent');
  grant(controller, 'controller');

  // the tiny dataset (see the task brief; every number below is read back by a test)
  run(publisher, ctx => mod.seedTerminals(ctx, { rows: [
    { id: 1, name: 'San Antonio', lat: SA.lat, lon: SA.lon },
    { id: 2, name: 'Houston', lat: 29.7604, lon: -95.3698 },
  ] }));
  run(publisher, ctx => mod.seedTrucks(ctx, { rows: [
    { id: 17, plate: 'TX-1017', tankGal: 150, fuelCardId: 'FC-1017', terminalId: 1 },
    { id: 22, plate: 'TX-1022', tankGal: 150, fuelCardId: 'FC-1022', terminalId: 2 },
  ] }));
  run(publisher, ctx => mod.seedDrivers(ctx, { rows: [
    { id: 23, name: 'Ramon Ortiz', homeTerminal: 1, truckId: 17 },
    { id: 24, name: 'Dana Lee', homeTerminal: 2, truckId: 22 },
  ] }));
  run(publisher, ctx => mod.seedPings(ctx, { rows: [
    { id: 0n, truckId: 17, day: 41, at: ts(41, 13, 0), lat: SA.lat, lon: SA.lon, odometer: 183210.4, engineOn: false },
    { id: 0n, truckId: 22, day: 41, at: ts(41, 13, 0), lat: SCHULENBURG.lat, lon: SCHULENBURG.lon, odometer: 90211.0, engineOn: true },
  ] }));
  run(publisher, ctx => mod.seedCardTxns(ctx, { rows: [
    { id: '2231', cardId: 'FC-1017', truckId: 17, driverId: 23, at: ts(41, 13, 4), day: 41,
      stationName: "Love's 412, Schulenburg TX", stationLat: SCHULENBURG.lat, stationLon: SCHULENBURG.lon,
      gallons: 120, cents: 41200n, merchant: 'LOVES #412' },
  ] }));
  run(publisher, ctx => mod.seedTollTxns(ctx, { rows: [
    { id: 'T1041', plate: 'TX-1017', truckId: 17, at: ts(41, 9, 0), day: 41, plazaId: 'P-7', plazaName: 'SH-130 Plaza 7', cents: 350n },
    { id: 'T1042', plate: 'TX-1017', truckId: 17, at: ts(41, 9, 3), day: 41, plazaId: 'P-7', plazaName: 'SH-130 Plaza 7', cents: 350n },
  ] }));
  run(publisher, ctx => mod.seedVendors(ctx, { rows: [
    { id: 3, name: 'Alamo Brake & Axle', bankLast4: '7781', bankChangedDay: 42 },
  ] }));
  run(publisher, ctx => mod.seedContracts(ctx, { rows: [
    { id: 1, vendorId: 3, item: 'brake_job', rateCents: 24500n, validFromDay: 1, validToDay: 92, clause: 'Flat rate per axle, parts included.' },
  ] }));
  run(publisher, ctx => mod.seedPos(ctx, { rows: [
    { id: 'PO-3001', vendorId: 3, truckId: 17, item: 'brake_job', qty: 40, unitCents: 24500n, receivedQty: 40, issuedDay: 40 },
  ] }));
  run(publisher, ctx => mod.seedInvoices(ctx, { rows: [
    { id: 'INV-1077', vendorId: 3, poId: 'PO-3001', receivedDay: 44, item: 'brake_job', qty: 40, unitCents: 24500n, cents: 980_000n, docRef: 'invoices/INV-1077.txt' },
  ] }));

  const day = () => h.db.businessDay.id.find(1)!.day;
  // Advance the business day with `step_day` as the publisher until `target`.
  const stepTo = (target: number) => {
    while (day() < target) run(publisher, ctx => mod.stepDay(ctx, {}));
  };

  const rows = {
    match: (ref: string) => h.db.matchResult.txnRef.find(ref),
    hold: (ref: string) => h.db.hold.txnRef.find(ref),
    payment: (ref: string) => h.db.payment.txnRef.find(ref),
    payments: (ref: string) => [...h.db.payment.iter()].filter(p => p.txnRef === ref),
    tasks: (ref: string) => [...h.db.agentTask.txnRef.filter(ref)],
    rule: (id: bigint) => h.db.rule.id.find(id),
    rules: () => [...h.db.rule.iter()],
    audits: (action?: string) => [...h.db.auditEvent.iter()].filter(e => !action || e.action === action),
    dayTotal: (d: number) => h.db.dayTotal.day.find(d),
  };

  return { h, mod, run, identityOf, grant, publisher, internal, anon, agent, controller, day, stepTo, rows, ts };
}

export type World = ReturnType<typeof makeWorld>;

// A fuel transaction row for inject_card_txn; `day` is overwritten by the module.
export function cardRow(over: Partial<Parameters<typeof mod.seedCardTxns>[1]['rows'][number]> = {}) {
  return {
    id: '9001', cardId: 'FC-1017', truckId: 17, driverId: 23, at: ts(41, 13, 10), day: 0,
    stationName: 'Petro El Paso', stationLat: EL_PASO.lat, stationLon: EL_PASO.lon,
    gallons: 100, cents: 35_000n, merchant: 'PETRO',
    ...over,
  };
}
