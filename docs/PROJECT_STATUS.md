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

## 2026-10-24 14:14 PDT Builder-W: settlement module test, video script, Agentverse README

- Job 1: `spacetimedb/src/module.test.ts` gained describe 7 (record_settlement): agent only (controller, seed, anonymous refused by role), no payment row refused with "no payment to settle" for both a held transaction and an unknown ref, a successful call writes `bank_txn_id` and exactly one `settle` audit row with actor role agent, a second call refused "already settled as <id>" leaving the first id, blank and 121-character ids refused and a 120-character id accepted. Check: `cd spacetimedb && npx vitest run` -> 60 passed (33 module); `npm run generate` -> `git status --short module_bindings` empty. Nothing in index.ts was missing; no it.todo.
- Job 2: `docs/VIDEO.md` rewritten as a shot list with timecodes, spoken line, on-screen element and the source of every number (screen element or docs/FACTS.md dated 2026-10-24T21:10:26Z). Live-dependent beats (ASI:One mailbox, CRS live, Nessie live) carry "[if green, else replay]" with the replay line. Never-say list from the runbook as the footer. Check: no em dash (grep count 0).
- Job 3: `agent/README.md` carries the address the running agent logged (agent1qt278cr9luj7xw9cs6c47lnfl9tvx9xsu7asxtmhuqkcqq920m6ju5y5yge, from logs/agent.log) and one example per command with the reply shape; `agent/CONNECT.md` has the start order, the Inspector clicks, the profile paste and tags, the submission-agent step, and the timed five-line session. Checks: badge lines byte-exact (grep), no em dash, `agent/.venv/bin/python -m agent.cli "status"` answered "Day 92 of 92 ..." read-only.
- Not verified by me: the ASI:One session itself (mailbox not connected at the time); the video has not been recorded.
- Commits are without the Claude co-author trailer: Anudeep's standing rule for his repos is no co-author trailer, and his rule outranks the brief on that line.

## 2026-10-24 14:17 PDT Builder-W: uAgent restart (job 4) and dashboard honesty audit (job 5)

- Job 4: `agent/agent.py` restarted on port 8011 after the .env rewrite; logs/agent.log shows the same address agent1qt278cr9luj7xw9cs6c47lnfl9tvx9xsu7asxtmhuqkcqq920m6ju5y5yge, the Inspector link, manifest published, mailbox still not found (Connect click pending). `agent/.venv/bin/python -m agent.cli "status"` answered "Day 44 of 92 ...". Worker and ledger scripts untouched.
- Job 5: read-only audit of the running dashboard (screenshots and captions in docs/evidence/dashboard/). The ledger was at day 44 under the rehearsal; 2,072 elements carry a source id in their hover title.

| Element | What it shows | Verdict |
| --- | --- | --- |
| Overview line | "Simulated carrier. Every figure on this page is read from the ledger." under the clock | honest |
| Investigation badge | `replayed` with hover "Recorded execution. agent_task N.source = replayed" on every investigated card seen (770003, INV-1032, INV-1077) | honest |
| Recording label | step notes "replayed from fixtures/investigations/<ref>.json" and "replayed from a recording made 2026-10-24 by droid live run" | honest |
| First step note | the fixture's own first note reads "live droid run (record) for <ref>" and sits above the replay notes; a skim reads the word "live" on a replayed card | misleading wording; the badge is right, the note should say "recorded" |
| Scripted stand-in label | no investigate task is a stand-in in this run ("0 scripted stand-in"), so the label could not be observed on an investigation card; the vendor-check stand-in reads "stand-in, not a vendor check" with three "no result" rows (INV-1032) | honest where shown; not observable for investigations |
| Trust-panel provenance line | "Investigations: 0 live, 27 replayed, 0 scripted stand-in" counts investigate tasks only, while six vendor checks on screen are stand-ins | misleading by omission; should count or name vendor checks |
| Deferred label | zero occurrences of "deferred" in the page; no deferred finding exists in this run | not observable |
| Vendor check on a bank-change hold (INV-1077) | block present, three rows sourced crs:business_credit, crs:public_records, crs:ofac, recommendation approve, badge `replayed`, the sentence "No consumer credit, no driver or person data is ever sent" | TOP FINDING: the fixture is hand-shaped (seed/fixtures/vendor_checks/3.json says "shape of a sandbox response, not real data") but the card shows "risk class LOW, score 71, 12 years on file" under a `replayed` badge whose hover says "Recorded execution"; nothing on screen says these numbers are invented. A judge would take them for a sandbox result. Each row also prints "POST /TODO-business-credit (replayed from vendor_checks/3.json)", exposing placeholder paths |
| Settlement labels | queue resolved rows "settlement: offline" with hover "payment <ref>.bank_txn_id offline-<ref>"; audit feed "paid, settlement: offline (offline-<ref>)"; "Paid: $9,800.00 on day 44, released by controller" on the card | honest |
| Call-back pill | `call-back required` on the queue row and the card header with the refusal rule in the hover; the call-back note shown once released | honest |
| Rules board | "#1 location_mismatch on driver 23, one time, used, days 41 to 46, from 2231, Would have cleared 1 past rows; 0 were confirmed exceptions, one_time rule consumed by 2231" | honest |
| Hover source ids | counters, hold rows, audit cells and rule fields all carry titles such as "hold INV-1077 cents", "audit_event 7392.actor ...", "rule 1.backtest_json" | honest |
| Model offline pill | absent (a worker was active) | not observable |

- Not fixed by me (read-only lane): (1) the vendor-check card needs the fixture's "hand-shaped, not a recorded sandbox response" note on screen and a badge other than `replayed` until a recorded response replaces 3.json, and the "POST /TODO-..." strings should not render; (2) the trust-panel provenance line should include vendor checks; (3) the first step note wording "live droid run (record)" should read "recorded" on replay.
- Checks: screenshots written to docs/evidence/dashboard/ (4 files plus captions.md); no page interaction beyond clicks and reads; the ledger was not written to.

## 2026-10-24 14:21 PDT Builder-W: dashboard honesty fixes (job 6), commit 2fac596

- (1) Hand-shaped vendor checks: `replayVendor` sets `finding.status = hand_shaped` when the fixture lacks `recorded: true` (task source stays `replayed`; the module's source column is free text but the dashboard and the provenance line key on the finding status), prefixes the finding with "Hand-shaped fixture, not sandbox data.", carries the fixture's own note as `finding.fixtureNote`, and every evidence ref is now a label plus suffix such as "business credit (hand-shaped fixture)"; `crs.endpointLabel` returns the human label only, so no "POST /TODO-..." string can reach a card (the TODO endpoint config itself is untouched). The card shows an amber `hand-shaped fixture, not sandbox data` badge and prints "Fixture note: ..."; recorded responses (`recorded: true`) keep `replayed` with "(replayed from vendor_checks/<file>)" refs.
- (2) Trust panel line now reads "Investigations: N live, N replayed, N scripted stand-in. Vendor checks: N live, N recorded replay, N hand-shaped fixture, N stand-in", each count with its source id on hover.
- (3) At replay time the recording's first note "live droid run (record) for <ref>" is reworded to "recorded droid run (<date>) for <ref>"; the fixture file is not changed (test asserts the file still contains the original wording).
- Checks: `cd worker && npm run typecheck` clean; `npx vitest run` 106 passed (99 before; new tests: hand-shaped status and refs, no "/TODO-" in any serialized outcome for both fixture variants and the stand-in, a `recorded: true` fixture stays `replayed`, the live-run note is reworded and the file untouched); `cd web && npx tsc --noEmit` clean, `npm run build` ok; `grep -rn "TODO-" web/src` empty.
- Not verified yet: the live dashboard re-check waits for the next worker restart (the running worker serves the old code; the director restarts it). Files touched: worker/src/vendor_check.ts, crs.ts (endpointLabel only), replay.ts, worker/test/vendor_check.test.ts, replay.test.ts, web/src/components/Investigation.tsx, LedgerOfTrust.tsx. Fixtures, brief.ts, investigate.ts, droid.ts, finding.ts, settle.ts, nessie.ts, README and docs untouched; worker and ledger scripts not run.

## 2026-10-24 14:22 PDT Builder: decoy re-record, three defects, Task 13

Brief: context/briefs/2026-10-24_1410_task13.md. Commits: 8e004e1 (Job 1), ed10bce (Job 2), Job 3 is this commit. Log: logs/builder_13.log.

Job 1, decoy re-record. Steps 1 and 2 were already on disk when I started (the six `_v1/` copies byte-identical to the then-current fixtures; the brief.ts sentence matching the brief); kept and committed. `worker/tools/rerecord_decoys.mts` read each brief_json from the ledger anonymously and ran the worker's own `handleInvestigate` in `WORKER_MODE=record`; nothing was written to the ledger. All six came back on the first attempt; no `_v1` file was restored.

| Decoy | Source | Recommendation | Question (one sentence) | in / out / cache tokens | durationMs |
| --- | --- | --- | --- | --- | --- |
| 1421 | live | hold_and_ask | Can Clayton Burks or the San Antonio dispatcher confirm that he used FC-1015 to fuel truck 9 at Stripes 1150 on July 10 while truck 15 was in the shop? | 1,089 / 1,119 / 55,331 | 20,340 |
| 2044 | live | hold_and_ask | Can Jerome Watkins or the San Antonio dispatch desk confirm that he used FC-1030 to fuel truck 14 for transaction 2044 on 2026-07-27 while truck 30 was in the shop? | 1,083 / 1,202 / 59,996 | 19,733 |
| 2231 | live | hold_and_ask | Can Ramon Ortiz or the San Antonio dispatcher confirm that Ortiz used FC-1017 to fuel truck 22 for transaction 2231 while truck 17 was in the shop under PO-1026? | 1,084 / 1,206 / 55,461 | 18,977 |
| 3955 | live | hold_and_ask | Can Carl Whitaker or the San Antonio dispatch desk confirm that he carried FC-1035 to truck 27 during the September 9 reassignment and used it for transaction 3955? | 1,090 / 1,222 / 55,330 | 20,542 |
| 5428 | live | hold_and_ask | Can Alejandro Garza or the dispatcher responsible for the 2026-10-12 swap confirm that he retained FC-1006 and used it to fuel truck 13 for transaction 5428? | 1,093 / 1,070 / 134,259 | 17,810 |
| 5986 | live | hold_and_ask | Can Derrick Osborne or the San Antonio dispatcher confirm that he used FC-1016 to fuel truck 31 at Pilot 1126 on October 23 while truck 16 was in the shop? | 1,090 / 1,217 / 60,030 | 19,630 |

Every fixture: evidence has a `find_trips_near` item and a `swap_log.txt` item, `recordedAt` set, confidence 0.97 or 0.98, tool calls Script, ToolSearch, elastic___find_trips_near, Read, Grep; no Execute, Edit, Create or ApplyPatch. Six lines kept as docs/evidence/cost_log_decoy_rerecord_2026-10-24.jsonl (new file, outside the brief's list, so facts.py never reads the gitignored worker log).

Incident (my run, director's message landed late): I advanced the ledger from day 44 to 92 to make the six briefs exist while a worker left in `WORKER_MODE=live` was still running. Between 21:04 and 21:09Z it made 25 unplanned live Droid investigations (worker/cost_log.jsonl; roughly 1.1k input, 1.2k output and 50k to 130k cache tokens each) and offline settlements (no live Nessie call: the worker had no key at the time). It overwrote no fixture (live mode does not record). Killed at 14:09; no worker process was left before full_run.sh. Those 25 lines are excluded from every published number: facts.py reads only the two committed evidence logs.

Full offline cycle (`scripts/full_run.sh`, 13 s, logs/full_run_builder13.log) from docs/FACTS.md: precision 1.0, recall 1.0; decoys cleared through an approved rule 6 of 6 (6 with exactly one controller answer); planted exceptions cleared by a rule 0; policy holds 6; auto-paid 7886 payments $1,083,630.52; controller released 9 payments $37,547.00; refusals 1 (agent); investigations by source replayed 47, scripted 0; settlement 7895 labelled offline ids, 0 unsettled (facts.py was re-run after the watcher finished; the first pass inside full_run printed 3334 offline and 4561 unsettled because the watcher was still sweeping). `scripts/controller_sim.py` answers any `awaiting_controller` location_mismatch hold from the swap log regardless of the question text, so the new questions are answered. The hold row for 2231 carries the recorded question (SQL on `hold`).

Job 2a. `agent/intents.py`: `ASI_MOCK=1` makes `_chat_completion` return a canned `status` classification with no network; `agent/conftest.py` (new; agent/ had neither conftest nor pytest.ini) sets it for the run; `test_asi_mock_never_touches_the_network` monkeypatches `httpx.post` to raise and asserts the canned reply with a key present; `test_extract_json_shapes` now clears the env key before asserting `classify(api_key=None) is None`. Check: `agent/.venv/bin/pytest -q agent` 115 passed with the key in .env; 115 passed with `ASI_ONE_API_KEY=` set empty in the environment (an empty variable wins over .env in `load_dotenv`; I did not edit .env to remove the key).

Job 2b. `scripts/rehearse.sh`: no `| head` anywhere; outputs captured and printed through `sed -n` on the captured text. Checks: `grep -n '| *head' scripts/rehearse.sh` prints nothing; `scripts/rehearse.sh` ran end to end, exit 0, 28 s (logs/rehearse_builder13.log); the `what needs me` line for 2231 reads `Q: Can Ramon Ortiz or the San Antonio dispatcher confirm ...` (step 6 of Job 1). Pre-existing, not changed: the final `sed -n '12,13p' docs/FACTS.md` beat now prints the duplicate_toll and duplicate_invoice rows because FACTS.md gained two cost lines; cosmetic.

Job 2c. `scripts/facts.py` cost block: reads docs/evidence/cost_log_live_record_2026-10-24.jsonl (52 lines) and the decoy log above, never worker/cost_log.jsonl; `worker_cost.perTask.avg` and `.total` carry inputTokens, outputTokens, cacheTokens (cacheCreationTokens plus cacheReadTokens, also kept separately), thinkingTokens, factoryCredits, durationMs. Per task: 1,033 input, 1,354 output, 70,386 cache tokens, 25.6 s; totals 53,739 / 70,433 / 3,660,097 and 2,016,204 Factory credits. Decoy re-record totals 6,529 / 7,036 / 420,407 and 196,074 credits. FACTS.json, FACTS.md, RESULTS.md (new `## Cost` section; the caveat no longer calls the recordings hand-written), web/public/FACTS.json regenerated; README and DEVPOST quote the three numbers. Check: `grep -rn "in tokens\|input tokens" README.md docs/RESULTS.md docs/DEVPOST.md` shows 4 lines, each with input, output and cache. The earlier "1,033 in tokens per task" wording survives only in older status entries above and in docs/evidence/live_report_2026-10-24.md (not in my list; it is a dated report).

Job 3, Task 13. README rewritten with the headings in the brief's order (What it does; Seats it fills; What is real and what is simulated; Where Droid runs; Agent addresses; Elastic; Vendor checks (now also says the vendor 3 fixtures are hand-shaped and badged so on the card, per builder-W's 2fac596); Settlement; SpacetimeDB; Run it; Not built; then Team), Principles, Hold 2231, What is measured and How it works nested under What it does, Environment variables and Repo map under Run it. Lullabuy's opener as "Is the company real? No. It is generated by us, with a published answer key." Where Droid runs pastes `worker/src/droid.ts` lines 106 to 131 verbatim and the listTools ids from docs/evidence/droid_listTools_2026-10-24.txt. Agent addresses: address `agent1qt278cr9luj7xw9cs6c47lnfl9tvx9xsu7asxtmhuqkcqq920m6ju5y5yge`, verified against logs/agent.log (printed 4 times, derived from AGENT_SEED); handle "pending registration"; role "controller seat (Agentverse mailbox registration pending)". Corrected stale README text: hold 2231 and step 4 of How it works called the recordings hand-written and said two recordings exist (52 do, all from the live run); Elastic said "not yet run against a live project" (it was, 13:55 entry, and all 52 recordings contain an MCP tool call); the disclaimer said "sandbox money" (now "no real money: Nessie mock bank"). The honesty block and markers are untouched (`scripts/honesty.py --check`: up to date). docs/DEVPOST.md: image, repo and video placeholders, elevator pitch, the exact track list and do-not-select list (already present), and a Factory paragraph naming createSession, cwd, autonomyLevel Off, disabledToolIds, systemPrompt, mcpServers, permissionHandler, abortSignal, listTools, stream with outputFormat JsonSchema, the four stream events, structuredOutput, tokenUsage and durationMs. context/JUDGE_QA.md: Microsoft five-criteria block and per-sponsor why lines confirmed against the TASKS Need column (unchanged text); cost numbers added to measurable usefulness; D-1 line under the CRS answer; Droid handler wording corrected (subtractive, not "only MCP"); model-down answer mentions the deferred status. context/CLAIMS_AUDIT.md: rows 14 to 16 updated from "not verifiable" to backed with the evidence, rows 19 to 24 added (first appended as 17 to 22, duplicating two existing numbers; renumbered). Hygiene: CI em-dash scan run under bash (zsh does not split the file list; the first attempt scanned nothing and said clean, so beware) found one literal em dash in scripts/honesty.py's own check, now written as `\u2014`; rescan 114 files, 0 hits. `gitleaks detect --redact` (git mode, what CI runs): no leaks; `--no-git` flags only `.env` and `.seed_identity.json`, both gitignored and untracked.

Agent restart. full_run.sh (14:10) and rehearse.sh's demo_up.sh (14:15) each rewrote the agent and controller tokens in .env (last written 14:14:31). The uAgent on 8011 was started at 14:15:36 (builder-W's restart), after the last .env write, so it holds the current tokens; no restart is needed unless the ledger is republished again. I did not restart it.

Claimed but not verified by me: Nessie "verified live" in the Settlement section (builder-17's commit; I kept the text); the Elastic ingest counts (13:55 entry); the dashboard rendering of the new 2231 question (not viewed). Not done: the runbook (not in my list) still quotes the question as "Did Ramon Ortiz drive truck 22 on 2026-08-26 while truck 17 was in the shop?" while the recording asks "Can Ramon Ortiz or the San Antonio dispatcher confirm ..."; same substance, different words; beats 01:00 and 01:10 should quote the recording. worker/README.md's prose still says the handler allows only MCP calls; the code and the root README say subtractive. context/DECISIONS.md is untracked and the README and JUDGE_QA cite D-1 from it; it is the director's file and needs committing. Files touched outside the brief's list, on the director's instruction: worker/test/replay.test.ts (two expectations updated to the new 2231 recording; the old `clear` assertion described the defect) and docs/evidence/cost_log_decoy_rerecord_2026-10-24.jsonl.

Job 4 (director follow-up, 14:30). docs/RUNBOOK.md beats 00:45, 01:00 and 01:10 now quote the recorded 2231 question or say "read it off the card"; the 01:25 answer line contains none of the drafter's negative words (no, not ours, fraud, reject, did not, didn't, never) and none of the standing words, so it still drafts a one-time rule under scripts/controller_sim.py and the worker's rules.ts. worker/README.md: the handler is described as it is (subtractive; Script and ToolSearch kept because Droid 0.249 routes tools through them), the options block is the current BEGIN to END block from droid.ts (`diff` against the source is empty, 26 lines; the root README block is identical too), and the quoted SYSTEM_PROMPT_APPEND matches the code. Em-dash scan 118 files, 0 hits. rehearse.sh not rerun (director holds the ledger).

Tried and rejected this shift: putting the ASI mock inside `classify` (would have broken the three tests that monkeypatch `_chat_completion` and count calls), so the switch sits in `_chat_completion` itself; reading cost from worker/cost_log.jsonl with a time filter (the stray live runs interleave with the re-records by the second), so facts reads only committed evidence files.

## 2026-10-24 14:26 PDT Director: round one review and Task 17 acceptance

Three builders ran as separate terminal sessions on disjoint files (briefs in context/briefs/). Every commit below was reviewed against its acceptance check by the director before acceptance; the checks were rerun, not read.

Accepted:
- builder-13 (8e004e1, ed10bce, 91c9694): all 52 recordings are now `hold_and_ask` with a question (the six decoys re-recorded live, 2231 asks about Ramon Ortiz and PO-1026); full offline cycle precision 1.0, recall 1.0, 6 of 6 decoys with one answer, 0 planted by rule, 13 s; worker 106 tests, agent 115 tests green with and without the key (ASI_MOCK=1 in conftest); no `head` pipe in any script; cost quoted as input, output and cache (1,033 / 1,354 / 70,386 per task from the recorded run); README headings in the judged order; Devpost track list exact; claims audit renumbered. Incident, builder-13's report: the previous builder's live worker was still running when the ledger was advanced for the re-record and made about 25 unplanned live Droid investigations (worker/cost_log.jsonl, excluded from facts); caused by a director message landing late.
- builder-17 (0328507): Nessie refuses the documented body and stores whole numbers only, so transfers send exact integer cents with the unit in the description; nothing rounds; rate cap NESSIE_MAX_PER_SECOND (default 5) tested; 20 settle tests; labels "paid, bank id <id>" and "settlement: offline".
- builder-W (85aba06, de3d124, 548864d, ef3d6eb, 2fac596): record_settlement module test (33 module tests); docs/VIDEO.md to the current product; agent/README.md with the logged address and agent/CONNECT.md; dashboard audit with four screenshots; honesty fixes from that audit (hand-shaped vendor checks badged "hand-shaped fixture, not sandbox data", no endpoint placeholders rendered, trust panel counts vendor checks by provenance, replayed cards no longer show "live droid run"). Builder-W's commits carry no co-author trailer, citing Anudeep's standing rule for his repos; unconfirmed by the director.

Task 17 acceptance, run by the director on the day-44 rehearsal ledger at 14:24 with the worker restarted as `WORKER_MODE=live FACTORY_API_KEY= ANTHROPIC_API_KEY= NESSIE_MAX_PER_SECOND=20 npm start` (settlement live, Droid forced to replay, no paid model calls): `agent.cli "approve 1068"` as controller; `payment.bank_txn_id` = c3dd62f9-ca20-4e3d-9095-c3a7865e7583 after 0.81 s; audit rows `approve_payment / controller` then `settle / agent / bank id c3dd...`; `GET /transfers/<id>` in the sandbox shows amount 28855, status pending, description "txn_ref 1068 payee ... amount $288.55 (amount field in cents)". The offline half of the check was shown by the 21:10Z full run (offline-<ref> ids, 3,640 payments). Pass. Caveat: the sandbox carrier account also holds about 7,244 whole-dollar transfers from the earlier live worker; only transfers after 21:24Z carry exact cents.

Open: builder-13 job 4 (runbook 2231 wording, worker/README handler description) in progress; builder-W job 7 (live dashboard re-check of the new badges, stepping the clock past day 44) in progress; Agentverse Connect click, CRS sandbox invite and the Devpost paste remain on Anudeep.

## 2026-10-24 14:28 PDT Builder-W: live re-check after the worker restart (job 7)

Stepped the ledger from day 44 to day 60 with `scripts/clock.sh step`; vendor_check tasks stayed at 7 because the next planted bank change (vendor 5) lands on day 71, past the cap. Screenshots 05 and 06 and captions in docs/evidence/dashboard/.

| Element | What it shows now | Verdict |
| --- | --- | --- |
| Trust panel provenance line | "Investigations: 0 live, 34 replayed, 0 scripted stand-in. Vendor checks: 0 live, 2 recorded replay, 0 hand-shaped fixture, 5 stand-in" | honest for tasks written by the new code; the 2 "recorded replay" are INV-1077 and INV-1032's twin written before the restart (status `replayed` in stored JSON) |
| "/TODO-" strings on the page | 0 with the default selection and with hold 3884 selected | honest; the old INV-1077 finding still stores "POST /TODO-..." refs and would render them if selected until the ledger is rebuilt or day 71 passes |
| Replayed investigation card (hold 3884, day 49, processed after restart) | first note "recorded droid run (2026-10-24) for 3884", then "replayed from a recording made 2026-10-24 by droid live run"; "live droid run (record)" absent from the page | honest |
| Hand-shaped vendor-check badge and fixture note | not observable: no vendor_check task was created between day 45 and 60 | not observable in this run |
| Settlement labels | audit feed `settle` rows "paid, bank id <uuid>" for live Nessie settlements since the restart (1,343 live bank ids in the ledger); resolved queue rows "settled c3dd62f9..." for 1068 and "settlement: offline" for INV-1077 and 2231 (settled before the restart) | honest |
| Call-back pill, rules board, Simulated carrier line | unchanged from the 14:16 audit | honest |

Checks: SQL counts before and after each step; page text searched with the browser for the strings above; nothing written to the ledger beyond the day steps the director allowed. Not run: full_run.sh, demo_up.sh, rehearse.sh, worker or agent restarts.

Job 8 addendum (day 74): the vendor 5 bank-change invoice is INV-1138 on day 74 (bank change day 71), so the clock was stepped two days past the brief's 72. The restarted worker processed its vendor_check as a stand-in because no fixture exists for vendor 5: the card reads "stand-in, not a vendor check" with three "no result" rows, "recommends escalate, confidence 0%, status no_fixture", no "/TODO-" text on the page, and the trust line counts it ("Vendor checks: 0 live, 2 recorded replay, 0 hand-shaped fixture, 6 stand-in"). Verdict: honest. The hand-shaped badge path itself is covered by the worker tests (vendor 3 fixtures) and was not exercised on the live ledger in this session. The INV-1077 remnant (old finding JSON with "POST /TODO-" refs) is accepted because demo_up.sh rebuilds the ledger before judging. Ledger left paused at day 74.

## 2026-10-24 14:53 PDT Builder-18: investigator agent (Task 18)

Second uAgent `dispatch-investigator`, read-only by database role. Commits 7c7f577 (module), f1eae32 (agents), the docs commit after it, and this one. Log: `logs/builder_18.log`.

| Check | Command | Observed |
| --- | --- | --- |
| Module tests | `cd spacetimedb && npx vitest run` | 64 passed (module.test.ts 37, new describe 8: reader refused by approve_payment, answer_question, approve_rule, reject_payment, claim_task, record_investigation, create_rule; try_approve_payment by the reader returns `[false, "reader may not do this (needs controller)"]` and leaves an audit_event row with actor_role reader) |
| Bindings | `npm run generate` then `git diff --stat module_bindings/` | no diff (role is free text) |
| Agent tests | `agent/.venv/bin/pytest -q agent/tests` | 138 passed (23 new in test_investigator.py: reader identity on the wire, forwarded refusal verbatim, relay forward and timeout, investigator reply never a command, cli prefix) |
| Publish, data kept | `cd spacetimedb && npm run publish:local` | `Updated database with name: dispatch-ledger`; business_day still day 74 paused, audit_event count 12698 before and after |
| Reader identity | `python3 scripts/mint_identities.py` twice | first run `reader: <hex>` and `INVESTIGATOR_SEED: generated (not shown)`; second run `reader: <hex> (reused from .env, role granted again)`; STDB_READER_TOKEN, STDB_READER_IDENTITY, INVESTIGATOR_SEED present in .env (grep -c, 1 each) |
| Terminal twin | `agent/.venv/bin/python -m agent.cli "why 2231"` | `investigator: 2231  location_mismatch  $412.00  day 41  status cleared_by_rule`, Finding, two Evidence lines, Recommendation hold_and_ask (confidence 0.97), Answer on file, `source: replayed` |
| Terminal twin | `agent/.venv/bin/python -m agent.cli "status"` | `investigator: Day 74 of 92 (2026-10-12), clock paused, tick 0.5 s. Today: 94 transactions, 92 auto-paid ($10,855.69), 2 held, 0 rejected.` |
| Reader refusal | `curl .../call/try_approve_payment` with the reader token, `["2231", {"none": []}]` | `[false,"reader may not do this (needs controller)"]` |
| Refusal on the record | `SELECT id, day, actor_role, action, ref, detail FROM audit_event WHERE actor_role = 'reader'` | id 12705 (the curl) and 12706 (`approve 2231` sent to the running investigator agent on 8012): day 74, reader, refused, 2231, `reader may not do this (needs controller)` |
| Round trip | signed ChatMessage envelope to the controller's `/submit` on 8011, forwarded to the investigator, reply relayed | 0.04 to 0.05 s, 4 runs, logged as `investigator round trip 0.05 s` in `logs/agent.log`; investigator log shows `agent1qt278cr9lu: why 2231` |
| Processes | `lsof -iTCP:8011 -iTCP:8012` | investigator pid 29289 on 8012 (`logs/investigator.log`), controller restarted on 8011 (`logs/agent.log`), controller address unchanged `agent1qt278...y5yge`; investigator address `agent1qvwvlc0vz2amjh4q4yf0p2fglqrzw2rmfm6afrsq82e8lq5df7yyxnrxaqh` (printed by the agent, now in both agent tables) |

Path in use: local. Both agents are mailbox agents, but on the demo laptop they resolve each other to `http://127.0.0.1:<port>/submit` through a local-first resolver (`agent/peers.py`); every other destination (ASI:One users) goes through the normal global resolver. `AGENT_PEER_PATH=mailbox` forces the Agentverse path. The mailbox path could not be measured: the investigator's mailbox does not exist until Anudeep clicks Connect for it, so a message routed through Agentverse has nowhere to land. The 8 s fallback (`investigator did not answer in time; from the ledger directly:`) is covered by the mock tests, not seen live.

Honesty notes. TASKS.md calls the dashboard's audit panel `audit_feed`; there is no view of that name in the module, the panel subscribes to the public `audit_event` table, and that is where the reader's refusal row appears. Runbook beat 01:00 is `what needs me`, which the controller answers itself, so no `investigator:` prefix was written into that row (the brief asked for one on 01:00 and 01:10); 01:10 carries it. The runbook's 00:00 and 00:45 Terminal B fallbacks (`agent.cli "status"` and `"why 2231"`) now print with the `investigator:` prefix too; those rows were outside this brief and still read correctly. `mint_identities.py` was run twice, so the agent and controller identities were minted twice; the earlier identities keep their roles and the running worker (started before) is unaffected.

Waits on Anudeep's clicks: Inspector Connect, Mailbox, Finish for `dispatch-investigator` (link in `logs/investigator.log`), profile README from `agent/INVESTIGATOR_README.md`, tags innovationlab and hackathon; then the two-line ASI:One check in `agent/CONNECT.md` (`why 2231` to the controller starts `investigator:`; `approve 2231` to the investigator is `investigator: refused by the ledger: reader may not do this (needs controller)`). README tables still say "pending registration" in the Handle column until then.

## Tried and rejected

| What | Why rejected |
| --- | --- |
| Private `agent_task` table with the worker subscribing | Clients cannot subscribe to private tables in 2.13; made operational tables public and kept company data private |
| `spacetime login` with GitHub for the local demo | Needs a browser and ties the publisher to a cloud identity; the demo mints a local identity with `POST /v1/identity` and logs the CLI in with that token |
| Worker-side backtest scored against the answer key | Agent code must never read the key; the module backtests against confirmed controller decisions instead |
| A pause button in the dashboard | Vite inlines env vars into the bundle, which would ship the controller token; pause is a terminal or ASI:One command |
