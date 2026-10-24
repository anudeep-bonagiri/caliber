# Project status

Append-only, dated. Status is not marketing copy.

## 2026-10-24 10:30 PDT (Saturday) Kickoff

- Planning docs finished overnight (Idea ranking, Build spec, Tasks). Decision: fleet accounts payable on SpacetimeDB, Factory Droid as investigator over Elastic Agent Builder tools, Fetch.ai uAgent as the controller's seat.
- Toolchain reality check: SpacetimeDB CLI installs 2.13.0, not the 2.10.2 the spec was verified against. Pinned the npm SDK to 2.13.0 and re-verified the builder API from the installed types and the official `spacetime init` template. Differences that mattered: `anonymousView` is the public-view call, `ctx.identity` is the database identity, `Identity.isEqual`, clients cannot subscribe to private tables.
- Repo created at 10:50 (after the Friday 6 PM kickoff), private until submission.

## 2026-10-24 11:00 PDT Module contract published

- Schema: 12 private company tables, 8 public operational tables (no bank fields). Three roles via a `role` table; the publisher becomes `seed` in `init`.
- Kernel is pure TypeScript (`kernel.ts`), 27 unit tests green.
- Verified against the live local server: `POST /v1/identity` mints identities; `grant_role` needs `{"__identity__": "0x<hex>"}`; anonymous SQL on `vendor` is refused; refusals return HTTP 530 with the message.

## 2026-10-24 11:10 PDT Second-opinion review (Codex) and fixes

Fifteen findings, all addressed except one that is a judgment call. The important ones:

- A thrown `SenderError` rolls back the audit row, so refusals were invisible in the ledger. Added `try_*` procedures that run the same check in a committed transaction and return `[ok, message]`. Verified live: an agent-token call to `try_approve_payment` leaves `audit_event` row `refused / agent / 2231`.
- `create_rule` trusted the worker's backtest. The module now computes the backtest itself from `match_result` and `hold`; the worker's numbers are stored as a preview only.
- A rate rule could clear a short-received invoice. Receiving is now checked after the rate rule.
- `approve_payment` could pay a rejected hold; now requires an approvable status, and re-checks the vendor bank-change window on the approval day.
- `seed` could move money through `rematch` and `inject_card_txn`; both are controller only, and an injected hold records the injector as requester.
- Tie-breaks for simultaneous tolls and same-day invoices, raw-microsecond nearest ping, PO integrity (`po_mismatch`), one-time rule consumption, deterministic rule and contract selection, daily cap $40,000.

## 2026-10-24 11:40 PDT Full run on final fixtures

- Seed 42: 5,607 card transactions, 2,157 tolls, 180 invoices, 155,457 pings; 52 planted exceptions and 6 decoys; the generator's Python mirror flags exactly the 58 key rows.
- First full run exposed four duplicate_invoice false positives (recurring same-amount invoices under alternating POs colliding with planted duplicates) and a facts.py option-decoding bug. Both fixed; the kernel was right.
- Second run: precision 1.0, recall 1.0; 6 of 6 decoys cleared with one answer each; 0 planted exceptions cleared by a rule; 6 policy holds; the two recorded fixtures replayed with every evidence quote verified against its source.
- 92 days advance in under a second of module time through step_day; the whole cycle is about ten seconds.
- Second Codex review (worker and agent) found 8 defects; all fixed: claimed-task recovery, retried terminal writes, evidence verification against sources, abort-safe timeouts, payload fitting, bounded chat text in the agent and the module.

## 2026-10-24 12:40 PDT Cold start, target checklist, rehearsals

- Item 1, cold start from a fresh clone with Wi-Fi off: demo_up 8 s, full cycle 9 s, facts identical to the committed file, refusal row present, CLI 2.13.0 matches the SDK, bindings regenerate with no diff. Three defects fixed first: a fresh seed identity could not publish over a database owned by another checkout (demo_up now restarts the local server on its own data dir), the seed venv had no pytest, and the facts file carried a wall-clock stamp.
- Item 2, every line of the target run literally: pass on all but the Devpost entry itself (draft exists). The clock replayed 92 days on the real 2 s tick (184 s of tick time) and paused on day 41 with hold 2231 on screen; a judge scenario 54 miles off route raised location_mismatch and cleared through rule 13 after one answer.
- Item 5, runbook rewritten as a beat table with moment two; dashboard shows the call-back pill, the call-back note on release, and live/replayed/stand-in counts; three end-to-end rehearsals from demo_up through both moments and the judge scenarios: 27 s, 28 s, 28 s.
- Secret scan clean after quoting the blanked key exports (gitleaks read `FACTORY_API_KEY= ANTHROPIC_API_KEY=` as a key).
- Items 3 and 4 wait on keys.

## 2026-10-24 13:55 PDT Live sponsor runs (item 3), Tasks 16 and 17 plumbing

Verified green (commands run, outputs in logs/ and docs/evidence/):
- Factory, `WORKER_MODE=record` over every task: 52 live Droid investigations, 0 stand-ins, all `subtype: success`; avg 25.6 s, 1,033 in and 1,354 out tokens per task (docs/evidence/cost_log_live_record_2026-10-24.jsonl). 2231 live: MCP `elastic___find_trips_near` names truck 22, Read of receipt, swap log and telematics, Grep for trucks 17 and 22, finding "a different truck, but the same driver", confidence 0.99, four verified quotes. Replay afterwards: 47 of 47 served from the recordings, 0 evidence quotes dropped.
- Elastic Serverless: ingest 154,846 pings (611 duplicate truck-and-time rows collapse on deterministic ids), 5,607 receipts, 34 contracts, 180 invoices; tools and agent created over the API; smoke 3 of 3 with a ten-minute window (a 45-minute window also returns truck 1, which fueled at the same station twelve minutes later); MCP exposes both tools.
- Full offline cycle after the module changes below: precision 1.0, recall 1.0, 6 of 6 decoys, 0 planted cleared by a rule, agent refusal recorded; 8 vendor_check tasks (2 replayed from the hand-shaped vendor-3 fixtures, 6 labelled stand-ins); payments settle with `offline-<txnRef>` ids.

Defects found by the live run, fixed:
- The first record pass produced 48 findings with zero tool calls. Droid 0.249 executes every tool through `Script` and loads MCP tools with `ToolSearch`; the worker had disabled both as "write tools" learned from `listTools()`. Also the brief omitted the transaction time. A probe (`worker/tools/probe_droid.mts`) found both.
- The spec's permission handler ("cancel everything except McpTool") was wrong for this SDK version: read confirmations are not typed McpTool. Handler is now subtractive (cancel edit, execute, create, apply_patch, ask_user, mission and violation types; proceed otherwise) and logs each decision as a step note.
- A deferred status for 429 and 5xx (one retry, hold stays open, no stand-in, never silent replay); replayed findings carry `recordedAt` and `recordedBy`.
- Two tasks on one hold (investigate and vendor_check) raced on the question; the investigation now owns it.

Honesty note: Droid's `Read` is not confined to `cwd`; in the live run it tried to read AGENTS.md files up the tree (they do not exist, so the reads failed). The OS, not the session options, is the real boundary. Stated in docs/not-built.md and the Droid section.

Tasks 16 and 17: module has `vendor_check` tasks (bank-change holds and first invoices) and `payment.bank_txn_id` with an agent-only `record_settlement` that refuses without a payment row. Worker has `crs.ts` with endpoint paths as TODO(crs-sandbox) placeholders, `vendor_check.ts`, two hand-shaped vendor-3 fixtures, `settle.ts` and `nessie.ts` with offline ids, `scripts/nessie_seed.py`. Dashboard shows the vendor-check block, call-back pill, settlement ids, and a `deferred` label. Blocked on: CRS sandbox invite and Postman collection (paths, bodies, response fields, OFAC score scale); `NESSIE_API_KEY` (and the live Nessie transfer schema differs from the brief: no `medium` or `payee_id`, integer `amount`, `status` required; `nessie.ts` adapts after the first rejection). Nessie `http://` refuses connections; `https://` is used.

Decisions:
- 16.7 (standing "any OFAC hit, reject" rule): proposed cut; the rule model clears only location_mismatch and rate_variance and refuses rules on bank-change holds by design (G6). Awaiting Anudeep.
- Agentverse mailbox: not connected yet; the ASI:One scripted session waits on the Connect click.
- Port 8000 is held by an ssh forward on this laptop; the agent runs on 8011.

## 2026-10-24 13:58 PDT Director start-of-shift review

Run by the director, not the builder. No builder launched yet.

Verified green:
- `scripts/check_env.sh`: the five offline variables and all seven live keys present; `NESSIE_API_KEY`, `CRS_USERNAME`, `CRS_PASSWORD` absent. Booleans only, no values printed.
- Task 8.0, fresh live run on 2251 (capacity_exceeded) through the worker's own `handleInvestigate` in live mode, nothing written to the ledger: `source: live`, `subtype: success`, 19.8 s, tokenUsage 989 in and 973 out. Stream: 8 `tool_call`, 8 `tool_result`, 1 `assistant`, 1 `result` whose `structuredOutput` passed `FindingSchema`. Tool calls: `Script`, `ToolSearch`, `elastic___find_trips_near`, `Read` three times. No `Execute`, `Edit`, `Create` or `ApplyPatch`. One permission prompt (`Script`), proceeded once. Recommendation `hold`, no question, as the spec requires for this code. Matches the recorded 2251 entry (989 in, 1076 out, 20.6 s), so the 13:55 log holds.
- Tests on the working tree: module 56 (27 kernel, 29 module harness), worker 99 and typecheck clean, seed 24. Agent: 113 pass, 1 fail (below).
- Forbidden patterns: no reducer deletes from `audit_event`; `payment` rows are inserted only by the kernel match path and `approve_payment`, and `record_settlement` only updates `bank_txn_id` on an existing row; no key or token printed by worker, agent or scripts; none of the 52 recorded investigations nor the record log mentions `answer_key`.

Defects and corrections:
- `agent/tests/test_intents.py::test_extract_json_shapes` fails locally: it calls `classify(api_key=None)` expecting `None`, but `classify` falls back to `ASI_ONE_API_KEY` from `.env` and made a real `asi1-mini` call during the test. Green in CI only because CI has no key. Fix the test to clear the variable, or make an explicit `None` mean off.
- `scripts/rehearse.sh` pipes CLI output into `head` on seven lines under `set -euo pipefail`; the judging-table scripts (`demo_up`, `full_run`, `clock`, `as_agent`) are clean.
- All six decoy recordings (1421, 2044, 2231, 3955, 5428, 5986) recommend `clear` with no question; the other 46 are `hold_and_ask`. The worker then opens the hold with the generic question "Agent recommends release. Approve the payment?", while runbook beats 01:00 and 01:10 still quote "Q: Did Ramon Ortiz drive truck 22 ...". One of the two must change. The 6 of 6 one-answer result in the full run is unaffected.
- The cost log carries `cacheCreationTokens` (about 48,000 per task) and `factoryCredits` beside the 989 input tokens. The "1,033 in tokens per task" line above excludes cache tokens; RESULTS.md and the Devpost text should quote credits or say "excluding cache".

Claimed in the 13:55 entry, not re-run by the director: Elastic ingest counts and the 3 of 3 tool smoke (the MCP tool did answer in the fresh run, so the endpoint is live); the full offline cycle numbers (the demo ledger was in use at day 92); the dashboard's vendor-check block, deferred label and settlement ids (not viewed); anything on ASI:One (mailbox not connected).

Blocked, and on whom:
- Task 16 live calls: CRS sandbox invite and Postman collection. On CRS; chase at the booth.
- Task 17 live transfer: `NESSIE_API_KEY`. On Anudeep (GitHub sign-in at nessieisreal.com).
- Task 10.4: the Agentverse mailbox Connect click; agent listens on 8011 because 8000 holds an ssh forward. On Anudeep.
- Decision 16.7 (standing "any OFAC hit, reject" rule): director recommends cut; G6 forbids rules on bank-change holds and the controller rejects from ASI:One anyway. On Anudeep.

## 2026-10-24 14:13 PDT Builder: Task 17 Nessie live

Builder-17, brief context/briefs/2026-10-24_1415_task17.md. Ledger not touched; no worker started or stopped. Everything below was run from a fresh request today, with the key read from .env and never printed.

The three facts from the probe (worker/tools/nessie_probe.mts, 123 cents, carrier to the fuel-and-tolls payee):
1. Request body. The documented shape {medium, payee_id, amount, transaction_date, description} is refused with HTTP 400: "3 validation errors for TransferCreate: status field required; medium extra fields not permitted; payee_id extra fields not permitted". The compact shape {amount, transaction_date, status, description} is accepted with HTTP 201. There is no field for the payee at all (payee_id alone is also refused), so the payee account id rides in the description.
2. Decimal amount. Nessie validates amount as an integer. A decimal is accepted with 201 and then stored floored: 1.23 lands as 1 and 1.99 lands as 1. A string "1.23" is refused ("value is not a valid integer"). An integer such as 98012 is stored exactly. Decision, approved by the director at 14:11: the amount field carries integer cents, the only encoding this server stores exactly, and the description names the payee, the dollar figure and the unit: txn_ref 2231 payee <account> amount $412.37 (amount field in cents). Nothing is rounded anywhere in nessie.ts; a non-integer cents value throws (exactCents). The transfer the fixed client sent stored amount 123 and reads back as 123 on GET /transfers/{id}.
3. Id field. The POST response is {code: 201, message: "Transfer created", objectCreated: {_id, amount, status, transaction_date, description}}; the id is objectCreated._id. GET /transfers/{id} returns the same record with the id under "id".

Mock-bank caveats learned on the way: balances never move (carrier still 10000000 after transfers with status pending and status completed); the server at api.nessieisreal.com answers only over https, http refuses the connection; the carrier account already lists 7244 transfers from the earlier live worker run, all with whole-dollar amounts (for example amount 393 for $392.93), because they were sent before this fix. Those bank records are inexact and should not be quoted as audit evidence; a fresh ledger run after this commit writes exact ones.

Latency and volume: one compact POST took 261 to 789 ms across seven probes, about 320 ms typical; the first transfer in a process pays one extra 400 (about 300 ms) before the client switches shape. A full run creates about 7,900 payment rows. With 4 in flight and no cap the watcher would clear that in about 10.5 minutes; with the new NESSIE_MAX_PER_SECOND cap at its default of 5 it takes about 26 minutes (7,900 / 5 = 1,580 s). The kernel writes roughly 86 payments per business day, which the cap clears in about 17 s per day tick, so a worker that runs live alongside the replay keeps up; a worker started after the replay faces the full backlog. GET /accounts/{carrier}/transfers (7,244 rows) took 6.1 s and is not used by the worker.

Idempotency, read in settle.ts: enqueue dedups on the busy set; settleOne re-reads the payment row and skips one that already carries bank_txn_id; a transfer whose record_settlement write fails is kept in the unrecorded map and re-recorded on the next sweep, never re-sent (test "re-records the same bank id after a failed write instead of transferring twice"); a 4xx refusal is not retried. Added: RateLimiter (slots 1000/maxPerSecond ms apart, shared across the 4 settlers, a retry takes a fresh slot), parseMaxPerSecond reading NESSIE_MAX_PER_SECOND (default 5; non-positive or non-numeric values throw), and the start log line now states the cap. The one-transfer-per-payment rule is unchanged.

Checks, each as run and observed:
- scripts/check_env.sh: NESSIE_API_KEY true, NESSIE_BASE true.
- readAccounts(seed/fixtures/nessie_accounts.json): ok, carrier, fuelTolls and vendors 1 to 5. The file is already committed in 2035dae (the brief's "untracked" note was stale); it holds sandbox account ids only, no secret, so it stays committed.
- GET /accounts/{id} for all 7 ids: 200 each, 280 to 450 ms.
- npx tsx tools/nessie_probe.mts (before the fix): 400 then 201, body amount 1 for 123 cents; after the fix: 400 then 201, body and stored amount 123, id bc346c74-3e56-4498-9ed2-991d419379c3, 643 ms over 2 requests.
- worker: npm run typecheck clean. npx vitest run: 101 pass, 2 fail. Both failures are in test/replay.test.ts and read seed/fixtures/investigations/2231.json, which another session re-recorded on disk at 14:07 (recommendation hold_and_ask, recordedAt 21:07:04Z; the committed file at a87192e says clear and 20:27:35Z and passes). Not mine to touch; the six decoy fixtures 1421, 2044, 2231, 3955, 5428, 5986 are all modified and uncommitted in the working tree.
- web: npm run build, built in 1.03 s. Labels: Queue.tsx resolved rows show "settled <id>" for a bank id and "settlement: offline" for an offline one (colon added to match TASKS 17.3); LedgerOfTrust.tsx audit feed shows "paid, bank id <id>" for a bank id and now "paid, settlement: offline (offline-<txnRef>)" for an offline one, so a stand-in id never reads as a bank id. Nothing else from Nessie is rendered: no balances, customers or account numbers anywhere in web/src.
- Step 4: spacetimedb/src/module.test.ts has no record_settlement refusal test. Assigned by the director to another builder (module.test.ts only). The reducer itself (index.ts 683 to 691) refuses "no payment to settle" when the payment row is missing and "already settled" when bank_txn_id is set.

Claimed, not verified here: the ledger-level acceptance (approve 2231 from ASI:One, id in the audit feed within 2 s) was not run; the ledger belongs to builder-13 until released. The dashboard labels were checked in source and by build, not viewed in a browser.

Hand-off for the director's ledger run. Start the worker from worker/ with
    WORKER_MODE=live npm start
reading .env with STDB_URI, STDB_DB, STDB_AGENT_TOKEN, NESSIE_API_KEY set, and optionally NESSIE_BASE, NESSIE_ACCOUNTS, NESSIE_MAX_PER_SECOND. Settlement is live when WORKER_MODE is live or record and NESSIE_API_KEY is non-empty; replay, or an empty key, writes offline ids. FACTORY_API_KEY empty forces investigations to replay but leaves settlement live. The first log line reads "settlement: live through Nessie (mock bank), at most 5 transfers per second, 4 in flight". Timing note for the 2 second check: a new payment is picked up on insert and takes one slot in the shared queue, so start the live worker before the replay (or let the backlog drain) rather than approving 2231 into a queue of thousands of unsettled kernel payments. Then:
    curl -s -X POST http://127.0.0.1:3100/v1/database/dispatch-ledger/sql -d "SELECT txn_ref, cents, bank_txn_id FROM payment WHERE txn_ref = '2231'"
    curl -s -X POST http://127.0.0.1:3100/v1/database/dispatch-ledger/sql -d "SELECT action, ref, detail FROM audit_event WHERE ref = '2231' AND action = 'settle'"
The first shows bank_txn_id as a Nessie uuid (or offline-2231 offline), the second the audit row "bank id <id>".

Settlement paragraph for README (builder-13 owns README.md; text to hand over):
Settlement. When a payment row appears, written by the kernel within its limits or by approve_payment, the worker sends one transfer from the carrier's account to the payee's account at Capital One's Nessie mock bank (POST /accounts/{carrier}/transfers) and writes the returned transfer id onto the payment through the record_settlement reducer, which only the agent identity may call and which refuses when no payment row exists, so settlement can never create a payment. The bank record carries the ledger's txn_ref, the payee account and the exact amount: Nessie stores whole numbers only, so the amount field carries cents and the description states the unit and the dollar figure. The audit feed shows "paid, bank id <id>". Offline, or without a key, the id is offline-<txn_ref> and the feed says "settlement: offline". Nessie is a sandbox: no money moves, balances do not change, and the id proves only that the call was made and answered.

Files changed: worker/src/nessie.ts, worker/src/settle.ts, worker/test/settle.test.ts, worker/tools/nessie_probe.mts (new), web/src/components/Queue.tsx, web/src/components/LedgerOfTrust.tsx, .env.example, this file, logs/builder_17.log.

## Tried and rejected

| What | Why rejected |
| --- | --- |
| Private `agent_task` table with the worker subscribing | Clients cannot subscribe to private tables in 2.13; made operational tables public and kept company data private |
| `spacetime login` with GitHub for the local demo | Needs a browser and ties the publisher to a cloud identity; the demo mints a local identity with `POST /v1/identity` and logs the CLI in with that token |
| Worker-side backtest scored against the answer key | Agent code must never read the key; the module backtests against confirmed controller decisions instead |
| A pause button in the dashboard | Vite inlines env vars into the bundle, which would ship the controller token; pause is a terminal or ASI:One command |
