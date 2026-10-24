# Integration contract

Every component talks to one SpacetimeDB module. This file is the agreed shape of what crosses the boundary. If you change it, change the module first, regenerate `module_bindings/`, then update this file.

## Identities and roles

| Role | Who holds it | May call |
| --- | --- | --- |
| `seed` | the publisher (CLI identity), `scripts/` | `grant_role`, `seed_*`, `vendor_bank_change`, `reset_sim`, `set_clock`, `set_tick_micros`, `step_day`, `rematch`, `inject_card_txn` |
| `agent` | `worker/` only | `claim_task`, `record_investigation`, `create_rule` |
| `controller` | `agent/` (ASI:One) and the demo laptop CLI | `set_clock`, `set_tick_micros`, `step_day`, `answer_question`, `approve_rule`, `reject_rule`, `approve_payment`, `reject_payment`, `rematch`, `inject_card_txn` |
| anonymous | dashboard | read public tables only |

`approve_payment` additionally refuses when `hold.requested_by` equals the caller, refuses holds that are not `open`, `awaiting_controller` or `answered`, and refuses without a call-back note of at least 8 characters when the hold code is `vendor_bank_change` or the invoice's vendor changed its bank account within the last 7 days (re-checked at approval time). `approve_rule` refuses the rule's author. `rematch` and `inject_card_txn` are controller only; a hold raised by an injected transaction records the injecting controller as `requested_by`, so that controller cannot approve it.

**Two entry points per controller action.** Reducers (`approve_payment`, `reject_payment`, `answer_question`, `approve_rule`, `reject_rule`, `set_clock`, `step_day`, `rematch`) throw `SenderError` on refusal: HTTP 530 with the message in the body, and the whole transaction, including the audit row, rolls back. Procedures with the same arguments and a `try_` prefix (`try_approve_payment`, `try_reject_payment`, `try_answer_question`, `try_approve_rule`, `try_reject_rule`, `try_set_clock`, `try_step_day`, `try_rematch`) run the identical check inside a committed transaction and return `[ok, message]` with HTTP 200, so a refusal leaves a persistent `audit_event` row (`action = 'refused'`, `actor_role` = the caller's role, `detail` = the message). The ASI:One agent, the CLI and the demo scripts use the `try_` procedures; SDK clients may use either.

Tokens live in `.env` at the repo root (gitignored): `STDB_URI`, `STDB_DB`, `STDB_SEED_TOKEN`, `STDB_AGENT_TOKEN`, `STDB_CONTROLLER_TOKEN` plus the matching `*_IDENTITY` hex strings. Mint more with `POST {STDB_URI}/v1/identity` (no body) which returns `{identity, token}`.

## Tables

Public (subscribe or SQL with no token): `business_day`, `match_result`, `payment`, `day_total`, `agent_task`, `hold`, `rule`, `audit_event`.
Private (reducers only): `role`, `day_timer`, `terminal`, `truck`, `driver`, `trip_ping`, `card_txn`, `toll_txn`, `vendor`, `contract`, `po`, `invoice`.

SQL and subscription names are snake_case (`agent_task`, `txn_ref`). Generated client rows are camelCase (`txnRef`). Money is `i64` cents (bigint in TypeScript, `int` in Python). Timestamps are `Timestamp` with `microsSinceUnixEpoch: bigint`.

### Status machines

- `agent_task.status`: `open` -> `claimed` -> `investigated` | `timeout`. `kind` is `investigate`, `draft_rule` or `vendor_check` (Task 16: inserted for every `vendor_bank_change` hold and for a vendor's first invoice; its `brief_json` carries `vendor: {id, name, bankChangedDay}` and `trigger: bank_change | first_invoice`, never anything about a person).
- `hold.status`: `open` -> `awaiting_controller` -> `answered` -> `cleared_by_rule` | `released` | `rejected`. A `limit` hold goes `open` -> `released` | `rejected`.
- `rule.status`: `candidate` -> `approved` | `rejected`; `approved` -> `expired` once `valid_to_day` passes.
- `match_result.code`: `matched`, `limit`, `location_mismatch`, `capacity_exceeded`, `rate_variance`, `duplicate_toll`, `duplicate_invoice`, `vendor_bank_change`, `short_received`, `po_mismatch` (invoice names a PO that does not exist, belongs to another vendor, or is for another item).
- `rule.uses`: `one_time` rules are consumed (status `expired`, reason says by which transaction) the first time they clear a row; `standing` rules run until `valid_to_day`.

### Transaction references

Card transactions are plain numbers as strings (`"2231"`), tolls are `T` plus a number (`"T1042"`), invoices are `INV-` plus a number (`"INV-1077"`). `txn_ref` is the primary key of `match_result`, `hold` and `payment`.

## JSON carried in string columns

`agent_task.brief_json` for `kind = investigate`:

```json
{"txnRef": "2231", "kind": "card", "code": "location_mismatch", "cents": "41200", "day": 41, "date": "2026-08-27",
 "evidence": {"truckId": 17, "driverId": 23, "driverName": "Ramon Ortiz", "plate": "TX-1017", "cardId": "FC-02",
              "stationName": "Love's 412, Schulenburg TX", "stationLat": 29.68, "stationLon": -96.9,
              "nearestPing": {"lat": 29.42, "lon": -98.49, "atMicros": "...", "deltaMin": 4, "engineOn": false, "odometer": 183210.4},
              "distanceMiles": 96.3, "thresholdMiles": 25, "gallons": 120.0, "merchant": "LOVES #412"},
 "questionHint": "Was this card used by a different truck or driver that day?"}
```

`agent_task.brief_json` for `kind = draft_rule`: same keys plus `"question"` and `"answer"` (the controller's text).

`agent_task.steps_json`: an array, in order, of what the investigator did. Each element is one of

```json
{"type": "tool_call", "at": "ISO-8601", "name": "find_trips_near", "toolUseId": "...", "input": {...}}
{"type": "tool_result", "at": "ISO-8601", "toolUseId": "...", "toolName": "find_trips_near", "content": "...", "isError": false}
{"type": "assistant", "at": "ISO-8601", "text": "..."}
{"type": "note", "at": "ISO-8601", "text": "replayed from fixtures/investigations/2231.json"}
```

`agent_task.finding_json` (validated by zod in the worker before the reducer call):

```json
{"finding": "The card for truck 17 was used while truck 22 was at the pump.",
 "evidence": [{"source": "find_trips_near", "ref": "truck 22 @ 2026-08-27T13:07Z", "quote": "truck_id=22 dist_m=41"},
              {"source": "swap_log.txt", "ref": "line 14", "quote": "08/27 Ortiz R. -> unit 22 (17 in shop)"}],
 "recommendation": "hold_and_ask",
 "question_for_controller": "Did Ramon Ortiz drive truck 22 on Aug 27 while truck 17 was in the shop?",
 "confidence": 0.86,
 "status": "ok",
 "model": "droid", "durationMs": 23810, "tokenUsage": {"input": 0, "output": 0}}
```

`recommendation` inside `finding_json` is one of `clear`, `hold`, `hold_and_ask`. There is no `pay`. The `recommendation` argument of `record_investigation` carries the task outcome and additionally allows `done` (a `draft_rule` task finished) and `timeout` (no finding could be produced in time); the reducer refuses anything else and refuses a task that is not in status `claimed` by the caller. Controller text fields are bounded by the module: answers up to 1000 characters, call-back notes and reasons up to 500, none may be blank. `status` is `ok`, `replayed`, `timeout` or `no_fixture`. `agent_task.source` is `live`, `replayed` or `none`.

`rule.scope_json`: `{"driverId": 23}` or `{"truckIds": [17, 22]}` or `{"cardId": "FC-02"}` or `{"vendorId": 3}`; at least one key. The kernel applies a rule only when `condition` equals the code it is about to raise, the day is inside `[valid_from_day, valid_to_day]`, and every scope key present matches the row.

`rule.backtest_json` is computed by the module itself inside `create_rule` from `match_result` and `hold` (the worker's own numbers are stored under `workerPreview` for comparison; the answer key is never read by anything but `scripts/facts.py`):

```json
{"n": 3, "wouldClear": 3, "openHoldsCovered": 1, "confirmedExceptionsCovered": 0, "trueExceptionsCleared": 0,
 "window": {"fromDay": 41, "toDay": 46}, "computedAt": "ISO-8601"}
```

`confirmedExceptionsCovered` counts holds with `status = 'rejected'` (the controller confirmed the exception) that the rule would have cleared. `create_rule` refuses any rule whose module-computed `trueExceptionsCleared` is above zero, any unscoped rule, and any condition other than `location_mismatch` or `rate_variance` (the allowlist `RULE_CONDITIONS` in thresholds.ts).

`match_result.evidence_json`: the kernel's evidence object (see the brief above). Every number shown in the UI comes from here or from a row.

## HTTP API (used by `agent/` and `scripts/`)

- Call: `POST {STDB_URI}/v1/database/{STDB_DB}/call/{snake_case_name}` (reducer or procedure) with `Authorization: Bearer <token>` and a JSON array of arguments in declaration order. Row-typed arguments (for example the `row` of `inject_card_txn`) use snake_case field names over HTTP (`card_id`, `truck_id`), a timestamp field is `{"__timestamp_micros_since_unix_epoch__": micros}`. A procedure returns its value as JSON: the `try_` procedures return `[true, "ok"]` or `[false, "<refusal>"]`. Option arguments are `{"some": value}` or `{"none": []}`. Identity arguments are `{"__identity__": "0x<hex>"}` (the `0x` prefix is required; verified against 2.13.0). `u64` and `i64` are JSON numbers. 200 means committed; 530 means the reducer threw and the body is the message; 401 or 403 is a bad token; 404 is a wrong database name.
- SQL: `POST {STDB_URI}/v1/database/{STDB_DB}/sql` with the query as plain text in the body. Response is `[{"schema": {"elements": [{"name": {"some": "col"}, ...}]}, "rows": [[...], ...]}]`. Observed encodings on 2.13.0 (verified against the live endpoint): a timestamp column comes back as a one-element array of micros `[1792864101673923]`, an identity as a one-element array `["0x<hex>"]`, `u64`/`i64` as plain numbers (use arbitrary precision when parsing), and option columns as `[0, value]` for some and `[1, []]` for none (verified). Anonymous callers see only public tables.
- Reducer names over HTTP, CLI and SQL are snake_case (`approve_payment`); client bindings expose them camelCase (`conn.reducers.approvePayment({ txnRef, callbackNote })`).

## Reducer signatures (argument order matters over HTTP)

| Reducer | Arguments |
| --- | --- |
| `grant_role` | `identity: Identity`, `role: string` |
| `seed_terminals` .. `seed_invoices` | `rows: Row[]` (one reducer per table, 500 rows per call) |
| `vendor_bank_change` | `vendorId: u32`, `bankLast4: string`, `day: i32` |
| `reset_sim` | none |
| `set_clock` / `try_set_clock` | `paused: bool` |
| `set_tick_micros` | `micros: u64` (minimum 100000) |
| `step_day` / `try_step_day` | none |
| `rematch` / `try_rematch` | `txnRef: string` (controller only) |
| `claim_task` | `id: u64`, `version: u32` |
| `record_investigation` | `id: u64`, `stepsJson: string`, `findingJson: string`, `recommendation: string`, `question: string?`, `source: string` |
| `create_rule` | `sourceTxnRef: string`, `scopeJson: string`, `condition: string`, `backtestJson: string`, `uses: string`, `validFromDay: i32`, `validToDay: i32`, `reason: string` |
| `answer_question` / `try_answer_question` | `txnRef: string`, `text: string` |
| `approve_rule` / `try_approve_rule` | `id: u64` |
| `reject_rule` / `try_reject_rule` | `id: u64`, `reason: string` |
| `approve_payment` / `try_approve_payment` | `txnRef: string`, `callbackNote: string?` |
| `reject_payment` / `try_reject_payment` | `txnRef: string`, `reason: string` |
| `inject_card_txn` | `row: CardTxn` (controller only; day is overwritten with the current day; the caller becomes the hold's requester) |
| `record_settlement` | `txnRef: string`, `bankTxnId: string` (agent only; refuses when no `payment` row exists or it is already settled; writes `payment.bank_txn_id`, audit action `settle`) |

`answer_question` also inserts an `agent_task` with `kind = draft_rule`. `approve_rule` re-runs the kernel on the rule's source transaction immediately, so the hold clears without waiting for the next tick.

## Fixture files (written by `seed/`, loaded by `scripts/load_fixtures.ts`)

All in `seed/fixtures/`, JSON arrays, keys exactly as the module columns (camelCase). Timestamps are ISO-8601 UTC strings (`"2026-08-27T13:05:00Z"`); the loader converts them. Cents are integers. Auto-increment ids are omitted.

| File | Row keys |
| --- | --- |
| `terminals.json` | `id, name, lat, lon` |
| `trucks.json` | `id, plate, tankGal, fuelCardId, terminalId` |
| `drivers.json` | `id, name, homeTerminal, truckId` |
| `trip_pings.json` | `truckId, day, at, lat, lon, odometer, engineOn` |
| `card_txns.json` | `id, cardId, truckId, driverId, at, day, stationName, stationLat, stationLon, gallons, cents, merchant` |
| `toll_txns.json` | `id, plate, truckId, at, day, plazaId, plazaName, cents` |
| `vendors.json` | `id, name, bankLast4, bankChangedDay` (0 when never changed) |
| `contracts.json` | `id, vendorId, item, rateCents, validFromDay, validToDay, clause` |
| `pos.json` | `id, vendorId, truckId, item, qty, unitCents, receivedQty, issuedDay` |
| `invoices.json` | `id, vendorId, poId (string or null), receivedDay, item, qty, unitCents, cents, docRef` |
| `answer_key.json` | `[{"txnRef", "code", "expected": "hold" \| "auto_reject" \| "clear_after_question", "note"}]`. Read only by `scripts/facts.py` in the demo path (the generator's mirror and seed tests read it to verify the generator). |
| `evidence/` | what the investigator may open: `receipts/<txnRef>.txt`, `contracts/<id>.txt`, `invoices/<id>.txt`, `swap_log.txt`, `telematics/<day>.csv` |
| `investigations/<txnRef>.json` | recorded findings for replay mode: `{"finding": <finding_json>, "steps": <steps_json>, "recordedAt": "ISO"}` |

The simulated calendar: business day 1 is 2026-07-01, weekdays only, 92 days. `spacetimedb/src/calendar.ts` is the reference implementation; `seed/calendar.py` must agree with it (a test asserts the 92 dates match).

## Environment variables

| Variable | Used by |
| --- | --- |
| `STDB_URI`, `STDB_DB` | everything (web uses `VITE_STDB_URI`, `VITE_STDB_DB`) |
| `STDB_SEED_TOKEN` | `scripts/` |
| `STDB_AGENT_TOKEN` | `worker/` |
| `STDB_CONTROLLER_TOKEN` | `agent/`, `scripts/controller.py` |
| `WORKER_MODE` | `worker/`: `live`, `record` or `replay` |
| `FACTORY_API_KEY` | `worker/` live Droid |
| `ELASTICSEARCH_URL`, `ELASTIC_API_KEY`, `KIBANA_URL` | `elastic/`, `worker/` live Droid MCP |
| `ANTHROPIC_API_KEY` | `worker/` rule drafting and explanations (optional; templates otherwise) |
| `ASI_ONE_API_KEY`, `AGENT_SEED`, `AGENT_PORT` | `agent/` |
