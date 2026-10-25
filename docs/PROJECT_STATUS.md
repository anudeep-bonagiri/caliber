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

2026-10-24 16:10 PDT, mention fix (director defect from the live ASI:One acceptance). ASI:One prepends the mention to every message it delivers, so the controller saw `@caliber-controller why 2231` and `@agent1q... what needs me`; the regex fast paths missed, `why 2231` went down the free-text path (asi1-mini) and was answered locally, without the relay and without the `investigator:` prefix (no forwarding line in `logs/agent.log`, nothing inbound in `logs/investigator.log`). Fix: `intents.strip_mentions` drops leading `@<handle>` or `@agent1q...` mentions (one or more, each followed by whitespace or the end of the line) and is applied at every front door before parsing: `handlers.handle`, `investigate.handle`, `cli.answer`, and both uAgents' `on_chat` (the log line now shows the raw text and the stripped command after `->`). A mention inside a sentence is left alone. Check: `agent/.venv/bin/pytest -q agent/tests` 179 passed (`agent/tests/test_mentions.py` adds 30: the strip, the fast paths hitting, the relay route on the stripped line, both handlers, the CLI, and the defect itself asserted on the raw line). Both agents restarted once with their usual command lines, addresses unchanged; the commit hash is in `logs/builder_18.log`.

## 2026-10-24 14:57 PDT Director: Task 18 accepted

- Reran by the director after builder-18's ALL DONE: `agent.cli "why 2231"` and `"status"` answer with the `investigator:` prefix from the reader identity; `try_approve_payment` with the reader token returns `[false, "reader may not do this (needs controller)"]` and leaves `audit_event` row 12707 `refused / reader / 2231`; agent tests 138, module tests 64; the module diff is the single `reader` entry in `grant_role`; no agent or controller token is referenced on the investigator path (test asserts it); both agent tables carry both addresses with byte-exact badges; no em dash in the touched files.
- Acceptance wording: TASKS.md says `audit_feed`; the module exposes the public `audit_event` table, which is what the dashboard's Ledger of trust reads, so the refusal shows there. Acceptable.
- Waits on Anudeep: Connect, Mailbox, Finish for `dispatch-investigator` (Inspector link in logs/investigator.log), profile paste of agent/INVESTIGATOR_README.md with both tags, then the two-line ASI:One check in agent/CONNECT.md; the mailbox round trip is measured after that (local path is 0.04 to 0.05 s).
- Side effect: `mint_identities.py` ran twice during step 7, so .env now holds new agent and controller tokens while the running worker still uses the earlier agent identity (its role is intact). The next `demo_up.sh` or `full_run.sh` re-mints everything, so nothing to fix.

## 2026-10-24 15:12 PDT Builder-W: cold-start repeat at HEAD 2c2b864, network on (job 9)

Fresh `git clone` of the repo at 2c2b864 into /private/tmp (nothing copied in), run on this laptop with Wi-Fi on. The Wi-Fi-off repeat stays on the night-before checklist; nothing in this run made a network call except `npm ci` and `pip install`.

| Step | Observed |
| --- | --- |
| `scripts/check_env.sh` in the clone | `.env missing at <clone>/.env`, exit 1 (expected) |
| `scripts/demo_up.sh --no-web`, first attempt | exit 1 after 5 s at step 5/7 fixtures: `ERR_MODULE_NOT_FOUND: Cannot find package 'spacetimedb' imported from module_bindings/index.ts`. The bindings resolve `spacetimedb` from the repo root `node_modules`, which only the README's "Tests first" line (`npm ci` at the root) installs. demo_up installs `spacetimedb/`, `scripts/` and `worker/` deps but not the root. The 403 branch also fired (the server held the real checkout's database) and restarted the server on the clone's data dir, as designed. |
| root `npm ci`, then `scripts/demo_up.sh --no-web` from a wiped clone server | exit 0, 6 s wall (server start, publish, identities incl. a reader token and a generated INVESTIGATOR_SEED, 155,457 pings and the rest of the fixtures, worker `loop started`) |
| `scripts/full_run.sh` | exit 0, 13 s wall; 92 days in 1 s; open tasks after wait 0; `Overall precision 1.0, recall 1.0` |
| `diff docs/FACTS.json` clone vs committed | at 13 s: identical except `asOf` and the settlement counters (`offlineIds 3529, unsettled 4366` vs committed `7895, 0`). The worker was still writing offline ids; after about 30 s `unsettled` reached 0 and a rerun of `facts.py` produced a file identical to the committed one except `asOf`. full_run computes facts before settlement has drained; the committed file was made after the drain. |
| README "Tests first" block, literally | module 64 passed, worker 106 passed, seed 24 passed, agent 138 passed, elastic 27 passed and 1 failed: `test_smoke_window_from_fixture_and_fallback` expected the old 45-minute window (12:27 to 13:57); `smoke.py` has used ten minutes since commit 5626c72 (mine) and the test was not updated then. Same failure in the real checkout, so it is a stale assertion, not a cold-start gap. Fixed in this commit (13:02 to 13:22); elastic suite now 28 passed. 28 s wall for the whole block. |
| Task 18 twin check in the clone | `agent/.venv/bin/python -m agent.cli "why 2231"` after the clone's `mint_identities.py` wrote a reader token: `investigator: 2231  location_mismatch  $412.00  day 41  status cleared_by_rule`, Finding, two Evidence lines, `Recommendation: hold_and_ask (confidence 0.97)`, `source: replayed`. `status` also carries the `investigator:` prefix. Pass. |
| `scripts/rehearse.sh` in the clone | exit 0, 29 s wall; paused on day 41 and on day 44 on command; `Needs you (23)` with the 2231 line; `why 2231` as above with `status awaiting_controller`; answer, `approve rule 1`, `hold 2231 now: cleared_by_rule`; as_agent `[false,"agent may not do this (needs controller)"]`; INV-1077 refused without a note then approved with the call-back note; kernel verdict `capacity_exceeded` for truck 29. |
| Teardown | clone server, worker and agents stopped; clone deleted. Real checkout: `scripts/demo_up.sh` (with web) exit 0, 6 s, server on the real `.spacetime/data`, reader identity reused and granted again, dashboard on 5173 (the stale vite from the morning was stopped first so the port was free); investigator started on 8012 then controller on 8011, addresses unchanged (`agent1qvwvlc...nrxaqh`, `agent1qt278...y5yge`), logs/investigator.log and logs/agent.log; `clock.sh status` day 0 paused; `agent.cli "status"` = `investigator: Day 0 of 92 (2026-07-01), clock paused, tick 2 s. Nothing settled today yet.`; `agent.cli "why 2231"` = `investigator: No hold for 2231.` Left paused at day 0. |

The target, line by line, against the clone's ledger after full_run:

| Target line | Result | Observed |
| --- | --- | --- |
| 92 days under 4 minutes, pausable on any day | pass | 92 days in 1 s inside full_run; rehearse paused on day 41 and day 44 |
| 52 planted raised, recall 1.0, precision at or above 0.95 from `facts.py`; duplicates auto-rejected without a task | pass | precision 1.0, recall 1.0 on all seven codes; audit `seed auto_reject` 11 (the duplicate tolls) with no task; the 4 duplicate invoices are holds rejected by the controller |
| Every exception has a finding, labelled live or replayed | pass | 47 investigate tasks for the 47 non-limit holds (the 6 `limit` holds are approval holds, not planted exceptions), every one with a finding, `source replayed`, `recordedBy droid live run`; 0 live (no keys in the clone) |
| From a fresh ASI:One conversation: list, why, answer, approve rule, approve payment, each an `audit_event` row with the controller identity | pass through the terminal twin and controller_sim, ASI:One itself not run | audit rows by controller: answer_question 6, approve_rule 6, approve_payment 9, reject_payment 38; the ASI:One conversation waits on the Agentverse Connect click (Anudeep) |
| `approve_payment` with the agent token refused, refusal in the audit trail | pass | audit `('agent','refused') 1`: `INV-1077  agent may not do this (needs controller)` |
| 6 decoys clear after exactly one answer each through an approved backtested rule; no planted exception cleared by a rule | pass | cleared_by_rule set equals the six decoy refs; one `answer_question` row per decoy; six one_time rules with backtest `{"n":1,"wouldClear":1,"openHoldsCovered":1,"confirmedExceptionsCovered":0,...}`; planted cleared by rule 0 (FACTS.md) |
| Every `vendor_bank_change` hold carries a CRS vendor check as evidence rows, labelled; one planted vendor has a hit and is rejected, one is clean and approved with a call-back note | fail (partial) | three vendor_bank_change holds. INV-1077 carries the three rows `crs:business_credit`, `crs:public_records`, `crs:ofac` labelled `hand_shaped` ("Shape of a sandbox response, not real data"). INV-1032 and INV-1138 have a vendor_check task with status `no_fixture` and no evidence rows. No hold has a hit; all three were approved with a call-back note by controller_sim. The hit fixture `3.hit.json` is never selected in the run. Known since Task 16 (CRS sandbox pending); recorded here as the literal result. |
| Every approved payment has a Nessie id on its `payment` row and in the audit feed; offline writes a labelled fake id | pass (after the 30 s drain) | 7,895 payments, 7,895 `offline-<txnRef>` ids, 0 unsettled; 7,895 `agent settle` audit rows such as `bank id offline-1000` |
| README sections and `docs/not-built.md` | pass | all six headings present once each; both Fetch badges in agent/README.md; docs/not-built.md exists |
| Devpost draft with every 13.4 track and none of the dropped ones | pass (draft) | docs/DEVPOST.md "Tracks to tag" and "Do not select" lists match 13.4 word for word; the Devpost page itself is Anudeep's paste |

README "Run it" gaps found:

1. `scripts/demo_up.sh` alone on a fresh clone fails at the fixtures step until `npm ci` has run at the repo root. The README orders the test block first, so following it literally works, but "Run it" should say the root install is required, or demo_up should run it (one line, `[ -d node_modules ] || npm ci --silent` at the root). Not changed here; director's call.
2. `demo_up.sh` prints `agent/.venv/bin/python -m agent.cli ...` in its Ready block but never creates `agent/.venv`; only the README test block does. Same fix shape as above.
3. README.md creates the agent venv with `python3 -m venv`; agent/README.md says `uv venv`. Both work; one should be chosen.
4. `scripts/full_run.sh` runs `facts.py` before the worker has finished settling (about 30 s for 7,895 payments), so the settlement line of a freshly produced FACTS.json differs from the committed one until `facts.py` is rerun. A wait on `payment` rows with no `bank_txn_id`, like the existing wait on open tasks, would make the one-command number stable.
5. The elastic test was red on a clean clone (fixed in this commit, see above).

Checks: elastic suite 28 passed after the fix; `git status` clean apart from this entry and the test; no key printed anywhere in this entry or in logs/builder_w.log (identities only, which are public addresses).

## 2026-10-24 15:22 PDT Builder-W: cold-start gaps closed (job 10)

Changes, one per gap found in job 9:

- `scripts/demo_up.sh`: before step 5, installs the root dependencies when `node_modules` is missing (`npm ci --silent` with a lockfile, `npm install --silent` without) with a step line that says it needs the network the first time; before the Ready block, creates `agent/.venv` (`python3 -m venv` plus `pip install -q -r agent/requirements.txt`) when it is missing, with a step line and the warning "this step needs the network the first time; run demo_up.sh once before Wi-Fi goes off".
- `scripts/full_run.sh`: new step "waiting for settlement" after the controller pass, polling `SELECT txn_ref, bank_txn_id FROM payment` once a second for up to 90 s until no row lacks a bank id, printing the count every 10 s; `facts.py` and `honesty.py` run only after it.
- `README.md` "Run it": one sentence that the root `npm ci` is the first step and that demo_up performs it and creates `agent/.venv` when missing (network the first time). `agent/README.md`: the venv line is now `python3 -m venv` from the repo root, same as README.md. Nothing else in either README changed; `honesty.py` reports no change.

Verification on a fresh clone in /private/tmp (33a4c82 plus these edits):

| Step | Observed |
| --- | --- |
| `scripts/demo_up.sh --no-web` straight after `git clone`, no manual step | exit 0, 19 s wall (includes the root install and the agent venv; the 403 branch fired and moved the server to the clone's data dir as designed). Lines seen: `root dependencies missing; installing (needs the network the first time)`, `==> agent venv (agent/.venv missing)`, the warning, `Ready. The clock is paused on day 0.` |
| `scripts/full_run.sh` | exit 0, 24 s wall; `unsettled payments: 831` at the 10 s mark, `unsettled payments after wait: 0`, facts at 24 s; `Settlement: 0 payments carry a live Nessie transfer id, 7895 a labelled offline id, 0 unsettled` |
| `diff docs/FACTS.json` clone vs committed | identical except `asOf` |
| twin check | `agent/.venv/bin/python -m agent.cli "why 2231"` from the venv demo_up created: `investigator: 2231  location_mismatch  $412.00  day 41  status cleared_by_rule` |
| teardown and restore | clone processes stopped and clone deleted; real checkout `scripts/demo_up.sh` (with web) exit 0, 5 s, no install steps fired (deps present); investigator on 8012 then controller on 8011, addresses unchanged; dashboard on 5173; `clock.sh status` day 0 paused; `agent.cli "status"` = `investigator: Day 0 of 92 (2026-07-01), clock paused, tick 2 s. Nothing settled today yet.`; `agent.cli "why 2231"` = `investigator: No hold for 2231.` |

Not touched: vendor-check fixtures, answer key, thresholds. The Wi-Fi-off repeat stays on the night-before checklist; it must follow one demo_up with the network on so the installs are already there.

## 2026-10-24 15:32 PDT Builder-W: the hit-to-rejection beat runs offline, labelled FIXTURE (job 11, D-3)

Commits a302f06, d93fb06, 69ccdbb, 0999eee, a5e18f8 and the two below, each with the D-4 trailer.

What changed:

- Fixtures (`seed/fixtures/vendor_checks/`): `1.json` clean, `1.bank_change.json` with one public-records judgment (Example County Civil Court, $23,750.00, filed 2026-07-20, between vendor 1's first invoice on day 9 and its bank change on day 18), `3.json` clean, `5.json` clean; `3.hit.json` deleted. Every file: `note: "hand-authored in the shape of a sandbox response; CRS sandbox pending"`, `recorded: false`, no `recordedAt`. Every name, court and number is invented and says so.
- `worker/src/crs.ts`: `vendorFixtureFile(dir, vendorId, trigger)` prefers `<id>.<trigger>.json` over `<id>.json` and picks up nothing else (the old "first `<id>.*.json` on disk" fallback is gone, so a stray hit file can never serve a first-invoice check). `CRS_FIXTURE_VARIANT` removed: the trigger does the selection and there is no hit variant any more.
- `worker/src/vendor_check.ts`: source enum widened with `fixture:hand-authored (CRS sandbox pending)`; a hand-authored file produces evidence rows with that source and the CRS call name as the ref (`business credit`, `public records`, `OFAC screen`), finding status `fixture` (replaces `hand_shaped`), model `hand-authored fixture`, finding text prefixed "Hand-authored fixture (CRS sandbox pending), not sandbox data.", step notes `fixture:hand-authored (CRS sandbox pending) business credit: 1 hit(s)` and `fixture vendor_checks/1.bank_change.json`. A recorded response (`recorded: true`) keeps crs:* sources, `replayed from <file>` refs and status `replayed`; the stand-in path is unchanged.
- `scripts/controller_sim.py`: a bank-change hold is decided from its `vendor_check` task row only: hit (recommendation reject or escalate with evidence rows and reasons) means `try_reject_payment` with "Vendor check hit: <reasons from the finding>. Bank-detail change not accepted; invoice rejected pending resolution with the vendor."; clean means approve with the call-back note as before; a check still open or claimed defers the hold to the next round; a stand-in (no evidence rows) is not a hit. It reads `hold`, `match_result` and `agent_task` rows and the swap log; it never opens the answer key (grep: the only mention is the docstring saying so).
- Generator (`seed/maintenance.py`): `HIT_VENDOR = 1`; the key row for that vendor's bank-change invoice gets `expected: "reject"` and a note naming the judgment. Regenerated with `--seed 42` twice: `git diff --stat seed/fixtures` showed only `answer_key.json` (4 lines) and the vendor_checks files; the key's md5 was identical across the two runs. `pytest seed`: 25 passed (new `test_bank_change_hit_vendor` checks the key row, the fixture story dates and that `3.hit.json` is gone).
- `scripts/facts.py`: `expected: reject` counts as planted; new `vendorChecks` block (bank-change holds, hit rejected, clean approved with call-back, source per check, matches key, one row per hold) in FACTS.json, a line in FACTS.md and a table in RESULTS.md.
- Dashboard: `vendorBadgeFor` renders status `fixture` as `FIXTURE` (amber, hover "hand-authored fixture; CRS sandbox pending; no CRS call produced these values"), a recorded response as `REPLAYED (recorded live)`, live and stand-in unchanged; evidence rows match by crs:* source or by the call name in the ref, and show the fixture source in amber; the trust line says "fixture". `npm run build` green.
- Docs: `docs/not-built.md`, `context/CLAIMS_AUDIT.md` row 25 ("fixture, labelled"), README "Vendor checks" (the two paragraphs that described `3.hit.json`, `CRS_FIXTURE_VARIANT` and the "hand-shaped" badge were false after this change, so both were rewritten; the rest of the README is untouched apart from the Caliber title below), `docs/RUNBOOK.md` beats 02:45 and 03:10 say "hand-authored fixture, sandbox pending" out loud and never "live"; section 3 gains step 0 (demo_up with the network on, Wi-Fi off, demo_up again); new section 3b "Sunday 7:00 AM".
- Caliber (director addition): README title line `# Caliber` with the first sentence "Caliber, an autonomous accounts-payable clerk for a trucking carrier (repo and ledger name: dispatch-ledger)"; runbook beats 00:00 and 04:45 say Caliber. No other prose mention existed in these two files; identifiers unchanged.

Run (`scripts/full_run.sh`, 25 s, exit 0):

| Check | Observed |
| --- | --- |
| facts | `Overall precision 1.0, recall 1.0`; `Decoys cleared through an approved rule: 6 of 6 (6 with exactly one controller answer)`; `Planted exceptions cleared by a rule: 0`; `Vendor checks: 3 bank-change holds; 1 with a hit rejected by the controller, 2 clean approved with a call-back note; check source {'fixture': 3}; outcomes match the key: True` |
| INV-1032 | hold `rejected`; audit row `controller reject_payment INV-1032` with detail `Vendor check hit: a judgment (Example County Civil Court, $23,750.00, filed 2026-07-20, open). Bank-detail change not accepted; invoice rejected pending resolution with the vendor.` |
| INV-1077, INV-1138 | hold `released`, callback_note "Called Gulf Coast Diesel ..." and "Called Border Fleet Repair ..."; audit `controller approve_payment` with the note |
| vendor_check tasks | all 8 recorded; the 6 with a fixture (vendors 1, 3, 5 on first invoice and bank change) carry exactly 3 evidence rows each with source `fixture:hand-authored (CRS sandbox pending)` and refs `business credit`, `public records`, `OFAC screen`; vendors 2 and 4 (first invoice) are stand-ins with 0 rows; zero "/TODO-" strings in any finding or steps json |
| controller_sim | `{"answered": 6, "rejected": 39, "released": 8, "rules_approved": 6, "refused": 0}` (38 rejections before plus INV-1032; 8 releases: 6 limit holds plus the two clean bank changes) |
| dashboard (Playwright, read-only, three clicks) | INV-1032, INV-1077 and INV-1138 cards each show the `FIXTURE` chip with the hover text above, three fixture-sourced rows, no `REPLAYED` in the vendor-check block; zero `REPLAYED (recorded live)` chips on the page; no "/TODO-"; trust line "Vendor checks: 0 live, 0 recorded replay, 6 fixture, 2 stand-in"; page title already "Caliber" (builder-C) |
| worker | typecheck clean; 107 tests passed (22 in vendor_check.test.ts) |
| web | typecheck clean; `vite build` green |
| honesty.py | "no change" |
| em dashes | none in any tracked md, ts, tsx, py, sh or json file |
| screenshot | `docs/evidence/dashboard/08-fixture-card-INV-1032-rejected.png` with its caption |

Notes for the director:

- Status enum choice: `fixture` (not `hand_shaped`). The chip, the trust line and the source string all say fixture, so one word everywhere.
- `CRS_FIXTURE_VARIANT` removed rather than kept; its only use was the deleted `3.hit.json`.
- When the sandbox invite lands, `WORKER_MODE=record` writes `<id>.json` (recorded: true). For vendor 1 the hand-authored `1.bank_change.json` still wins on the bank-change trigger until it is deleted or replaced by a recorded file of that name; D-3 says the fixture is replaced at that moment, so this is one manual step to remember, written here.
- `docs/DEVPOST.md` not touched. Its line 35 "Vendor check and settle were built this afternoon; sandbox and mock bank" stays true; if the CRS paragraph in the Devpost text claims a sandbox hit, it should read "the hit is a hand-authored fixture labelled FIXTURE; sandbox call pending".

## 2026-10-24 15:40 PDT Director: D-3 fixture, Caliber rename and Devpost accepted

- Reran after builder-W's job 11 and builder-C's rename: docs/FACTS.json `vendorChecks` shows 3 bank-change holds, 1 hit rejected by the controller, 2 clean approved with a call-back note, source fixture for all 3, `matchesKey: true`; overall precision 1.0, recall 1.0, 58 true positives; the answer key differs from this morning only in INV-1032 (`expected: reject`); every vendor-check fixture is marked hand-authored with the sandbox-pending note; `FIXTURE_SOURCE` in worker/src/vendor_check.ts is the exact string Anudeep set; worker 107 and seed 25 tests green; checkout at day 0 paused with worker, dashboard and both agents up, and the agents already answer as Caliber.
- Devpost (docs/DEVPOST.md) corrected by the director: the Capital One track loses its "only if Task 17 is green" qualifier (Task 17 passed at 14:24), and the end-to-end line now says the vendor check runs on hand-authored fixtures labelled FIXTURE with the CRS sandbox call pending, and that settlement is live into the Nessie mock bank. Anudeep re-pastes those two lines only.
- Open: CRS invite (the one manual step when it lands is to replace seed/fixtures/vendor_checks/1.bank_change.json with the recorded response); Agentverse Connect for both agents, then the ASI:One acceptance run by the director; 9 PM decision on keeping CRS selected if no live call by then.

## 2026-10-24 15:52 PDT Builder-W: Task 21, the inbox file connector (job 12)

Commits f874476 (module), 42b9a45 (generator), be9ec78 (scripts), be9d107 (web and docs), 0e3e6e0 (runbook measurement and this entry): module (ingest_rows, ingest_log, matchDay split into matchCardRow, matchTollRow, matchInvoiceRow, 7 module tests, bindings regenerated), generator (connector samples), scripts (watcher, --inbox, --skip-transactions), web and docs (top bar, CONNECTORS.md, runbook), plus this entry. Every commit carries the D-4 trailer. Label everywhere: "file connector; API connectors not built".

What was built:

- `spacetimedb/src/index.ts`: reducer `ingest_rows(fileName, kind, batchJson)` for the seed role. Inserts card, toll or invoice rows like the seed reducers (existing ids are skipped and counted, nothing is overwritten), resolves the truck from the card number or the plate (a file never names a truck), refuses the whole batch on an unknown card, plate or vendor, a day outside 1 to 92, a non-integer amount or malformed JSON, then matches every inserted row dated on or before the current day through `matchCardRow`, `matchTollRow`, `matchInvoiceRow`, which are now the only three functions that turn a row into a match_result, payment or hold; `advance_day` calls the same three per day. Rows dated later wait in their table for the clock. One public `ingest_log` row per batch {id, at, fileName, kind, rows, skipped, matched, actor} and one `ingest` audit row. No new money path: G3 holds, auto-pay limits and duplicate auto-rejects apply unchanged (module tests 9.x: a dropped batch on day 41 raises the El Paso hold and pays the pump row; a re-drop skips both; a day-44 row waits until the clock reaches 44; a day-40 row is matched at once against day 40; unknown card, plate, vendor, kind, bad JSON, day 93 and a fractional amount are refused with nothing written; a second toll three minutes after the first is auto-rejected and an invoice gets its first-invoice vendor check). Module suite 71 passed. `module_bindings/` regenerated (ingest_log_table.ts, ingest_rows_reducer.ts); worker suite 107 passed on the new bindings; web typecheck and build green.
- `seed/connectors.py` (new) called from `generate.py`: writes `seed/fixtures/inbox/fuel_card_wex_sample.csv` (5,607 rows), `toll_statement_sample.csv` (2,157) and `maintenance_invoices_sample.csv` (180) in the layouts of `docs/CONNECTORS.md`: dollars with exactly two decimals, business dates, no truck and no day column. `pytest seed` 27 passed, including a round-trip of every row against the JSON fixtures and the byte-identical-twice check, which now covers the three files. `git diff --stat seed/fixtures` after regeneration: only the three new files.
- `scripts/ingest_watch.py` (new, stdlib only): polls `inbox/` every 0.5 s, treats a file as complete when its size is unchanged between polls, parses with `csv` and `Decimal`, derives the day from the posting date (weekdays from 2026-07-01), sends batches of 500 to `ingest_rows` with the seed token from .env (never printed), moves the file to `inbox/done/<timestamp>-<name>` or `inbox/failed/` with the reason logged, and prints one line per file with rows, skipped, matched now and waiting. `/inbox/` is gitignored (root only; the first pattern `inbox/` also hid `seed/fixtures/inbox` and was corrected before the commit landed).
- `scripts/load_fixtures.ts --skip-transactions`; `scripts/demo_up.sh --inbox` (company data only, starts the watcher with `logs/ingest.log`, prints the three `cp` lines); `scripts/full_run.sh --inbox` (same, then drops the three samples and waits for `ingest_log` to show 3 files and 7,944 rows before the 92 days). Both scripts now parse their options in a loop (`--no-web --inbox`, `--keep-worker --inbox`).
- `web/src/components/TopBar.tsx`: "N files ingested today, M rows" from `ingest_log` (distinct file_name, sum of rows) with the hover `ingest_log <ids>`, next to the chip "file connector; API connectors not built". Nothing else in web changed.
- `docs/CONNECTORS.md` (new): the three layouts, column to module field, units, what is rejected and where. `docs/RUNBOOK.md`: beat "00:15 alt" (the drop at day 41, measured) and the B1 row with the drop command pre-typed.

Acceptance run:

| Step | Observed |
| --- | --- |
| 1. seeded `scripts/full_run.sh` | exit 0, 25 s; precision 1.0, recall 1.0; Vendor checks line as in job 11 |
| 2. `scripts/full_run.sh --inbox` | exit 0, 28 s; `ingest_log: 3 files, 7944 rows`; watcher: fuel 5,607 rows in 12 batches 0.25 s, invoices 180 rows 1 batch 0.03 s, tolls 2,157 rows 5 batches 0.11 s, all "0 matched now, waiting for their day" (dropped at day 0); then the same 92 days |
| diff of the two FACTS.json (same facts.py, builder-22's working copy) | identical except `asOf` |
| 3. demo beat | `scripts/demo_up.sh --inbox` 4 s (fixtures line: `invoice, card_txn, toll_txn: skipped (--skip-transactions ...)`), `run_days.ts --until 41` 0.2 s, 0 holds before the drop; `cp` of the fuel file to `inbox/`: hold 2231 (`location_mismatch`, day 41) in the `hold` table 0.99 s after the copy (the hold row, not the screen: with the full 5,607-row file the page catches up after about 20 s under the burst, so the demo drops the day-41 export, 61 rows, which renders within about a second; see the job 13 entry); watcher line `5607 rows in 12 batches, 0 skipped, 2434 matched now, 3173 waiting for their day; 0.31 s`; 12 holds after the drop (10 location_mismatch, 2 capacity_exceeded, the card holds through day 41) |
| dashboard (Playwright read) | top bar pill `1 files ingested today, 5,607 rows` with hover `ingest_log 1, 2, ... 12: 1 distinct file_name, sum of rows`; chip `file connector; API connectors not built` with its hover; `Day 41 of 92`; 2231 under LOCATION MISMATCH; no "/TODO-" |
| 4. restore | below |

Lines for builder-23's files (README.md, docs/not-built.md, context/JUDGE_QA.md), for the director to apply:

- README, a new short section "Connectors" or a line under "What is real and what is simulated": "One connector exists, a file connector: `scripts/ingest_watch.py` watches `inbox/` for a WEX-style fuel-card CSV, a toll statement CSV and a maintenance invoice CSV (layouts in `docs/CONNECTORS.md`) and hands the rows to the `ingest_rows` reducer, which matches them through the same path the clock uses. The three sample files in `seed/fixtures/inbox/` carry the full seeded dataset, so `scripts/full_run.sh --inbox` reproduces the seeded facts apart from timestamps. API connectors are not built."
- README "Run it", after the demo month block: "Or start with data arriving: `scripts/demo_up.sh --inbox`, then `cp seed/fixtures/inbox/fuel_card_wex_sample.csv inbox/`; hold 2231 appears about one second after the copy once the clock is on day 41."
- docs/not-built.md, replace the first bullet's wording: "Real connectors. One file connector exists (`scripts/ingest_watch.py`, three CSV layouts in `docs/CONNECTORS.md`); there is no WEX, toll-authority, telematics or accounting API integration. Every row comes from `seed/generate.py` with seed 42 and a published answer key, whether it is loaded as a fixture or dropped as a file."
- JUDGE_QA, one Q: "Where does the data come from? A file connector: CSV exports dropped in a folder, parsed by a 60-line watcher and handed to one reducer that matches them exactly as the clock does. API connectors are not built; the label on the dashboard says so."

Restore: `scripts/demo_up.sh` (seeded, with web) exit 0; investigator on 8012 then controller on 8011, addresses unchanged; day 0 paused; `agent.cli "status"` = `investigator: Day 0 of 92 (2026-07-01), clock paused, tick 2 s. Nothing settled today yet.` The generated `docs/FACTS.*` and `web/public/FACTS.json` my runs rewrote were restored to HEAD (builder-22 owns their committed values). The `inbox/` folder was removed after the beat.

## 2026-10-24 16:10 PDT Director: ASI:One acceptance for Tasks 10 and 18, run live

Run by the director in Anudeep's browser from fresh conversations opened with Agentverse "Chat with Agent", against the day-41 inbox staging (fuel file only), both agents connected on Agentverse (Active, ASI Available, Mailbox).

Task 10, every line passes:
- `what needs me` listed 12 holds with 2231 first and its recorded question; reply about 4 s after send.
- `why 2231` showed the finding, the find_trips_near quote, the swap-log quote, recommendation hold_and_ask, the question, source replayed.
- `answer 2231 Yes. Ortiz drove unit 22 ...` wrote audit_event 4903; the worker drafted rule 1 (driver 23, days 41 to 46, one_time, "would have cleared 1 of 1 past rows; 0 were true exceptions").
- `approve rule 1` wrote event 4907; the rule cleared 2231 at once (event 4908 cleared_by_rule, payment released by rule, settled offline-2231). `approve 2231` was then refused "hold is cleared_by_rule", the correct answer; `approve 1068` wrote approve_payment event 4911.
- Agent replies took 2 to 5 s each; the exchange was 91 s wall clock with the director's scripted 8 to 10 s waits between lines, so the human exchange is under 60 s.

Task 18, failed on the first pass, fixed, passes on the second:
- Defect: ASI:One prepends the mention ("@caliber-controller ...") to every message, so the regex intents missed, `why 2231` went down the free-text path and was answered by the controller itself without the investigator relay, and `approve 2231` sent to the investigator answered "I answer why and status" instead of the ledger's refusal. Fixed by builder-18 (5cb6c77: strip leading mentions at every front door, 30 tests).
- Second pass: `why 2231` in the controller chat came back "investigator: 2231 location_mismatch ..." with the finding and both evidence quotes (relayed; logs show the forward and a 0.04 s round trip); `approve 2231` in the investigator chat came back "investigator: refused by the ledger: reader may not do this (needs controller)", and audit_event 5087 is `refused / reader / 2231`.
- Both agents are listed on Agentverse under their caliber names with both tags; the README table carries both addresses.

Remaining on the Fetch.ai row: the Cal Hacks submission-agent registration (Anudeep), and a measured mailbox round trip between the two agents (AGENT_PEER_PATH=mailbox) for the record; the local path is what runs.

## 2026-10-24 17:25 PDT Director: round two accepted (Tasks 21, 22, 25, 26, 27), what waits on Anudeep

Reviewed and accepted, with the checks rerun by the director where they could be:
- Task 21 inbox connector (builder-W, 8 commits): one match path for the clock and the connector; inbox run reproduces the seeded facts except asOf; day-41 export sample added after the full-file drop was measured to stall the page about 20 s (hold row within 1 s, page about 2 s with the 61-row file); 71 module and 107 worker tests.
- Task 22 model-only baseline (builder-22, d1a6f3e): Claude Sonnet 5.5 ties the kernel on every code and overall (1.00 / 1.00, 58 of 58, 0 false holds, $6.38 for 558 rows); asi1-mini 0.31 / 0.81 code-exact, 101 clean rows held; one prompt condition, hinted (codes and thresholds named). README line applied inside a new "Measurement" section; Devpost lines filled. The FACTS baseline block emits on the next facts.py run, which the director runs against the final full run, not the staged ledger.
- Task 25 cards (builder-25, 89f0782): 11 cards, every Where grep hit at the stated line, every number quoted from FACTS.md.
- Task 26 Elastic (builder-26, 5 commits): tools rebuilt to Jd's answers, two JINA semantic tools called live (INV-1003 re-recorded), the stale-holds Workflow with two Success executions and six escalation documents, status reply with the escalation count (63 s measured from trigger to chat, target 30 s not met), smoke 5 of 5 rerun by the director; the scoped key waits on Anudeep (docs/evidence/elastic/scoped_key_request.md).
- Task 27 technical note (builder-27, 6 commits): docs/paper/caliber.pdf, 4 pages, one-command build, 187-row number-to-source map; CarrierBench audit 58 of 58 inferable; oracle ceiling posts the same 7,886 payments with 0 wrong postings, the only gap being six questions on the decoys; saboteur finding produces 0 payments and 2 refusal rows.
- Stale figure corrected: README, JUDGE_QA and DEVPOST said 9 controller releases and $37,547; FACTS says 8 and $32,097.00.

Waiting on Anudeep: the record cue for the two real takes (staged at day 41, fallback clip done); devpost.com site permission for the Chrome extension or a self-paste of docs/DEVPOST_FULL.md; the scoped Elastic key; context/hyphenate-harness-deck.pdf (Task 23 blocked at its 30-minute mark, lines committed in 6352ba4); context/elastic-criteria.jpg; the 9 PM call on keeping CRS selected with FIXTURE labels.

Director's remaining list after the takes: final `scripts/full_run.sh`, then facts.py (adds the baseline block), regenerate FACTS, RESULTS and web facts, confirm the cards and README numbers still match, restore day 0.

## 2026-10-24 20:13 PDT Builder-B: council items 3 and 5a (Task 28)

Item 3, sender allowlist on the controller seat:
- `agent/handlers.py`: `WRITE_INTENTS` (answer, approve, reject, approve_rule, reject_rule, pause, resume, step: every intent that reaches a `try_` procedure) and `handle(sender, text, may_write, on_refused)`. The gate runs after the intent is resolved, so free text that would land as an answer is gated too, and before any ledger call. A refused sender gets exactly `not authorised for this seat`; with `ASI_ALLOWED_SENDERS` empty or unset everyone is refused and the reply adds a second line saying the list is empty. Reads (`what needs me`, `why`, `status`, `rules`, `help`) stay open; `why` and `status` still go to the investigator for anyone. The terminal twin (`agent/cli.py`) is not gated: it holds the controller token itself.
- `agent/agent.py`: `on_chat` and the relay fallback pass `handlers.may_write(sender)`; a refusal is logged as `refused <intent> from <full agent1q address>: not authorised for this seat (not in ASI_ALLOWED_SENDERS)`; startup logs how many senders may write.
- Audit row: not written. No module procedure records a refusal for the controller identity without performing the write (`try_*` procedures audit `refused` only when their own check fails, and the controller passes the role check); `try_answer_question` was ruled out by the brief; spacetimedb/** is frozen for this lane. The refusal is in logs/agent.log only. JUDGE_QA and Devpost must say "agent log", not "audit row", for this refusal.
- `.env.example` gains `ASI_ALLOWED_SENDERS` with a comment. `.env` has no such line (grep count 0), so once the controller restarts on this code every ASI:One write is refused until the director adds it.
- Sender address: not found. Every log and session transcript holds only the 16-character prefix `agent1qtly3w7yc4` (agent.py logged `sender[:16]`; logs/agent.log has since been rotated). After the restart, send `approve 2231` once from Anudeep's ASI:One account: logs/agent.log prints the full address on the refusal line; put it in `.env` as `ASI_ALLOWED_SENDERS=<address>` and restart the controller again. agent/CONNECT.md "Who may write" has these steps.
- Check: `agent/.venv/bin/pytest -q agent/tests/test_allowlist.py` 33 passed, with the ledger mocked at the httpx transport: an allowed sender writes through each of the 8 write paths; an unknown sender gets the exact text on 9 write lines and on a free-text answer with zero HTTP requests; the 5 reads work for both senders; empty and unset allowlists refuse everyone.

Item 5a, the hop line:
- `agent/relay.py`: a relayed `why` or `status` reply now opens `asked @caliber-investigator <its agent1q address>, <round trip> s` (one decimal, the relay's own monotonic clock from forward to reply), then the `investigator:` text. The 8 s fallback keeps its `investigator did not answer in time; from the ledger directly:` prefix and has no hop line.
- Expected strings updated in agent/tests/test_investigator.py (deterministic clock), agent/README.md, agent/INVESTIGATOR_README.md, and the CONNECT.md two-line check and session table.
- Check: `agent/.venv/bin/pytest -q agent/tests/test_investigator.py` 24 passed; full `agent/.venv/bin/pytest -q` 275 passed.

Not restarted (builder-W holds the agents staged). The live controller (pid 95094 at 20:13) runs the old code: no allowlist, no hop line, until builder-W re-stages. Only the controller needs a restart; the investigator's code is unchanged. From the repo root, after the director adds `ASI_ALLOWED_SENDERS` to `.env`:
`kill 95094` (or the current pid from `ps -eo pid,command | grep agent/agent.py`), then `nohup agent/.venv/bin/python agent/agent.py >> logs/agent.log 2>&1 &`. The startup log should read `writes allowed for 1 sender(s) in ASI_ALLOWED_SENDERS`.

## 2026-10-24 20:13 PDT Builder-A: council item 1, backtest provenance (Task 28)

Brief: context/briefs/2026-10-24_1830_lane_a_backtest.md. No worker, dashboard, agent or ledger was started or touched; facts.py was not run against the ledger.

### Checks, as run
- `cd worker && npx vitest run test/rules.test.ts`: 20 passed, of which 4 are the new describe `backtest provenance` in `worker/test/rules.test.ts`: (a) `backtest` takes exactly a rule, `BacktestRow`s and a hold-status lookup, and `src/rules.ts` imports only zod, ./brief, ./config, ./finding, ./replay, with no `answer_key`, `node:fs` or `readFile` outside comments; (b) `src/loop.ts` wires `matchResults: () => matchResultRows(conn)` (iterates `conn.db.matchResult.iter()`) and `holdStatus: ref => holdStatus(conn, ref)`, which `src/stdb.ts` reads from `conn.db.hold.txnRef.find`; (c) no file in `worker/src` names `answer_key` outside comments; (d) rows tagged `planted: true, expected: 'hold'` give the identical backtest, and only `rejected` counts as a confirmed exception (open, awaiting_controller, answered, released, cleared_by_rule and none count 0). Full worker suite: 7 files, 111 passed; `npm run typecheck` clean.
- `bash bench/carrierbench/key_readers.sh` (new; scans tracked and untracked .ts, .tsx and .py files; exits 1 on any reader outside scripts/facts.py, seed/ and bench/): exit 0. Output:

```
Allowed readers (score against the key):
  bench/carrierbench/carrierbench.py
  bench/carrierbench/oracle.py
  bench/common.py
  bench/sample.py
  bench/score.py
  scripts/facts.py
  seed/generate.py
  seed/maintenance.py
  seed/mirror.py
  seed/plant.py
  seed/tests/test_seed.py
Mentions outside the allowed readers (each must be a comment, a label or a test that asserts the key is absent):
  web/src/components/Charts.tsx:147 [label] Precision and recall by code <span className="text-faint">(FACTS.byCode, against seed/fixtures/answer_key.json)</span>
  web/src/components/Rules.tsx:19 [label] const BENCHMARK_TITLE = 'scored against seed/fixtures/answer_key.json by scripts/facts.py, never by the agent';
  worker/src/rules.ts:3 [comment] // The answer key (seed/fixtures/answer_key.json) is never read here. Only public tables are used.
  worker/test/replay.test.ts:87 [absence test] expect(loadFixture(FIXTURES, '../answer_key')).toBeUndefined();
  worker/test/rules.test.ts:130 [absence test] expect(code(rules)).not.toMatch(/answer_key|node:fs|readFile/);
  worker/test/rules.test.ts:143 [absence test] expect(code(read(f)), f).not.toMatch(/answer_key/);
key_readers: OK, no agent, worker, module or web code reads the answer key
```

- `python3 scripts/facts.py --self-test`: "facts self-test OK", exit 0. New pure function `planted_by_rule` (mirrors `ruleCovers` in spacetimedb/src/kernel.ts and the row set of the module's `backtest()`: match_result rows with the code, plus holds with the code whose match_result changed), checked on an in-memory fixture of 3 rules, 7 match_result rows and 2 holds. `python3 -m pytest -q bench/test_facts_baseline.py`: 2 passed.
- `cd web && npm run build`: built; `npm run typecheck`: exit 0.

### What changed
- `scripts/facts.py`: one new FACTS key, `rulesPlanted` = `{source, byRuleId: {<rule id>: {sourceTxnRef, condition, covered, planted, plantedRefs, backtestN, plantedInBacktest}}}`, written to docs/FACTS.json and web/public/FACTS.json by the existing writer, plus one FACTS.md line. Every other field is unchanged. `covered`/`planted` are over the rule's window and scope at the end of the run; `plantedInBacktest` scores exactly the rows of the module's backtest at create_rule time (its `sampleRefs`), and is null when that list is truncated (n above 12).
- `web/src/components/Rules.tsx`: production line "Would have cleared N past rows; M were confirmed exceptions" unchanged, from backtest_json. Below it, only when /FACTS.json carries `rulesPlanted.byRuleId[<id>]` with the same sourceTxnRef and condition as the row (a FACTS file from another run cannot label the wrong rule), a BENCHMARK chip and "P planted rows among them" (when `plantedInBacktest` matches the card's N) or "P planted rows among the C its window and scope cover at the end of the run" (otherwise), hover "scored against seed/fixtures/answer_key.json by scripts/facts.py, never by the agent". The committed FACTS has no `rulesPlanted` yet, so the chip is hidden until the director regenerates FACTS on the final run.
- `README.md` "What is real and what is simulated", one sentence after the company line (outside the honesty markers, which scripts/honesty.py writes); `worker/README.md` "Rules", one paragraph after step 5.

### For the director
- Exact sentence for docs/DEVPOST_FULL.md line 47 (lane D owns it), replacing "a hidden answer key the agent never reads": "a hidden answer key that no agent or worker code reads; only scripts/facts.py and the bench score against it, and the rule backtest counts controller-resolved holds, never the key".
- D-6 proposal for context/DECISIONS.md:
  - Decision: the rule backtest is production logic and reads only `match_result` and `hold` rows; a confirmed exception is a hold the controller rejected. The answer key is read only by scripts/facts.py and bench/. A planted count appears on a rule card only under a BENCHMARK chip, from `FACTS.rulesPlanted`, computed by facts.py.
  - Why: the council read "planted true exceptions" on the rule card (G7 wording) as the agent scoring itself against the key. It never did (worker/src/rules.ts and the module's backtest() take ledger rows only), but the card and the Devpost sentence did not separate what a production clerk would see from what the benchmark measures.
  - Consequence: G7's "how many of those are planted true exceptions" reads "how many were confirmed exceptions (controller-rejected holds)"; the planted count is benchmark-labelled; `bench/carrierbench/key_readers.sh` and the `backtest provenance` test are the checks; DEVPOST line 47 takes the sentence above.
- After the final run: `python3 scripts/facts.py` will add `rulesPlanted`. A nonzero `planted` does not by itself mean a planted row was cleared (a consumed one_time rule still covers its window); `plantedClearedByRule` remains the claim. Check one card on the dashboard shows the chip.
- Commit trailer: the brief and D-4 say "Claude Fable 5.1"; this session runs on Claude Opus 5.5, so the commit carries `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` to keep the attribution true. Change D-4 or tell me if you want it otherwise.

### Tried and rejected
- Nesting the per-rule counts inside the existing FACTS `rules` field: it is a status counter (`{"expired": 6}`) and anything summing its values would break; a sibling key keeps that field unchanged.
- Showing the end-of-run planted count as "among them": the card's N is the backtest at create_rule time, when most of the window was still in the future, so the two counts are over different row sets. The card says "among them" only when facts.py scored the backtest's own rows.
- First key_readers classification flagged the new test's own `not.toMatch(/answer_key/)` lines as readers; absence assertions in tests are now their own class.

## 2026-10-24 20:20 PDT Builder-C2: council items 6 and 8 (Task 28)

Brief: context/briefs/2026-10-24_1830_lane_c_results.md. Log: logs/builder_c2.log. Every number below is in bench/carrierbench/droid_table.json, written by `python3 bench/carrierbench/droid_table.py` (standard library, no keys, under a second), which also rewrites the section "## Droid investigator, 52 recorded runs" appended at the end of docs/RESULTS.md (nothing above it changed; `git diff docs/RESULTS.md` has 0 removed lines, the honesty block untouched).

### Item 6, the table (current fixtures, 52 runs)

| Measure | Value |
| --- | --- |
| Recommendations | clear 0, hold 1 (INV-1003), hold_and_ask 51 |
| MCP calls per run (elastic___) | mean 1, min 1, max 2; distribution 1: 51 runs, 2: 1 run; find_trips_near 31, contract_rate_for_vendor 21, find_contract_clause 1 |
| Read / Grep / Glob per run | Read mean 3.8 (min 1, max 11); Grep mean 0.5 (0 to 1); Glob mean 0.2 (0 to 2) |
| Permission handler decisions | 52 in 52 runs, all `permission proceed once: Script:script`; Cancel 0; 52 of 52 were for a Script that called an MCP tool |
| Cost, live record log (52) | input mean 1,033.4, median 1,045, min 966, max 1,058; output mean 1,354.5, median 1,390.5, 858 to 2,195; cache mean 70,386.5, median 64,875, 31,954 to 113,496; durationMs mean 25,584.6, median 26,082, 14,662 to 42,054 |
| Cost, decoy re-record log (6) | input mean 1,088.2; output mean 1,172.7; cache mean 70,067.8; durationMs mean 19,505.3 (full min, median, max in RESULTS) |
| listTools() | 58 ids: 31 allowed (24 Elastic MCP, 7 built-in: Glob, Grep, LS, Read, Script, ToolSearch, WaitForScript), 27 disabled |

Re-recordings, reported separately: 1421, 2044, 2231, 3955, 5428, 5986 and INV-1003 (recordedAt differs from the copy in `_v1/`). Originals: clear 6, hold_and_ask 1; now: hold 1, hold_and_ask 6. INV-1003's re-record (23:09Z) has no line in either cost log; its own finding.tokenUsage (input 1,144, output 1,571, durationMs 34,745) is shown and labelled as such.

BENCHMARK, scored against the answer key by the script, never by the agent: 44 of 46 hold_and_ask questions on keyed rows name the planted person or record (0.957). Rule, written in the JSON and in RESULTS: decoys need the driver's name (key note, confirmed against swap_log.txt) or the relief unit; fuel holds need the card's unit ("truck N", "unit N") or that unit's fuel card id; invoice classes need the vendor name, a PO, or an invoice id from the invoice or the key note. Misses: 3510 and 5908 (capacity_exceeded; neither names truck 26 / FC-1026 or truck 39 / FC-1039). Stricter reading: only 4 of 20 fuel holds name the unit number itself (all 14 planted location_mismatch questions name the card, none the truck); 6 of 6 decoys name both driver and relief unit. Unscored: 660001, 660002, 660003, 770002, 770003 (rehearsal injections, not in the key). No question: INV-1003 (hold).

### Read under autonomy Off: the finding

`autonomyLevel: AutonomyLevel.Off` is in every commit of worker/src/droid.ts (29e002f 11:07 PDT onward, before the 13:22 PDT record run; checked with `git show <c>:worker/src/droid.ts` per commit). In 52 of 52 recordings a Read tool_call has a succeeding tool_result (not isError); first three 1068, 1421, 1468. 197 Read calls, 184 ok, 13 error; 143 of them reached no permission decision at all (130 returned content) and the other 54 sat inside a Script the handler approved for its MCP call. No permission note names Read. So the handler is consulted for MCP calls only; Read never asks.

Two corrections that follow, both outside my files:
1. Reads outside the evidence folder: 10 attempted in 3209 and 770003, and 1 succeeded: **770003 read `~/AGENTS.md`** (the laptop's home folder), and the committed fixture `seed/fixtures/investigations/770003.json` (since a87192e) carries that file's text inside a Script tool_result: an unrelated InsForge project note for another product, including its API base URL. No key in it (checked with a token-pattern scan, nothing printed). The repo goes public on Sunday; this needs the director's decision (redact that tool_result in the fixture, or re-record 770003) before then. Also the README's honesty note, line 143, says the probed instruction files "do not exist"; one did.
2. The inline comment `// every action asks the handler` on `autonomyLevel` in worker/src/droid.ts, quoted verbatim in README "Where Droid runs", is contradicted by the recordings (and by the handler's own comment, "Read and Grep need no confirmation at all in autonomy Off"). Suggested: `// Off: MCP calls ask the handler; Read, Grep, Glob, LS run without asking`.

### Item 8, MCP consistency

The spec's mcpServers block (context/BUILD_SPEC.md line 343) lists Elastic only; worker/src/droid.ts builds exactly one entry (`name: 'elastic'`) or none. The CRS MCP server appears only in TASKS 16.5 as an option never taken (the worker calls CRS directly). Grep of docs/DEVPOST_FULL.md, README.md (including "Where Droid runs"), docs/CARDS.md and context/JUDGE_QA.md for two MCP servers, a second mcpServers entry, a CRS MCP server or mcp.crscreditapi.com: **no hits**. Related wording the recordings contradict, for the director to apply (I edited none of these). Line numbers are at HEAD 92c32d5; other lanes have DEVPOST_FULL.md and JUDGE_QA.md open, so match on the quoted text (in the working tree at 20:22 the DEVPOST lines were 68, 90, 181, 154 and the JUDGE_QA line 63):

| File:line | Now | Replacement |
| --- | --- | --- |
| docs/DEVPOST_FULL.md:68 | "a `permissionHandler` that allows only MCP tool calls" | "a `permissionHandler` that cancels anything write-like and approves MCP calls once (Read, Grep and Glob run without asking)" |
| docs/DEVPOST_FULL.md:90 | "a boxed agent with MCP-only reach" | "a boxed agent with one MCP server (Elastic) and read-only file tools" |
| docs/DEVPOST_FULL.md:179 | "box an investigator to read-only with MCP as its only reach into data" | "box an investigator to read-only, with the Elastic MCP server as its only reach beyond the evidence folder" |
| docs/DEVPOST_FULL.md:152 | "the three MCP source tags" | "the Elastic MCP source tags" (I could not confirm a count of three in web/src) |
| README.md:143 | "(... probed for instruction files above the evidence folder, which do not exist)" | "(in one recorded run, 770003, it read `~/AGENTS.md` above the evidence folder; nine other probes found nothing)" |
| context/BUILD_SPEC.md:14 | "a `permissionHandler` that cancels everything except MCP tool calls" | add: "Read, Grep, Glob and LS never reach the handler under autonomy Off (bench/carrierbench/droid_table.json)" |

No change needed: docs/CARDS.md:35 ("the Elastic tools over MCP"), context/JUDGE_QA.md:57 (one MCP server named; but it says "two Elastic ES|QL tools" while DEVPOST says four tools, two ES|QL and two semantic, and the recordings call three: find_trips_near, contract_rate_for_vendor, find_contract_clause).

### Checks
- `python3 bench/carrierbench/droid_table.py` from a fresh `git clone` in the scratchpad: JSON and RESULTS section identical to the working tree.
- RESULTS section rendered from the table dict only; rerun is idempotent (replaces the section, nothing else).
- Em-dash count 0 in docs/RESULTS.md, the script, the JSON and bench/README.md.
- `scripts/facts.py` rewrites docs/RESULTS.md whole (line 409), so the next full run drops this section; bench/README.md says to rerun the script after it. Wiring it into scripts/full_run.sh is the director's call (not my file).
- Commit trailer: the brief says "Claude Fable 5.1"; this session runs on Claude Opus 5.5, so the commit carries `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (same as Builder-A's entry above).

## 2026-10-24 20:21 PDT Builder-D: council items 2, 4, 7 and the demo order (Task 28)

Brief: context/briefs/2026-10-24_1830_lane_d_docs.md, plus the director's five amendments sent mid-run (INV-1075 for beat (b), Inspiration figures deleted, caliber.compare, the "/" beat, gallery-00). No worker, dashboard, agent or ledger was started or touched; no script in the never-run list was run. Log: logs/builder_d.log.

### Checks, as run
- Item 2: `grep -n '\[FACTS\]\|\[BASELINE\]\|\[was' docs/DEVPOST_FULL.md` hit only the header note naming the markers (reworded); the page body had none. The verbatim baseline paragraph appears twice (`grep -c` 2), in "What we got wrong" and in the Proof bullet, as the brief says; delete one at paste time if the page reads repetitive. `grep -c '1,800\|95,000'` 0.
- Item 4: 7 bullets under "How we built it" (SpacetimeDB, kernel, Droid, Elastic, uAgents, rules, proof), CRS, Nessie and Anthropic folded into "Also in the path", ingest and engineering into "Ingest and engineering". Elastic bullet names find_trips_near and contract_rate_for_vendor as ES|QL and find_contract_clause and find_receipt_text as semantic on JINA. Both agent1q addresses next to the handles (copied from agent/README.md). Track table: Hyphenate row plus seven one-line tracks. Deleted: the SpacetimeDB no-prize challenge, the Money Maxer phrase, "What we learned" item 3. Paste-time checklist kept, plus the caliber.compare parking-page line.
- Item 7: five JUDGE_QA answers (planted at runtime, what the kernel buys, the issuer auto-draft, two agents, ASI:One allowlist), each at most three sentences ending with a file name. "planted" checked in code: `grep -c planted spacetimedb/src/index.ts spacetimedb/src/kernel.ts` 0 and 0; worker/src/rules.ts names the key only in its comment; seed/fixtures/summary.json carries planted counts but nothing in scripts/, worker/src, spacetimedb/src, agent/ or web/src loads it. Builder-B logged item 3 green at 20:13 (6a8202b, 33 allowlist tests), so the ASI:One question gets the allowlist and "not authorised for this seat", with the caveat that the refusal goes to the agent log, not audit_event (builder-B: the module is frozen).
- not-built: the dispute path bullet (issuer dispute window, credit memo, statement reconciliation). Its two stale Nessie lines ("Nothing moves money to a bank", "until a key arrives") contradicted Task 17 and the key now in .env (`grep -c -E '^NESSIE_API_KEY=.+' .env` 1); rewritten to the mock bank and to the measured run's 0 live ids from FACTS.
- Demo order: VIDEO.md 0:00 `approve 2231` to @caliber-investigator (reply and the `reader` refusal row), 0:15 `approve INV-1075` (reply read from agent/handlers.py and agent/formatting.py, settle row `paid, bank id <id>` read from web/src/components/LedgerOfTrust.tsx), 0:30 `scripts/clock.sh step` to day 42 plus `(cd elastic && .venv/bin/python setup_workflow.py --run --no-wait)`, 0:40 to 1:35 the 2231 story, 1:40 `status` with the escalation count. moment-script.md staging: the exact worker line (live settlement because index.ts passes requestedMode; Droid replay because config.ts forces replay on an empty Factory key), ASI_ALLOWED_SENDERS for the recording account, day-41 fuel sample plus the invoice file dropped off camera, then mirror_holds.py. RUNBOOK section 1: "/" beat (Task 29, else /console), then the same order with B1 staging `run_days.ts --until 41` first; section 6 Elastic gains line 6, the Workflow trigger. Em-dash scan of all six files: 0.

### Also changed, for consistency (say if unwanted)
- Devpost line 47 takes lane A's sentence verbatim; "0 of them planted errors" in the What-it-does row and "how many of those are planted errors" in the Rules bullet now say confirmed exceptions, matching the card and worker/README "Rules".
- RUNBOOK: section 6 Elastic line 2 (two tools) now four tools; Hyphenate line 5 (money does not move) now the mock bank; section 4 restages day 41 after reset; section 5 gains the `not authorised for this seat` row. VIDEO.md: the vendor beat says FIXTURE, not `replayed`, to match runbook 02:45; the tail is retimed to end near 3:25 after the separate agent-refusal and settlement beats were folded into 0:00 and 0:15; the clock-running FACTS shot is marked as a separate replay staging, because with settlement live every auto-paid row is a Nessie transfer; FACTS date updated to the 00:22:27Z run.

### Sentences I could not source, or that need a decision
- Inspiration: the derived sentence was deleted, not replaced. FACTS has no fuel spend, so the 2 to 5 percent range has no base; 92 business days runs 2026-07-01 to 2026-11-05 (seed/simcal.py), not a quarter; APQC's figure is per invoice, and most of the 7,944 transactions are statement lines. The cited external figures (ATA, 91.5 percent, Shell, APQC) stay with their sources; they are not in FACTS.
- The verbatim paragraph says "the 52 planted rows"; bench/BASELINE.md scores 58 key rows (52 planted plus 6 decoys). Sonnet matched on all 58, so the sentence is true, but the denominator differs from the table.
- "about 63 s" is builder-26's single measurement (17:20 entry); the beat waits for the count to move rather than for a clock.
- The Devpost What-it-does row still cites `approve 1068` with 0.81 s, a measured past run; the demo now uses INV-1075. Remeasure on INV-1075 during the take or keep the row as the past measurement.
- The "/" beat describes Task 29 from the director's message (sentence card, question, mini-map, `Answer in ASI:One`); I have not seen the screen.
- Commit trailer: like builders A and B, this session runs on Claude Opus 5.5, so the commit carries that name instead of D-4's Fable 5.1.

## 2026-10-24 20:58 PDT Builder-C3: consistency fixes (Task 28)

Brief: context/briefs/2026-10-24_2100_c3_consistency.md. Log: logs/builder_c3.log. No process started or stopped; no script in the never-run list was run. Every replacement below was applied by exact match and asserted to match once.

### Checks, as run
- Step 1, docs/DEVPOST_FULL.md: builder-C2's four replacements (permission handler wording in the Droid bullet; "one MCP server (Elastic) and read-only file tools" in the Cal Hacks row; "the Elastic MCP server as its only reach beyond the evidence folder" in the Factory feedback; "the Elastic MCP source tags" in gallery-02). The baseline paragraph: `grep -c` 1, kept in "What we got wrong"; the Proof bullet now ends "The model-only baseline is in `bench/BASELINE.md` and under "What we got wrong" below." The D-6 sentence was already verbatim at line 47 ("What it does", where the draft describes the key): `grep -c` 1, unchanged. `git diff --stat` 5 insertions, 5 deletions.
- Step 2, the Read finding: README.md:143 takes C2's replacement; docs/not-built.md "hard sandbox" bullet replaces "(none existed)" with the 770003 read of `~/AGENTS.md`, the redaction in e2243e1 (the read stays recorded) and nine other probes finding nothing; context/JUDGE_QA.md:63 and context/CLAIMS_AUDIT.md row 14 (verdict column) say the same in one clause each; JUDGE_QA:63 now names four Agent Builder tools, two ES|QL (find_trips_near, contract_rate_for_vendor) and two semantic on JINA (find_contract_clause, find_receipt_text), the recordings calling three (droid_table.json `mcpCallsByTool`: 31, 21, 1; ten outside reads attempted, one succeeded). docs/CARDS.md Droid card unchanged: it claims no read-only boundary and already says the OS sandbox around Read is Not built. `git grep` for "none existed", "which do not exist", "two Elastic ES|QL" in the touched files: 0.
- Step 3: worker/src/droid.ts, the `autonomyLevel` comment only, now `// Off: MCP calls ask the handler; Read, Grep, Glob, LS run without asking`. Both README quotes had also drifted on the `mcpServers` comment (they still said "KIBANA_URL and ELASTIC_API_KEY"); the whole BEGIN to END block was re-synced in both. `diff <(sed -n '/BEGIN createSession options/,/END createSession options/p' worker/src/droid.ts) <(same on README.md)`: empty; same on worker/README.md: empty. `cd worker && npm run typecheck`: exit 0; `npx vitest run`: 7 files, 111 tests passed.
- Step 4: context/BUILD_SPEC.md:14 ends "Read, Grep, Glob and LS never reach the handler under autonomy Off (bench/carrierbench/droid_table.json)."
- Step 5: scripts/full_run.sh runs `python3 bench/carrierbench/droid_table.py` under its own step line right after facts.py, before honesty.py. `bash -n`: ok. The script alone, twice: exit 0, "benchmark 44 of 46"; md5 of docs/RESULTS.md and droid_table.json unchanged, `git status` clean on both (idempotent on the redacted 770003 fixture too).
- Em-dash count 0 in all twelve files in the brief's list.

### For the director (outside my lines, not edited)
- context/CLAIMS_AUDIT.md row 14's Claim column still reads "only MCP tool calls allowed"; the recordings show Read, Grep, Glob and LS run without asking. The brief allowed one clause, so the claim text is yours to soften.
- context/BUILD_SPEC.md:340 quotes the old comment `// every action asks the handler` in its options sketch; context/IDEA_RANKING.md:134 says "a permission handler that allows only MCP tool calls"; context/TASKS.md:289 says "MCP-only reach". None is judge-facing; left as written.

## Tried and rejected

| What | Why rejected |
| --- | --- |
| Private `agent_task` table with the worker subscribing | Clients cannot subscribe to private tables in 2.13; made operational tables public and kept company data private |
| `spacetime login` with GitHub for the local demo | Needs a browser and ties the publisher to a cloud identity; the demo mints a local identity with `POST /v1/identity` and logs the CLI in with that token |
| Worker-side backtest scored against the answer key | Agent code must never read the key; the module backtests against confirmed controller decisions instead |
| A pause button in the dashboard | Vite inlines env vars into the bundle, which would ship the controller token; pause is a terminal or ASI:One command |

## 2026-10-24 15:45 PDT Builder-C: product name Caliber

Brief: context/briefs/2026-10-24_1535_rename_caliber.md. Every judge-facing mention of the product in builder-C's files now reads Caliber. "Dispatch Ledger" survives only where it is an identifier or belongs to another builder.

Hit list from `grep -rn "Dispatch Ledger"` (md, py, ts, tsx, html; node_modules, PROJECT_STATUS and briefs excluded), classified:

| File:line | Classification | Done by |
| --- | --- | --- |
| web/src/components/TopBar.tsx:36 | rename, dashboard header | builder-C, now "Caliber"; the "Simulated carrier" line below is untouched |
| web/index.html:7 | rename, browser tab title | builder-C |
| web/README.md:1 | rename, prose heading | builder-C |
| elastic/README.md:1 | rename, prose heading, carries "(repo and ledger name: dispatch-ledger)" at first mention | builder-C |
| docs/VIDEO.md:20 | rename, closing voice line | builder-C |
| agent/README.md:6 | rename, profile prose, carries the first-mention parenthetical | builder-C |
| agent/README.md:1 and :10 | keep, agent display name "Dispatch Ledger Controller" in the H1 and the Name column; the brief freezes name, handle and address columns | none |
| agent/INVESTIGATOR_README.md:6 | rename, profile prose, carries the first-mention parenthetical | builder-C |
| agent/agent.py:66 | rename, Agentverse `description` string (prose, not the `name`, seed or port) | builder-C |
| agent/investigator.py:65 | rename, Agentverse `description` string | builder-C |
| agent/formatting.py:7 | rename, HELP reply text | builder-C |
| agent/cli.py:36 | rename, CLI banner | builder-C |
| agent/tests/test_investigator.py:316 | rename, expected string for the help reply | builder-C |
| agent/ledger.py:1 | keep, module docstring naming the `dispatch-ledger` SpacetimeDB module; outside the brief's "reply and help text" scope | none |
| agent/__init__.py:1 | keep, package docstring, not in builder-C's file list | none |
| README.md:1 | rename, builder-W's job | builder-W |
| docs/RUNBOOK.md:15 and :33 | rename, builder-W's job | builder-W |
| CLAUDE.md:3 | keep, director instructions, frozen | none |
| context/BUILD_SPEC.md:5 | keep, frozen spec; it already says "Working name: Dispatch Ledger (change it)" | none |
| seed/generate.py:1 | keep, seed/** frozen, docstring | none |
| scripts/nessie_seed.py:6 and :108 | keep, scripts/** frozen; the Nessie customer and account are named "Dispatch Ledger Carrier" and a rename would create a second customer in the mock bank | none |
| spacetimedb/src/index.ts:1 and module.test.ts:1 | keep, module code frozen, comments name the `dispatch-ledger` module | none |
| elastic/setup_agent.py:32 | keep for now, not in builder-C's list; it is the Elastic Agent Builder instruction text ("the investigator inside Dispatch Ledger") and a judge opening the agent in Kibana would see it. Director's call; changing it means re-running setup_agent.py against Serverless | director |
| elastic/common.py:1 | keep, docstring, not in builder-C's list | none |

No file in my list contained a lowercase "dispatch ledger" variant. context/JUDGE_QA.md, docs/CONTRACT.md and worker/README.md do not name the product and were left alone.

Identifiers that stay "dispatch-ledger" on purpose: the repo name, the SpacetimeDB database name, `AGENT_NAME = "dispatch-ledger-controller"` (agent/agent.py:44) and `AGENT_NAME = "dispatch-investigator"` (agent/investigator.py:42), the `@dispatch-ledger-controller` and `@dispatch-investigator` handles and their `agent1q...` addresses, module and package names, file paths, and the history above this entry.

Checks, each run after the edits:

| Check | Command | Observed |
| --- | --- | --- |
| Agent tests | `agent/.venv/bin/pytest -q` | 191 passed in 8.33s |
| Dashboard build | `cd web && npm run build` | built in 1.09s, dist/index.html 0.60 kB |
| Em dashes | `grep -nP '\x{2014}'` over the 12 touched files | empty |
| Agent names | `grep -rn "dispatch-ledger" agent/*.py` | only agent/agent.py:44 AGENT_NAME, unchanged; investigator AGENT_NAME unchanged |

Not done by builder-C, by design: the running controller and investigator agents were not restarted, so their live replies and Agentverse descriptions still show "Dispatch Ledger" until the director restarts them after builder-W finishes. demo_up.sh, full_run.sh and rehearse.sh were not run. README.md and docs/RUNBOOK.md still say "Dispatch Ledger" pending builder-W's commit.

## 2026-10-24 16:06 PDT Builder-23: harness vocabulary (Task 23), BLOCKED on the deck; builder-W's lines applied

Brief: context/briefs/2026-10-24_1550_task23_harness.md. `context/hyphenate-harness-deck.pdf` was absent at 15:36 and stayed absent through 30 polls at 60 s (logs/builder_23.log, one line each five minutes, last at 16:05). The acceptance check requires every term quoted from the deck with a slide number, so the README section "The harness", the JUDGE_QA block "In the harness deck's words" and any not-built lines for deck concepts are not written. Nothing is invented in their place.

Prepared for the moment the deck lands, each anchor verified with `grep -n`:

| Our term | File and symbol | Hit |
| --- | --- | --- |
| what decides | `spacetimedb/src/kernel.ts`, imports only `./thresholds` | kernel.ts:3 |
| what refuses | `checkApprovePayment` in `spacetimedb/src/index.ts`; `requireRole`; `role` table in `schema.ts` | index.ts:663, index.ts:70, schema.ts:11 |
| what remembers | `rule` table (`scopeJson`, `validFromDay`, `validToDay`, `backtestJson`, `approvedBy`); `createRule` refuses when the backtest would clear a confirmed exception; `approvedRules` feeds the kernel | schema.ts:198, index.ts:556, index.ts:568, index.ts:251 |
| what is boxed | `worker/src/droid.ts` `BEGIN createSession options` block; `reader` in the allowed roles | droid.ts:106, index.ts:101 |
| what proves | `seed/fixtures/answer_key.json`, `docs/FACTS.md`; `bench/BASELINE.md` does not exist yet, so the entry will say "baseline pending" | both present; bench/ has code but no BASELINE.md |

Done this round, on the director's instruction (cross-session messages 15:5x), from builder-W's "Lines for builder-23's files" in the 15:52 entry, verbatim:

- README.md: subsection "Connectors" under "What is real and what is simulated"; the "Or start with data arriving" line after the demo month block in "Run it"; the two "Agent addresses" rows renamed `caliber-controller` and `caliber-investigator` (commit 7c4e59d), addresses byte-identical in the diff.
- docs/not-built.md: first bullet replaced with the file-connector wording.
- context/JUDGE_QA.md: "Where does the data come from?" under "The finance person".
- README.md had two uncommitted timestamp lines from builder-W's facts run (22:25:41 to 22:47:43); restored to HEAD with `git checkout -- README.md` before editing, per the director, so README matches the committed FACTS files.

Checks: `ls scripts/ingest_watch.py docs/CONNECTORS.md seed/fixtures/inbox/fuel_card_wex_sample.csv` all present; `grep -n ingestRows spacetimedb/src/index.ts` hits :500; `grep -n -- --inbox scripts/demo_up.sh scripts/full_run.sh` hits both; `grep -nP '\x{2014}'` over the three files: empty. Not run: demo_up.sh, full_run.sh, rehearse.sh. Not touched: scripts/facts.py, elastic/, bench/, agent/ (other builders' uncommitted work).

Next: relaunch builder-23 when the deck is in `context/`; steps 3 to 7 of the brief remain.

## 2026-10-24 17:20 PDT Builder-26: Elastic alignment (Task 26)

Rubric photo context/elastic-criteria.jpg: absent at start and at 17:20, so the four lines are quoted from TASKS.md (depth and creativity of the ES implementation; use of JINA embeddings; use of Agent Builder AND Workflows; Serverless). Jd Armada confirmed to the director that Workflows is GA on Serverless Elasticsearch projects, no toggle.

Commits: 9378983 (26.1 tools and 26.2 semantic tools), e6b4f70 (26.1 key path, worker fallback), 24c4687 (26.3 Workflow, mirror, escalations, agent status line), e87732b (26.2 recording, elastic README, screenshots). This entry is the fifth.

### Checks, as run

| Step | Command | Observed |
| --- | --- | --- |
| 26.1 baseline | `cd elastic && .venv/bin/python smoke.py` (before changes) | 3/3 PASS; the old `at` date params already worked |
| 26.1 mapping | `PUT telematics_log/_mapping {"@timestamp":{"type":"alias","path":"at"}}` | acknowledged; 154,846 pings untouched, no re-ingest (alias, not rename; `mappings/telematics_log.json` carries it for fresh projects) |
| 26.1 ES\|QL | `POST /_query` with `WHERE @timestamp >= ?start AND @timestamp <= ?end`, `TO_GEOPOINT(CONCAT("POINT(", TO_STRING(?lon), " ", TO_STRING(?lat), ")"))` | 2 rows, truck 22 first, 13.98 m |
| 26.1 upsert | `.venv/bin/python setup_agent.py` | find_trips_near updated, contract_rate_for_vendor updated, find_contract_clause created, find_receipt_text created, agent dispatch-investigator updated |
| 26.1 smoke | `.venv/bin/python smoke.py` | 5/5 PASS: truck 22 first (13.98 m); rate 245000; brake_job clause first (score 0.776); receipt 2231 (score 0.738); MCP tools/list 26 tools incl. all four |
| 26.1 key | `.venv/bin/python make_mcp_key.py` | HTTP 400 `creating derived api keys requires an explicit role descriptor that is empty`; Serverless will not derive a privileged key from an API key. WAITING Anudeep (Kibana UI; docs/evidence/elastic/scoped_key_request.md has the click path and the role descriptor JSON; `pbpaste \| make_mcp_key.py --write-from-stdin` stores it; `smoke.py --mcp-key-env ELASTIC_MCP_API_KEY` is the 200 proof, a second key without the application block is the 403 proof). The 200 vs 403 proof is therefore NOT run yet |
| 26.1 worker | `cd worker && npm run typecheck && npm test` | clean; 107 passed. config.ts: `elasticApiKey` = ELASTIC_MCP_API_KEY when set else ELASTIC_API_KEY, `elasticKeySource` says which; droid.ts header unchanged in shape |
| 26.2 tests | `cd elastic && .venv/bin/python -m pytest -q tests` | 32 passed (3 updated for the new params, 2 added: semantic tools match the JINA fields, @timestamp alias) |
| 26.2 recording | `cd worker && ELASTIC_MCP_API_KEY= npx tsx tools/rerecord_one.mts INV-1003` | source live; tool_calls Read x4, elastic___contract_rate_for_vendor, elastic___find_contract_clause (question "What does the oil_service unit rate cover, and when does a surcharge or change order require approval?...", 2145-char result), Grep; evidence cites find_contract_clause with the contract 9 clause; tokenUsage in 1144 out 1571; durationMs 34745; recordedAt 2026-10-24T23:09:39Z; FindingSchema passes. The recording changes INV-1003 from hold_and_ask to hold (director: keep, a planted rate variance with the clause quoted is a hold by the spec's table); the next full run must still show recall 1.0. v1 kept at seed/fixtures/investigations/_v1/INV-1003.json |
| 26.3 API | `GET {KIBANA_URL}/api/workflows` | 200, Workflows present. Per-id GET/PUT/run routes 404 on this build; bulk POST and DELETE work; runs go through Agent Builder's platform.core.execute_workflow (docs/evidence/elastic/workflows_api_probe.txt) |
| 26.3 mirror | `.venv/bin/python mirror_holds.py` | day 41, 12 holds, 12 open, 11 open more than 2 business days; holds index 12 docs (anonymous SQL on the public hold and business_day tables; run by hand, the worker does not run it) |
| 26.3 workflow | `.venv/bin/python setup_workflow.py --run` | validate_workflow valid; id caliber-stale-holds-3; execution 15a56191-f722-4b04-8968-505e12f51d83 (manual) Success 3m 8s, plus 4e40edcc (scheduled trigger fires once on creation) Success 2m 46s; escalations 0 to 6 (holds 1068, 1468, 1421, twice each); first doc 90 s after start. First attempt (d3e135ba) failed at elasticsearch.index because `at` rendered as a JS date string; fixed with `{{ 'now' \| date: '%Y-%m-%dT%H:%M:%SZ' }}` and LIMIT 3 |
| 26.3 UI | Chrome, Anudeep's Kibana session, `/app/workflows` | nav item present; workflow listed and enabled; editor "No validation errors"; Executions panel two Success rows. Screenshots docs/evidence/elastic/workflows_list_2026-10-24.jpg, workflow_detail_2026-10-24.jpg, workflow_valid_2026-10-24.jpg, workflow_executions_2026-10-24.jpg |
| 26.3 agent | `agent/.venv/bin/pytest -q agent/tests` | 149 passed (test_escalations.py 10 cases over httpx.MockTransport; tests/conftest.py refuses Elastic network for every test; two exact-string status tests updated for the new last line) |
| 26.3 restart | pkill investigator, start; pkill controller, start | pids 57836 on 8012, 57884 on 8011; `agent/.venv/bin/python -m agent.cli "status"` ends with "8 escalations, newest: 1468: Here is the brief for the controller: **Held:** Card transaction txn_ref 1468, $..." |
| 26.3 beat | setup_workflow.py --run --no-wait, then agent.cli status every 5 s | new escalation visible after 63 s (target 30 s, not met: the ai.agent step takes 60 to 80 s per hold because the agent calls the tools before writing) |

### What changed

- `elastic/tools/find_trips_near.json`: params `lat`, `lon` (float), `radius_m` (float), `start`, `end` (date); query over `@timestamp`; no geo_point param.
- `elastic/tools/find_contract_clause.json` (vendor_id, question) and `elastic/tools/find_receipt_text.json` (txn_ref, question): `MATCH(clause_semantic, ?question)` and `MATCH(body_semantic, ?question)` with `METADATA _score`, both fields `semantic_text` on `.jina-embeddings-v5-text-small`. Receipts have a body field, so the receipt tool was built, not skipped.
- `elastic/setup_agent.py`: four core tools, agent instructions name the two semantic tools. `elastic/smoke.py`: five checks, `--mcp-key-env`, `--skip-tools`.
- `elastic/make_mcp_key.py`: role descriptors `{"caliber_droid_mcp": {"cluster": [], "indices": [{"names": ["receipts","contracts","telematics_log","invoices","holds","escalations"], "privileges": ["read","view_index_metadata"]}], "applications": [{"application": "kibana-.kibana", "privileges": ["feature_agentBuilder.read","feature_actions.read"], "resources": ["space:default"]}]}}`, key name caliber-droid-mcp; the only .env writer (one line).
- `elastic/workflows/stale_holds.yaml` (caliber-stale-holds): scheduled 1h + manual with input min_age_bd (default 2); esql over holds, foreach, ai.agent dispatch-investigator, elasticsearch.index into escalations {hold_ref, code, cents, day, age_bd, min_age_bd, brief, at, workflow_run, workflow, agent_id, source}. `elastic/setup_workflow.py`, `elastic/mirror_holds.py`, `elastic/mappings/holds.json`, `elastic/mappings/escalations.json`.
- `agent/reads.py`: status reply ends with "N escalations, newest: <hold_ref>: <80 chars>" or "escalations: not connected" (unset variables or any error). Scoped key preferred, project key fallback.
- `worker/src/brief.ts`: invoice instruction names elastic___find_contract_clause after contract_rate_for_vendor; MCP_SOURCES gains the two semantic tools. `worker/tools/rerecord_one.mts`.
- CRS and Nessie untouched. thresholds.ts, kernel.ts untouched.

### Blocked

- Scoped key creation and the 200 vs 403 proof: WAITING Anudeep (Kibana UI login). Everything else runs on the project key with the fallback in place.

### Tried and rejected

- Deriving the scoped key from ELASTIC_API_KEY over `POST /_security/api_key` and over Kibana's `/api/security/api_key` (404): Serverless refuses derived keys with privileges.
- `execution.startedAt` as the escalation timestamp: renders as a JavaScript date string that the date field rejects; Liquid `'now' | date` works.
- Root-level `inputs:` in the workflow YAML: the API accepted it, the editor flagged "inputs must be defined under a manual trigger"; moved under the manual trigger.

### README "Elastic" section (verbatim, for builder-23)

## Elastic

Four indices on a Serverless project (`my-elasticsearch-project-b5e003`): `telematics_log` (154,846 `geo_point` pings with `@timestamp`), `receipts` and `contracts` (with JINA `semantic_text`), `invoices` (`elastic/mappings/`). Depth: four hand-written ES|QL tools in Agent Builder (`elastic/tools/`), two exact (`find_trips_near` with date params and a point built in the query from lat and lon, `contract_rate_for_vendor`) and two semantic (`find_contract_clause`, `find_receipt_text`), created over the API by `elastic/setup_agent.py`, executed by `elastic/smoke.py`, and reached by Droid over the MCP endpoint `{KIBANA_URL}/api/agent_builder/mcp` under a least-privilege key (`elastic/make_mcp_key.py`: read on six indices plus Agent Builder read, nothing else). JINA: `clause_semantic` and `body_semantic` are `semantic_text` fields on `.jina-embeddings-v5-text-small`, and the two semantic tools run `MATCH(...)` against them with the investigator's plain-language question; the recorded INV-1003 investigation (`seed/fixtures/investigations/INV-1003.json`) contains the live `elastic___find_contract_clause` call and quotes the clause it returned. Agent Builder and Workflows: the agent `dispatch-investigator` owns the four tools, and the Workflow `caliber-stale-holds` (`elastic/workflows/stale_holds.yaml`, registered by `elastic/setup_workflow.py`, scheduled hourly plus a manual trigger) reads the `holds` index that `elastic/mirror_holds.py` copies from the ledger, asks the agent for a brief on every hold open more than two business days, and writes it to the `escalations` index that the controller agent's `status` reply reads (`agent/reads.py`). Serverless: everything above ran on the Serverless project on 2026-10-24 (context/PROJECT_STATUS.md, 17:20 entry; screenshots in docs/evidence/elastic/). Elastic is not the system of record and not the dashboard's data source.

### JUDGE_QA block (verbatim, for builder-23)

**Elastic Workflows?** One Workflow, `caliber-stale-holds` (`elastic/workflows/stale_holds.yaml`): every hour, and on demand, it finds holds open more than two business days in the `holds` index, has the Agent Builder agent write a one-paragraph brief per hold with the ES|QL tools, and indexes each brief into `escalations`; the controller agent's `status` reply ends with "N escalations, newest: ...". It ran on the Serverless project on 2026-10-24 (two executions, six briefs); a new brief shows in `status` about a minute after the trigger, not 30 seconds, because the agent calls the tools before writing. The scoped MCP key waits on a Kibana UI step; until then Droid uses the project key.

## 2026-10-24 17:15 PDT Builder-22: model-only baseline (Task 22)

Brief: context/briefs/2026-10-24_1550_task22_baseline.md. Acceptance: bench/BASELINE.md and the FACTS baseline block exist from one committed run with prompts and raw outputs on disk, and the README line quotes the table. The run is committed (bench/**); the FACTS block is wired in scripts/facts.py and emits only when bench/BASELINE.json exists; facts.py was not run against the ledger (builder-W owns it). The README line is below for the director to apply.

What was run (one committed run, 2026-10-24, 15:46 to 17:08 PDT):

- Sample (bench/sample.py, seed 42): all 52 planted rows, all 6 decoys, 500 clean rows: 174 card, 173 toll, 153 invoice (every clean invoice there is), clean card and toll rows spread over all 92 days, invoices over 81 days. The 6 auto-pay limit holds were excluded (policy holds, not exceptions). bench/sample.json.
- Inputs (bench/inputs.py): per row, the rows index.ts hands the kernel: the transaction; for cards the truck (plate, tank) and the truck's pings for that business day (pingsFor loads the day, the kernel's rule then uses the 30-minute window); for tolls every earlier toll for the plate; for invoices the PO with received quantity, the contract valid on the receipt day selected the way index.ts selects it, the vendor record with bankChangedDay, and the vendor's earlier invoices. Fields allow-listed; a walk asserts no code, expected, note, planted, finding or txnRef key. 558 files under bench/inputs.
- Prompt (bench/prompts/hold_or_clear.txt): one prompt for both models, the payables policy with the seven codes and the kernel's thresholds (copied as prose, thresholds.ts untouched), a guide to the record fields, and the JSON shape. The policy is in the prompt because a clerk would have it; without it the test would measure threshold guessing.
- Models (bench/baseline.py, over httpx; no Anthropic SDK exists in any project venv, agent/.venv used): Claude Sonnet, requested and accepted id claude-sonnet-5-5, concurrency 4, no temperature sent (Claude Sonnet 5.5 returns 400 for a non-default temperature), thinking and effort at API defaults, max_tokens 4096; asi1-mini, temperature 0, one request at a time paced to 9.1 s (free plan 100 per 15 minutes, 1,000 per day), 561 requests today, 3 rows retried once, every row ended 200. Every raw response under bench/outputs/<model>/<id>.json plus _meta.json.
- Scoring (bench/score.py): positives are the 58 key rows, decoys count as correct holds for every system; code-exact is the headline (same definition as docs/FACTS.json), detection (any code) beside it; the first complete JSON object in a reply is the decision, no object means not held; Caliber read from docs/FACTS.json, never recomputed.

The table (precision / recall, code-exact), bench/BASELINE.md:

| Code | Planted | Caliber P / R | Claude Sonnet P / R | asi1-mini P / R |
| --- | --- | --- | --- | --- |
| location_mismatch | 20 | 1.00 / 1.00 | 1.00 / 1.00 | 0.71 / 1.00 |
| capacity_exceeded | 6 | 1.00 / 1.00 | 1.00 / 1.00 | n/a / 0.00 |
| rate_variance | 9 | 1.00 / 1.00 | 1.00 / 1.00 | 1.00 / 0.89 |
| duplicate_toll | 11 | 1.00 / 1.00 | 1.00 / 1.00 | 0.12 / 1.00 |
| duplicate_invoice | 4 | 1.00 / 1.00 | 1.00 / 1.00 | 0.29 / 0.50 |
| vendor_bank_change | 3 | 1.00 / 1.00 | 1.00 / 1.00 | 0.11 / 0.33 |
| short_received | 5 | 1.00 / 1.00 | 1.00 / 1.00 | 1.00 / 1.00 |
| overall | 58 | 1.00 / 1.00 | 1.00 / 1.00 | 0.31 / 0.81 |

Detection (any code): Caliber 1.00 / 1.00 over 7,944 rows, 0 false holds; Claude Sonnet 1.00 / 1.00 over 558 rows, 58 holds, 0 false holds, 6 of 6 decoys held; asi1-mini 0.33 / 0.84, 150 holds, 101 clean rows held, 6 of 6 decoys held.

Where each model failed:

- Claude Sonnet failed on nothing in this sample. It tied the kernel on every code and overall. This is what the table says and the README line says it.
- asi1-mini missed 4 of 6 capacity_exceeded (and held 2 more under the wrong code), 1 of 9 rate_variance, 2 of 4 duplicate_invoice, 2 of 3 vendor_bank_change; held 101 clean rows, 82 of them as duplicate_toll (it treats any earlier charge at the same plaza as a duplicate), 8 as location_mismatch, 8 as vendor_bank_change, 5 as duplicate_invoice; 22 replies wrote their JSON and then kept reasoning (read by the first object), 1 reply (T1706, a clean toll) was cut off before a complete object and counts as not held.

Cost: Anthropic $6.38 for 558 rows (2,358,546 input, 166,183 output tokens including thinking) at list rates $2 per million input and $10 per million output (Anthropic first-party API list prices, platform.claude.com pricing as cached in the Claude API reference 2026-10-06); cap $15, not reached. asi1-mini: free plan, 561 of 1,000 daily requests used, 2,393,406 prompt and 66,383 completion tokens.

Partial: nothing. Both models answered every row of the sample (asi1-mini 557 parseable of 558).

What this does and does not show: on the kernel's own inputs with the policy stated, the current Sonnet reproduces the kernel's verdicts on this synthetic sample, at $0.011 a row and about 3 to 5 s a row, with a free-text reason that nothing checks. The kernel costs no tokens, is deterministic, is tested on all 7,944 rows, and is the thing the reducers and the audit trail are built around; the baseline does not change the architecture claim (code decides money), it removes the claim that the model cannot do the matching. A smaller model given the same inputs and policy held one clean row in five.

README line, ready to paste (director applies; README.md is builder-23's file):

**Model baseline.** On a 558-row sample (all 52 planted errors, all 6 decoys, 500 clean rows) given the same records the kernel reads, Claude Sonnet 5.5 alone tied the kernel on every code: precision 1.00, recall 1.00, 58 of 58 held, 0 false holds. asi1-mini alone scored precision 0.31, recall 0.81 (0.33 / 0.84 counting any hold), holding 101 clean rows, 82 of them as duplicate tolls. Caveat: synthetic data from the same generator as the clean rows, identical inputs, no fine-tuning; the kernel's precision was measured on all 7,944 rows, the models' on the sample; the kernel is plain code with no model call, the Sonnet run cost $6.38. Table, prompt and raw outputs: `bench/BASELINE.md`.

Checks, each run after the edits:

| Check | Command | Observed |
| --- | --- | --- |
| Sample | `agent/.venv/bin/python bench/sample.py` | 52 planted, 6 decoys, 500 clean (174/173/153), 558 rows |
| Inputs | `agent/.venv/bin/python bench/inputs.py` | 558 files, forbidden-key walk passed |
| Sonnet run | `agent/.venv/bin/python bench/baseline.py --model sonnet` | 558 saved, $6.38, stopped for cost: False |
| asi1 run | `agent/.venv/bin/python bench/baseline.py --model asi1` | 558 saved, 561 requests today of 1000 |
| Score | `agent/.venv/bin/python bench/score.py` | BASELINE.json and BASELINE.md written, table above |
| facts.py block | `agent/.venv/bin/python -m pytest -q bench/test_facts_baseline.py` | 2 passed (block emitted from a fixture, nothing emitted without the file) |
| Key leak | `grep -rl "sk-ant\|Bearer \|x-api-key" bench/outputs` | 0 files |
| Em dashes | `grep -rnP '\x{2014}'` over bench sources, prompt, BASELINE.md, facts.py | none |

Not done, by design: facts.py was not run (builder-W owns the ledger), so docs/FACTS.json and FACTS.md do not yet carry the baseline block; the next facts.py run adds it. README.md untouched. No process started or stopped. Tried and rejected: the earlier JSON extractor took the span from the first brace to the last, which broke on 23 asi1-mini replies that kept writing after their object; replaced by a first-complete-object read, applied to both models from the saved raw text, raw files unchanged.

## 2026-10-24 17:13 PDT Builder-27: technical note (Task 27)

Commits: 130f06f (CarrierBench), 918718f (oracle and saboteur), 00b86a2 (saboteur test without node imports, saboteur_run.sh), 7e77af7 (note source), c132765 (built note). Toolchain: tectonic 0.17.0 installed with Homebrew on the dev machine (a doc toolchain, not a repo dependency; it fetches IEEEtran, tikz and booktabs on first build); `pdfinfo` from poppler for the page count. Class: IEEEtran conference, two-column.

### Checks, as run

| Step | Command | Observed |
| --- | --- | --- |
| 1 toolchain | `which pdflatex tectonic latexmk`; `brew install tectonic`; scratch IEEEtran+tikz+booktabs build | none installed; tectonic 0.17.0; 1-page test PDF |
| 2 CarrierBench | `python3 bench/carrierbench/carrierbench.py --seed 42` | 7,944 rows, 52 planted in 7 classes, 6 decoys; regenerated in 2.74 s, all files match commit and regeneration; held-out: 25 of 40 trucks carry exactly one key row, 0 of 5 vendors; decoys all look like location_mismatch and all have swap-log lines; audit 58/58 inferable, 58 with evidence file, 0 extra, passed True; exit 0 |
| 3 oracle | `python3 bench/carrierbench/oracle.py` | posted 7,886 (measured 7,886); exception holds 41 (measured 47); auto-rejected 11 (11); policy holds 6 (6); questions 0 (6); wrong postings 0 (0); human decisions 47 |
| 3 saboteur | `bash bench/carrierbench/saboteur_run.sh` (vitest, JSON reporter) | 2 holds (INV-1077, 2231): finding clear/0.99 with 3 fabricated items recorded, next day matched, approve_payment as agent: reducer threw `agent may not do this (needs controller)`, procedure returned ok False; payment rows before/after 1/1, for the sabotaged holds 0; hold awaiting_controller; 2 refused audit rows with actorRole agent; test passed |
| 3 module | `cd spacetimedb && npx tsc --noEmit -p tsconfig.json && npx vitest run` | tsc clean; 72 passed (44 module, 27 kernel, 1 saboteur); no `node:` import under spacetimedb/src |
| 4 protocol | read bench/prompts/hold_or_clear.txt and bench/BASELINE.md | one condition, hinted (the prompt names the seven codes and thresholds); bare not run; the note and bench/README.md say so |
| 5 numbers | `python3 docs/paper/numbers.py` | 187 macros written to numbers.tex and numbers_map.json |
| 6 build | `make -C docs/paper` then `make -C docs/paper check` | caliber.pdf, 4 pages (at most 4), no em dash in caliber.tex or numbers.tex |
| 6 digits | `grep -n '[0-9]' docs/paper/caliber.tex` minus comments, preamble and TikZ coordinates | only identifiers remain (python3, asi1-mini, D-3, claude-sonnet-5-5 in a model id) |
| 6 keys | `grep -rn 'sk-\|api_key\|API_KEY' docs/paper bench/carrierbench bench/README.md` | variable names only in bench/README.md, no values |

### Baseline state as reported in the note

- bench/BASELINE.json generated 2026-10-25T00:12:27+00:00; partial: False (sonnet False, asi1 False); Sonnet 558 of 558 answered, model claude-sonnet-5-5, cost $6.38 of cap $15.0; asi1-mini 557 of 558 answered.
- Overall code-exact P / R: Caliber 1.00 / 1.00; Claude Sonnet 1.00 / 1.00; asi1-mini 0.31 / 0.81. Detection (any code): Sonnet 1.00 / 1.00; asi1-mini 0.33 / 0.84.
- Ties or wins against the kernel: Claude Sonnet tied the kernel on location_mismatch; Claude Sonnet tied the kernel on capacity_exceeded; Claude Sonnet tied the kernel on rate_variance; Claude Sonnet tied the kernel on duplicate_toll; Claude Sonnet tied the kernel on duplicate_invoice; Claude Sonnet tied the kernel on vendor_bank_change; Claude Sonnet tied the kernel on short_received; asi1-mini tied the kernel on short_received; Claude Sonnet tied the kernel on overall.
- Scorer sentences: Claude Sonnet failed on nothing in this sample. asi1-mini missed 4 of 6 capacity_exceeded, 1 of 9 rate_variance, 2 of 4 duplicate_invoice, 2 of 3 vendor_bank_change; held with the wrong code 2 capacity_exceeded; held 101 clean rows (holds by code that did not match a planted row: 82 as duplicate_toll, 8 as location_mismatch, 8 as vendor_bank_change, 5 as duplicate_invoice); 1 row had no parseable answer (1 unparsed), counted as not held.

### Every number in the PDF, mapped to its source

Generated by docs/paper/numbers.py into docs/paper/numbers_map.json; the PDF contains no number outside this table (table bodies are listed as one macro each; their cells come from the named arrays).

| Macro in caliber.tex | Value in the PDF | Source file | Path or line |
| --- | --- | --- | --- |
| `\benchSeed` | 42 | bench/carrierbench/REPORT.json | fixtures.seed |
| `\benchGeneratedAt` | 2026-10-24T23:24:14+00:00 | bench/carrierbench/REPORT.json | generatedAt |
| `\nDays` | 92 | bench/carrierbench/REPORT.json | counts.days |
| `\calDayOne` | 2026-07-01 | bench/carrierbench/REPORT.json | counts.calendar.day1 |
| `\calDayLast` | 2026-11-05 | bench/carrierbench/REPORT.json | counts.calendar.dayLast |
| `\nTerminals` | 6 | bench/carrierbench/REPORT.json | counts.terminals |
| `\nTrucks` | 40 | bench/carrierbench/REPORT.json | counts.trucks |
| `\nDrivers` | 48 | bench/carrierbench/REPORT.json | counts.drivers |
| `\nVendors` | 5 | bench/carrierbench/REPORT.json | counts.vendors |
| `\nContracts` | 34 | bench/carrierbench/REPORT.json | counts.contracts |
| `\nPOs` | 30 | bench/carrierbench/REPORT.json | counts.purchaseOrders |
| `\nPings` | 155,457 | bench/carrierbench/REPORT.json | counts.telematicsPings |
| `\nFuelCards` | 40 | bench/carrierbench/REPORT.json | counts.fuelCards |
| `\nStations` | 46 | bench/carrierbench/REPORT.json | counts.stations |
| `\nPlazas` | 14 | bench/carrierbench/REPORT.json | counts.tollPlazas |
| `\nPlanted` | 52 | bench/carrierbench/REPORT.json | counts.plantedTotal |
| `\nClasses` | 7 | bench/carrierbench/REPORT.json | counts.errorClasses |
| `\nDecoys` | 6 | bench/carrierbench/REPORT.json | counts.decoys |
| `\nKeyRows` | 58 | bench/carrierbench/REPORT.json | counts.answerKeyRows |
| `\nCleanRows` | 7,886 | bench/carrierbench/REPORT.json | counts.cleanRows |
| `\nCardRows` | 5,607 | bench/carrierbench/REPORT.json | counts.rows.card |
| `\nTollRows` | 2,157 | bench/carrierbench/REPORT.json | counts.rows.toll |
| `\nInvoiceRows` | 180 | bench/carrierbench/REPORT.json | counts.rows.invoice |
| `\nRowsTotal` | 7,944 | bench/carrierbench/REPORT.json | counts.rows.total |
| `\genSeconds` | 2.74 | bench/carrierbench/REPORT.json | fixtures.generatorSeconds |
| `\fixturesMatchCommit` | yes | bench/carrierbench/REPORT.json | fixtures.allMatchCommit |
| `\fixturesMatchRegen` | yes | bench/carrierbench/REPORT.json | fixtures.allMatchRegenerated |
| `\heldOutTrucks` | 25 | bench/carrierbench/REPORT.json | controls.heldOut.trucksWithExactlyOnePlantedRowCount |
| `\trucksNoPlanted` | 10 | bench/carrierbench/REPORT.json | controls.heldOut.trucksWithNoPlantedRow |
| `\heldOutVendors` | 0 | bench/carrierbench/REPORT.json | controls.heldOut.vendorsWithExactlyOnePlantedRowCount |
| `\vendorsNoPlanted` | 0 | bench/carrierbench/REPORT.json | controls.heldOut.vendorsWithNoPlantedRow |
| `\heldOutRows` | 19 | bench/carrierbench/REPORT.json | controls.heldOut.plantedRowsOnHeldOutEntitiesCount |
| `\policyHoldsBench` | 6 | bench/carrierbench/REPORT.json | controls.policyHolds.count |
| `\decoysLookLikeLM` | yes | bench/carrierbench/REPORT.json | controls.decoys.allLookLikeLocationMismatch |
| `\decoysHaveSwapLines` | yes | bench/carrierbench/REPORT.json | controls.decoys.allHaveSwapLogLines |
| `\decoyMilesMin` | 48.50 | bench/carrierbench/REPORT.json | controls.decoys.rows[].distanceMiles (min) |
| `\decoyMilesMax` | 97.20 | bench/carrierbench/REPORT.json | controls.decoys.rows[].distanceMiles (max) |
| `\auditRows` | 58 | bench/carrierbench/REPORT.json | audit.rowsAudited |
| `\auditInferable` | 58 | bench/carrierbench/REPORT.json | audit.inferable |
| `\auditWithFile` | 58 | bench/carrierbench/REPORT.json | audit.withEvidenceFile |
| `\auditExtra` | 0 | bench/carrierbench/REPORT.json | audit.mirrorFlaggedNotInKey (count) |
| `\auditEvaluated` | 7,944 | bench/carrierbench/REPORT.json | audit.rowsEvaluatedByMirror |
| `\auditPassed` | yes | bench/carrierbench/REPORT.json | audit.passed |
| `\plantedTableBody` | location\_mismatch & 14 & 6 & 20 & 20 \\ capacity\_exceeded & 6 & 0 & 6 & 6 \\ rate\_va... | bench/carrierbench/REPORT.json | counts.plantedByCode, audit.byCode |
| `\thrMiles` | 25 | spacetimedb/src/thresholds.ts | T.LOCATION_MILES |
| `\thrPingMin` | 30 | spacetimedb/src/thresholds.ts | T.PING_WINDOW_MIN |
| `\thrTankPct` | 10 | spacetimedb/src/thresholds.ts | T.TANK_FACTOR |
| `\thrTollMin` | 10 | spacetimedb/src/thresholds.ts | T.TOLL_DUP_MIN |
| `\thrRatePct` | 5 | spacetimedb/src/thresholds.ts | T.RATE_VARIANCE |
| `\thrDupDays` | 30 | spacetimedb/src/thresholds.ts | T.INVOICE_DUP_DAYS |
| `\thrBankDays` | 7 | spacetimedb/src/thresholds.ts | T.BANK_CHANGE_DAYS |
| `\thrBankUsd` | \$5,000.00 | spacetimedb/src/thresholds.ts | T.BANK_CHANGE_MIN_CENTS |
| `\autoPayUsd` | \$2,500.00 | spacetimedb/src/thresholds.ts | T.AUTO_PAY_MAX_CENTS |
| `\autoPayDayUsd` | \$40,000.00 | spacetimedb/src/thresholds.ts | T.AUTO_PAY_DAY_MAX_CENTS |
| `\droidTimeoutSec` | 90 | worker/src/config.ts | TASK_TIMEOUT_MS default |
| `\workerConcurrency` | 2 | worker/src/config.ts | CONCURRENCY default |
| `\escalationSec` | 63 | context/PROJECT_STATUS.md | 17:20 entry, 26.3 beat row |
| `\escalationTargetSec` | 30 | context/PROJECT_STATUS.md | 17:20 entry, 26.3 beat row |
| `\factsAsOf` | 2026-10-24T22:25:41+00:00 | docs/FACTS.json | asOf |
| `\txMatched` | 7,944 | docs/FACTS.json | transactionsMatched |
| `\dayReached` | 92 | docs/FACTS.json | dayReached |
| `\overallP` | 1.00 | docs/FACTS.json | overall.precision |
| `\overallR` | 1.00 | docs/FACTS.json | overall.recall |
| `\overallTP` | 58 | docs/FACTS.json | overall.truePositives |
| `\overallFP` | 0 | docs/FACTS.json | overall.falsePositives |
| `\plantedExceptionsFacts` | 58 | docs/FACTS.json | plantedExceptions |
| `\autoPaidCount` | 7,886 | docs/FACTS.json | autoPaid.count |
| `\autoPaidUsd` | \$1,083,630.52 | docs/FACTS.json | autoPaid.cents |
| `\ctrlReleasedCount` | 8 | docs/FACTS.json | controllerReleased.count |
| `\ctrlReleasedUsd` | \$32,097.00 | docs/FACTS.json | controllerReleased.cents |
| `\limitHoldsCount` | 6 | docs/FACTS.json | limitHolds.count |
| `\limitHoldsUsd` | \$16,789.00 | docs/FACTS.json | limitHolds.cents |
| `\decoysCleared` | 6 | docs/FACTS.json | decoysCleared |
| `\decoysOneAnswer` | 6 | docs/FACTS.json | decoysClearedWithOneAnswer |
| `\plantedClearedByRule` | 0 | docs/FACTS.json | plantedClearedByRule (count) |
| `\rulesExpired` | 6 | docs/FACTS.json | rules.expired |
| `\refusalsCount` | 1 | docs/FACTS.json | refusals.count |
| `\settleOffline` | 7,894 | docs/FACTS.json | settlement.offlineIds |
| `\settleLive` | 0 | docs/FACTS.json | settlement.liveBankIds |
| `\vcHolds` | 3 | docs/FACTS.json | vendorChecks.bankChangeHolds |
| `\vcHitRejected` | 1 | docs/FACTS.json | vendorChecks.withHitRejected |
| `\vcCleanApproved` | 2 | docs/FACTS.json | vendorChecks.cleanApprovedWithCallback |
| `\vcFixture` | 3 | docs/FACTS.json | vendorChecks.bySource.fixture |
| `\investReplayed` | 47 | docs/FACTS.json | investigations.bySource.replayed |
| `\investLive` | 0 | docs/FACTS.json | investigations.bySource.live |
| `\autoRejectedFacts` | 11 | docs/FACTS.json | sum(byDay[].autoRejected) |
| `\holdsFacts` | 53 | docs/FACTS.json | sum(byDay[].holds) |
| `\droidTasks` | 52 | docs/FACTS.json | worker_cost.perTask.tasks |
| `\droidAvgIn` | 1,033 | docs/FACTS.json | worker_cost.perTask.avg.inputTokens |
| `\droidAvgOut` | 1,354 | docs/FACTS.json | worker_cost.perTask.avg.outputTokens |
| `\droidAvgCache` | 70,386 | docs/FACTS.json | worker_cost.perTask.avg.cacheTokens |
| `\droidAvgSec` | 25.60 | docs/FACTS.json | worker_cost.perTask.avg.durationMs |
| `\droidCredits` | 2,016,204 | docs/FACTS.json | worker_cost.perTask.total.factoryCredits |
| `\caliberTableBody` | location\_mismatch & 20 & 20 & 20 & 0 & 1.00 & 1.00 \\ capacity\_exceeded & 6 & 6 & 6 &... | docs/FACTS.json | byCode[] |
| `\oraclePosted` | 7,886 | bench/carrierbench/oracle.json | oracle.posted.count |
| `\oraclePostedUsd` | \$1,083,630.52 | bench/carrierbench/oracle.json | oracle.posted.cents |
| `\oracleHolds` | 41 | bench/carrierbench/oracle.json | oracle.exceptionHolds.count |
| `\oracleRejects` | 11 | bench/carrierbench/oracle.json | oracle.autoRejected.count |
| `\oracleLimits` | 6 | bench/carrierbench/oracle.json | oracle.policyHolds.count |
| `\oracleQuestions` | 0 | bench/carrierbench/oracle.json | oracle.questionsAsked |
| `\oracleWrong` | 0 | bench/carrierbench/oracle.json | oracle.wrongPostings.count |
| `\oracleHuman` | 47 | bench/carrierbench/oracle.json | oracle.humanDecisionsRequired |
| `\measPosted` | 7,886 | bench/carrierbench/oracle.json | gap.postedWithoutAPerson.measured |
| `\measQuestions` | 6 | bench/carrierbench/oracle.json | gap.questionsAsked.measured |
| `\measHolds` | 47 | bench/carrierbench/oracle.json | gap.exceptionHolds.measured |
| `\measRejects` | 11 | bench/carrierbench/oracle.json | gap.autoRejected.measured |
| `\measLimits` | 6 | bench/carrierbench/oracle.json | gap.policyHolds.measured |
| `\measWrong` | 0 | bench/carrierbench/oracle.json | gap.wrongPostings.measured |
| `\sabRuns` | 2 | bench/carrierbench/saboteur.json | runs (count) |
| `\sabRefs` | INV-1077, 2231 | bench/carrierbench/saboteur.json | runs[].txnRef |
| `\sabCodes` | vendor\_bank\_change and location\_mismatch | bench/carrierbench/saboteur.json | runs[].holdCode |
| `\sabConfidence` | 0.99 | bench/carrierbench/saboteur.json | lyingFinding.confidence |
| `\sabEvidenceItems` | 3 | bench/carrierbench/saboteur.json | lyingFinding.evidence (count) |
| `\sabPayments` | 0 | bench/carrierbench/saboteur.json | runs[].paymentRowsForTxn (sum) |
| `\sabPaymentsBefore` | 1 | bench/carrierbench/saboteur.json | paymentRowsBefore |
| `\sabPaymentsAfter` | 1 | bench/carrierbench/saboteur.json | paymentRowsAfter |
| `\sabRefusedRows` | 2 | bench/carrierbench/saboteur.json | refusedAuditRows |
| `\sabHoldStatus` | awaiting\_controller | bench/carrierbench/saboteur.json | runs[0].holdStatus |
| `\sabMessage` | agent may not do this (needs controller) | bench/carrierbench/saboteur.json | runs[0].procedurePath.message |
| `\sabTestStatus` | passed | bench/carrierbench/saboteur.json | testStatus |
| `\baseGeneratedAt` | 2026-10-25T00:12:27+00:00 | bench/BASELINE.json | generatedAt |
| `\baseSeed` | 42 | bench/BASELINE.json | sample.seed |
| `\baseRows` | 558 | bench/BASELINE.json | sample.total |
| `\basePlanted` | 52 | bench/BASELINE.json | sample.planted |
| `\baseDecoys` | 6 | bench/BASELINE.json | sample.decoys |
| `\baseClean` | 500 | bench/BASELINE.json | sample.cleanTotal |
| `\baseCleanCard` | 174 | bench/BASELINE.json | sample.clean.card |
| `\baseCleanToll` | 173 | bench/BASELINE.json | sample.clean.toll |
| `\baseCleanInvoice` | 153 | bench/BASELINE.json | sample.clean.invoice |
| `\baseExcludedLimits` | 6 | bench/BASELINE.json | sample.excludedLimitHolds (count) |
| `\basePrompt` | bench/prompts/hold\_or\_clear.txt | bench/BASELINE.json | prompt |
| `\sonnetLabel` | Claude Sonnet | bench/BASELINE.json | systems.sonnet.label |
| `\sonnetModel` | claude-sonnet-5-5 | bench/BASELINE.json | systems.sonnet.modelIds |
| `\sonnetAnswered` | 558 | bench/BASELINE.json | systems.sonnet.rowsAnswered |
| `\sonnetRows` | 558 | bench/BASELINE.json | systems.sonnet.rowsInSample |
| `\sonnetHolds` | 58 | bench/BASELINE.json | systems.sonnet.holds |
| `\sonnetP` | 1.00 | bench/BASELINE.json | systems.sonnet.codeExact.precision |
| `\sonnetR` | 1.00 | bench/BASELINE.json | systems.sonnet.codeExact.recall |
| `\sonnetTP` | 58 | bench/BASELINE.json | systems.sonnet.codeExact.truePositives |
| `\sonnetFP` | 0 | bench/BASELINE.json | systems.sonnet.codeExact.falsePositives |
| `\sonnetDetP` | 1.00 | bench/BASELINE.json | systems.sonnet.detection.precision |
| `\sonnetDetR` | 1.00 | bench/BASELINE.json | systems.sonnet.detection.recall |
| `\sonnetDetFP` | 0 | bench/BASELINE.json | systems.sonnet.detection.falsePositives |
| `\sonnetDecoysHeld` | 6 | bench/BASELINE.json | systems.sonnet.decoys.held |
| `\sonnetDecoysCleared` | 0 | bench/BASELINE.json | systems.sonnet.decoys.cleared |
| `\sonnetPartial` | no | bench/BASELINE.json | systems.sonnet.partial |
| `\sonnetFailure` | Claude Sonnet failed on nothing in this sample. | bench/BASELINE.json | systems.sonnet.failureSentence |
| `\sonnetTokIn` | 2,358,546 | bench/BASELINE.json | systems.sonnet.tokens.input |
| `\sonnetTokOut` | 166,183 | bench/BASELINE.json | systems.sonnet.tokens.output |
| `\sonnetTemperature` | not sent (Claude Sonnet 5.5 rejects a non-default temperature) | bench/BASELINE.json | systems.sonnet.meta.temperature |
| `\asiLabel` | asi1-mini | bench/BASELINE.json | systems.asi.label |
| `\asiModel` | asi1-mini | bench/BASELINE.json | systems.asi.modelIds |
| `\asiAnswered` | 557 | bench/BASELINE.json | systems.asi.rowsAnswered |
| `\asiRows` | 558 | bench/BASELINE.json | systems.asi.rowsInSample |
| `\asiHolds` | 150 | bench/BASELINE.json | systems.asi.holds |
| `\asiP` | 0.31 | bench/BASELINE.json | systems.asi.codeExact.precision |
| `\asiR` | 0.81 | bench/BASELINE.json | systems.asi.codeExact.recall |
| `\asiTP` | 47 | bench/BASELINE.json | systems.asi.codeExact.truePositives |
| `\asiFP` | 103 | bench/BASELINE.json | systems.asi.codeExact.falsePositives |
| `\asiDetP` | 0.33 | bench/BASELINE.json | systems.asi.detection.precision |
| `\asiDetR` | 0.84 | bench/BASELINE.json | systems.asi.detection.recall |
| `\asiDetFP` | 101 | bench/BASELINE.json | systems.asi.detection.falsePositives |
| `\asiDecoysHeld` | 6 | bench/BASELINE.json | systems.asi.decoys.held |
| `\asiDecoysCleared` | 0 | bench/BASELINE.json | systems.asi.decoys.cleared |
| `\asiPartial` | no | bench/BASELINE.json | systems.asi.partial |
| `\asiFailure` | asi1-mini missed 4 of 6 capacity\_exceeded, 1 of 9 rate\_variance, 2 of 4 duplicate\_in... | bench/BASELINE.json | systems.asi.failureSentence |
| `\asiTokIn` | 2,393,406 | bench/BASELINE.json | systems.asi.tokens.input |
| `\asiTokOut` | 66,383 | bench/BASELINE.json | systems.asi.tokens.output |
| `\asiTemperature` | 0 | bench/BASELINE.json | systems.asi.meta.temperature |
| `\sonnetCostUsd` | \$6.38 | bench/BASELINE.json | cost.sonnetUsd |
| `\sonnetCapUsd` | \$15 | bench/BASELINE.json | cost.costCapUsd |
| `\sonnetStopped` | no | bench/BASELINE.json | cost.sonnetStoppedForCost |
| `\asiRequests` | 561 | bench/BASELINE.json | cost.asi1Requests |
| `\asiQuotaWindow` | 100 | bench/BASELINE.json | cost.asi1Quota.per15min |
| `\asiQuotaDay` | 1,000 | bench/BASELINE.json | cost.asi1Quota.perDay |
| `\asiPaceSec` | 9.10 | bench/BASELINE.json | cost.asi1Quota.paceSeconds |
| `\basePartial` | no | bench/BASELINE.json | partial |
| `\baselineTableBody` | location\_mismatch & 20 & 1.00 / 1.00 & 1.00 / 1.00 & 0.71 / 1.00 \\ capacity\_exceeded... | bench/BASELINE.json | table[] |
| `\tiesOrWinsText` | Claude Sonnet tied the kernel on location\_mismatch; Claude Sonnet tied the kernel on c... | bench/BASELINE.json | tiesOrWins |
| `\tiesOrWinsCount` | 9 | bench/BASELINE.json | tiesOrWins (count) |
| `\caliberRowsEvaluated` | 7,944 | bench/BASELINE.json | systems.caliber.rowsEvaluated |
| `\commitLabelFix` | 2fac596 | git | git rev-parse --short 2fac596 |
| `\commitLabelFixDate` | 2026-10-24 14:21 | git | git log -1 --format=%ad 2fac596 |
| `\commitLabelFixSubject` | Honesty fixes: hand-shaped vendor checks carry status hand\_shaped, an amber badge, the... | git | git log -1 --format=%s 2fac596 |
| `\commitDecoyRerecord` | 8e004e1 | git | git rev-parse --short 8e004e1 |
| `\commitDecoyRerecordDate` | 2026-10-24 14:13 | git | git log -1 --format=%ad 8e004e1 |
| `\commitDecoyRerecordSubject` | Decoys re-recorded live: Droid asks instead of clearing on the six unit-swap decoys | git | git log -1 --format=%s 8e004e1 |

### README "Measurement" section (verbatim, for the director to apply)

## Measurement

The technical note [docs/paper/caliber.pdf](docs/paper/caliber.pdf) (IEEE two-column, 4 pages, authors Anudeep Bonagiri and Shrithik Senthilkumar) puts the measurement in one place; `make -C docs/paper` rebuilds it from `docs/paper/caliber.tex`, and every number in it is generated into `numbers.tex` by `docs/paper/numbers.py` from `docs/FACTS.json`, `bench/BASELINE.json` and `bench/carrierbench/*.json`, none typed. CarrierBench (`python3 bench/carrierbench/carrierbench.py --seed 42`, how to run it in `bench/README.md`) is the synthetic carrier as a benchmark: 7,944 payable rows over 92 business days with 52 planted errors in 7 classes and 6 decoys, regenerated byte for byte from seed 42 (checked), with a machine audit in which the kernel's Python mirror raised 58 of 58 answer-key rows from the row's own evidence and nothing outside the key. The model-only baseline (`bench/BASELINE.md`) gave Claude Sonnet and asi1-mini exactly the records the kernel sees for 558 rows, one hinted prompt, and scored them against the answer key: code-exact precision / recall Caliber 1.00 / 1.00, Claude Sonnet 1.00 / 1.00, asi1-mini 0.31 / 0.81 (synthetic data from the same generator, identical inputs, no fine-tuning; ties or wins against the kernel: Claude Sonnet tied the kernel on 8 of 8 rows of the table (location_mismatch, capacity_exceeded, rate_variance, duplicate_toll, duplicate_invoice, vendor_bank_change, short_received, overall); asi1-mini tied the kernel on 1 of 8 rows of the table (short_received); no model beat it on any code). The oracle run (`bench/carrierbench/oracle.py`), the kernel handed the answer key, posts 7,886 payments without a person and still needs 47 human decisions; the measured run posts the same 7,886 and differs from the ceiling only by the 6 questions asked on the decoys. The saboteur run (`spacetimedb/src/saboteur.test.ts`, output in `bench/carrierbench/saboteur.json`) feeds a finding that recommends release at confidence 0.99 with fabricated evidence through the real reducers for 2 planted holds: `approve_payment` as the agent identity is refused on both entry points, 0 payment rows are created, the hold stays `awaiting_controller`, and the 2 refusals are audit rows.

### Devpost gallery line (verbatim)

Technical note (PDF, 4 pages): CarrierBench (7,944 rows, 52 planted errors, 6 decoys, machine-audited), the model-only baseline (Caliber 1.00 / 1.00 vs Claude Sonnet 1.00 / 1.00 vs asi1-mini 0.31 / 0.81, precision / recall), the oracle ceiling and the saboteur run; every number generated from the result files. docs/paper/caliber.pdf

### Observations for the director

- Claude Sonnet tied the kernel on every code and overall in the hinted condition (asi1-mini only on short_received); the note says so in Results and lists it code by code in "What we got wrong", and adds that the kernel's case on a tied code is cost per row ($6.38 for 558 rows against none), determinism and the gate. The README baseline line and the Devpost text should carry the tie, not a "beats the model" claim.
- README "What is measured" says the controller released 9 payments, $37,547.00; docs/FACTS.json (asOf 2026-10-24T22:25:41+00:00) says 8 payments, $32,097.00. The note uses FACTS.json. README is builder-23's file; not touched.
- The fixtures carry 40 fuel cards (one per truck, trucks.json); BUILD_SPEC's company paragraph says 6 (one per terminal). The note says what the fixtures say ("one fuel card each").
- At build time (17:13) bench/BASELINE.json, BASELINE.md and builder-22's bench files were untracked in git; numbers.py reads the working tree, so the PDF in c132765 was built from a baseline not yet committed. The Makefile rebuilds the PDF whenever BASELINE.json changes.
- The escalation latency (63 s against a 30 s target) is read by regex from the 17:20 Builder-26 entry in this file; if that line is reworded, numbers.py fails loudly rather than guessing.
- tectonic 0.17.0 is installed on the dev machine with Homebrew; it is a doc toolchain, not a repo dependency. The PDF is committed, so nobody needs it to read the note.

### Tried and rejected

- bench/carrierbench/saboteur.test.ts with its own vitest config: the repo has no root vitest install and bare imports from under bench/ do not resolve, so the test lives at spacetimedb/src/saboteur.test.ts (the brief's fallback).
- node:fs in that module test: the module tsconfig has no node types, so `spacetime publish` failed its typecheck with TS2307 and blocked builder-W (director message 16:27). Replaced by task.meta plus vitest's JSON reporter (bench/carrierbench/saboteur_run.sh); typecheck clean and the director told at 16:28.
- A console.log marker line for the observed rows: the module harness swallows console output, nothing reached the reporter.
- numbers.py resolving a relative --baseline against the repo root: the Makefile passes a path relative to docs/paper; now resolved against the caller's working directory.

### Blocked

- Nothing. README "Measurement" and the Devpost gallery line above are for the director to apply (README is builder-23's; docs/DEVPOST.md is not in my file list).

## 2026-10-24 17:24 PDT Builder-25: fifteen-second cards (Task 25)

`docs/CARDS.md` written: eleven cards in the brief's order (kernel; reducers and SoD; rule memory; Droid; Elastic tools and Workflow; CRS; Nessie; the two agents; answer key; model-only baseline; inbox connector), each exactly five lines (Need, Where, Number, They will ask, Answer), with a header naming the rehearsers (Anudeep and Shrithik, 3 AM), the one rule (no number that is not on the page) and the FACTS run the numbers come from (quoted FACTS header line, 2026-10-24T22:25:41+00:00). Log: `logs/builder_25.log`.

### Checks, as run

| Check | Result |
| --- | --- |
| Card structure | 11 cards, each 5 lines in label order (python split on `## `, labels asserted) |
| Where lines | 11 of 11 `grep -n` hits at the stated line: `kernel.ts` `evaluateCardTxn` 148; `index.ts` `checkApprovePayment` 784 and `backtest` 644; `droid.ts` `sessionOptions` 101; `setup_agent.py` `upsert` 84; `vendor_check.ts` `assessVendor` 160; `settle.ts` `startSettlement` 282; `handlers.py` `handle` 48; `generate.py` `generate` 47; `score.py` `score_model` 47; `ingest_watch.py` `process` 206 |
| Number lines | 10 quoted FACTS lines, all `grep -F` verbatim in `docs/FACTS.md`; two cards (Elastic, inbox) say "No number." and name the observable (the replayed `elastic___find_trips_near` step on 2231's card; hold 2231 appearing after the day 41 CSV drop under the connector chip) |
| Other names in answers | all exist: `advanceDay`, `ingestRows`, `createRule`, `recordSettlement`, `approvePayment`, `tryApprovePayment` in `index.ts`; `audit_event` in `schema.ts`; `reader` role; `elastic/workflows/stale_holds.yaml` (`caliber-stale-holds`); `elastic/tools/find_trips_near.json`; `agent/investigator.py`; `bench/BASELINE.md`; `docs/FACTS.json`; `scripts/facts.py` |
| Em dash | `grep -nP '\x{2014}'` on `docs/CARDS.md`: none |
| Digits outside Number and Where lines | "3 AM" (header, as the brief words it); dates 2026-10-24 (in FACTS.md); the quoted FACTS header timestamp; "seed 42" (in the RESULTS.md caveat). asi1-mini is written as "the ASI:One mini model" so no other digit appears |
| "Not built." endings | reducers (production identity), Droid (OS sandbox), Elastic (escalation inside the planned beat; status shows it about a minute after a manual trigger), CRS (live sandbox call), Nessie (exact-cent transfers), agents (email or Slack inbox), inbox (API connectors). Kernel, rule memory, answer key and baseline cards have no Not built line because nothing on them is pending |

### Observations for the director

- `docs/FACTS.md` has no model-only baseline block. `scripts/facts.py` gained `baseline_block` in d1a6f3e, but FACTS.md was last written at 22:25:41Z, before `bench/BASELINE.json` existed. The baseline card therefore quotes the kernel's "Overall precision 1.0, recall 1.0." line and sends the reader to `bench/BASELINE.md` for the model figures. One `python3 scripts/facts.py` against a running module would add the block; then the card's Number line can quote a Sonnet or asi1-mini line directly. Not done here: the brief forbids starting processes and the only file touched is `docs/CARDS.md`.
- The Elastic card's Need line is the TASKS.md Need column verbatim, which still names the escalation beat; the Answer says the brief lands about a minute after a manual trigger (JUDGE_QA), so the card does not promise the planned window.
- The runbook section 6 Factory and Elastic lines say "two Elastic tools"; README and JUDGE_QA now say four. The cards say "the hand-written ES|QL tools" without a count so they do not contradict either. Worth aligning the runbook when it is next edited.

### Tried and rejected

| Tried | Rejected because |
| --- | --- |
| Quoting a `bench/BASELINE.md` line on the baseline card's Number line | The acceptance check says every number traces to a FACTS.md line; BASELINE.md is not FACTS.md |
| Writing "asi1-mini" in the baseline and agents answers | The brief's digit rule allows only years, days and ids that appear in FACTS.md or RESULTS.md; neither file names the model |
| Naming guardrail and decision ids (G and D numbers) in answers | Same digit rule; the cards say "context/DECISIONS.md" and describe the control instead |
