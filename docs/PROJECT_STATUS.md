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

## Tried and rejected

| What | Why rejected |
| --- | --- |
| Private `agent_task` table with the worker subscribing | Clients cannot subscribe to private tables in 2.13; made operational tables public and kept company data private |
| `spacetime login` with GitHub for the local demo | Needs a browser and ties the publisher to a cloud identity; the demo mints a local identity with `POST /v1/identity` and logs the CLI in with that token |
| Worker-side backtest scored against the answer key | Agent code must never read the key; the module backtests against confirmed controller decisions instead |
| A pause button in the dashboard | Vite inlines env vars into the bundle, which would ship the controller token; pause is a terminal or ASI:One command |
