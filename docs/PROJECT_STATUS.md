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

## Tried and rejected

| What | Why rejected |
| --- | --- |
| Private `agent_task` table with the worker subscribing | Clients cannot subscribe to private tables in 2.13; made operational tables public and kept company data private |
| `spacetime login` with GitHub for the local demo | Needs a browser and ties the publisher to a cloud identity; the demo mints a local identity with `POST /v1/identity` and logs the CLI in with that token |
| Worker-side backtest scored against the answer key | Agent code must never read the key; the module backtests against confirmed controller decisions instead |
| A pause button in the dashboard | Vite inlines env vars into the bundle, which would ship the controller token; pause is a terminal or ASI:One command |
