import { schema, table, t } from 'spacetimedb/server';

// ---------------------------------------------------------------------------
// Access model. Tables are private by default. Operational tables that the
// dashboard, the worker and the ASI:One agent subscribe to are public and carry
// no bank fields or raw documents. Company data (vendors, cards, pings,
// invoices) stays private and is only ever read inside reducers.
// ---------------------------------------------------------------------------

// Roles: the publisher becomes `seed` in init; `agent` and `controller` are granted.
export const role = table({ name: 'role' }, {
  identity: t.identity().primaryKey(),
  role: t.string(),
});

export const businessDay = table({ name: 'business_day', public: true }, {
  id: t.u32().primaryKey(),
  day: t.i32(),
  date: t.string(),
  paused: t.bool(),
  tickMicros: t.u64(),
});

export const dayTimer = table({ name: 'day_timer' }, {
  scheduledId: t.u64().primaryKey().autoInc(),
  scheduledAt: t.scheduleAt(),
});

// ---- company data (private) ----
export const terminal = table({ name: 'terminal' }, {
  id: t.u32().primaryKey(),
  name: t.string(),
  lat: t.f64(),
  lon: t.f64(),
});

export const truck = table({ name: 'truck' }, {
  id: t.u32().primaryKey(),
  plate: t.string().unique(),
  tankGal: t.f64(),
  fuelCardId: t.string().index('btree'),
  terminalId: t.u32(),
});

export const driver = table({ name: 'driver' }, {
  id: t.u32().primaryKey(),
  name: t.string(),
  homeTerminal: t.u32(),
  truckId: t.u32(),
});

export const tripPing = table(
  { name: 'trip_ping', indexes: [{ accessor: 'by_truck_day', algorithm: 'btree', columns: ['truckId', 'day'] }] },
  {
    id: t.u64().primaryKey().autoInc(),
    truckId: t.u32(),
    day: t.i32(),
    at: t.timestamp(),
    lat: t.f64(),
    lon: t.f64(),
    odometer: t.f64(),
    engineOn: t.bool(),
  }
);

export const cardTxn = table({ name: 'card_txn' }, {
  id: t.string().primaryKey(),
  cardId: t.string(),
  truckId: t.u32(),
  driverId: t.u32(),
  at: t.timestamp(),
  day: t.i32().index('btree'),
  stationName: t.string(),
  stationLat: t.f64(),
  stationLon: t.f64(),
  gallons: t.f64(),
  cents: t.i64(),
  merchant: t.string(),
});

export const tollTxn = table({ name: 'toll_txn' }, {
  id: t.string().primaryKey(),
  plate: t.string().index('btree'),
  truckId: t.u32(),
  at: t.timestamp(),
  day: t.i32().index('btree'),
  plazaId: t.string(),
  plazaName: t.string(),
  cents: t.i64(),
});

export const vendor = table({ name: 'vendor' }, {
  id: t.u32().primaryKey(),
  name: t.string(),
  bankLast4: t.string(),
  bankChangedDay: t.i32(),
});

export const contract = table({ name: 'contract' }, {
  id: t.u32().primaryKey(),
  vendorId: t.u32().index('btree'),
  item: t.string(),
  rateCents: t.i64(),
  validFromDay: t.i32(),
  validToDay: t.i32(),
  clause: t.string(),
});

export const po = table({ name: 'po' }, {
  id: t.string().primaryKey(),
  vendorId: t.u32(),
  truckId: t.u32(),
  item: t.string(),
  qty: t.f64(),
  unitCents: t.i64(),
  receivedQty: t.f64(),
  issuedDay: t.i32(),
});

export const invoice = table({ name: 'invoice' }, {
  id: t.string().primaryKey(),
  vendorId: t.u32().index('btree'),
  poId: t.option(t.string()),
  receivedDay: t.i32().index('btree'),
  item: t.string(),
  qty: t.f64(),
  unitCents: t.i64(),
  cents: t.i64(),
  docRef: t.string(),
});

// ---- operational state (public, no bank fields) ----
export const matchResult = table({ name: 'match_result', public: true }, {
  txnRef: t.string().primaryKey(),
  kind: t.string(),
  code: t.string().index('btree'),
  cents: t.i64(),
  day: t.i32().index('btree'),
  evidenceJson: t.string(),
  ruleId: t.option(t.u64()),
  decidedAt: t.timestamp(),
});

export const payment = table({ name: 'payment', public: true }, {
  txnRef: t.string().primaryKey(),
  cents: t.i64(),
  day: t.i32().index('btree'),
  releasedBy: t.identity(),
  releasedRole: t.string(),
  at: t.timestamp(),
  // the mock bank's transfer id once the worker has settled the payment (Task 17); 'offline-<txnRef>' in replay
  bankTxnId: t.option(t.string()),
});

export const dayTotal = table({ name: 'day_total', public: true }, {
  day: t.i32().primaryKey(),
  autoPaidCents: t.i64(),
  autoPaidCount: t.u32(),
  holdCount: t.u32(),
  rejectedCount: t.u32(),
  txnCount: t.u32(),
});

export const agentTask = table({ name: 'agent_task', public: true }, {
  id: t.u64().primaryKey().autoInc(),
  txnRef: t.string().index('btree'),
  kind: t.string(),
  status: t.string().index('btree'),
  version: t.u32(),
  claimedBy: t.option(t.identity()),
  claimedAt: t.option(t.timestamp()),
  briefJson: t.string(),
  stepsJson: t.string(),
  findingJson: t.string(),
  source: t.string(),
  createdDay: t.i32(),
  createdAt: t.timestamp(),
  updatedAt: t.timestamp(),
});

export const hold = table({ name: 'hold', public: true }, {
  txnRef: t.string().primaryKey(),
  kind: t.string(),
  code: t.string().index('btree'),
  cents: t.i64(),
  day: t.i32(),
  requestedBy: t.identity(),
  reason: t.string(),
  question: t.option(t.string()),
  answer: t.option(t.string()),
  callbackNote: t.option(t.string()),
  status: t.string().index('btree'),
  ruleId: t.option(t.u64()),
  actor: t.identity(),
  updatedAt: t.timestamp(),
});

export const rule = table({ name: 'rule', public: true }, {
  id: t.u64().primaryKey().autoInc(),
  sourceTxnRef: t.string(),
  scopeJson: t.string(),
  condition: t.string(),
  action: t.string(),
  backtestJson: t.string(),
  status: t.string().index('btree'),
  uses: t.string(),
  validFromDay: t.i32(),
  validToDay: t.i32(),
  createdBy: t.identity(),
  approvedBy: t.option(t.identity()),
  reason: t.string(),
  createdAt: t.timestamp(),
});

export const auditEvent = table({ name: 'audit_event', public: true }, {
  id: t.u64().primaryKey().autoInc(),
  at: t.timestamp(),
  day: t.i32(),
  actor: t.identity(),
  actorRole: t.string(),
  action: t.string().index('btree'),
  ref: t.string(),
  detail: t.string(),
});

const spacetimedb = schema({
  role,
  businessDay,
  dayTimer,
  terminal,
  truck,
  driver,
  tripPing,
  cardTxn,
  tollTxn,
  vendor,
  contract,
  po,
  invoice,
  matchResult,
  payment,
  dayTotal,
  agentTask,
  hold,
  rule,
  auditEvent,
});

export default spacetimedb;
