# Dispatch Ledger

**The money does not move until the code has matched the line, and the agent can never approve what it proposed.**

An autonomous accounts-payable clerk for a 40-truck carrier. It matches every fuel, toll and maintenance charge against telematics and contracts in plain code, pays clean lines, holds the rest, hands each hold to an investigator (Factory's Droid over Elastic Agent Builder tools when keys are present; recorded or scripted findings offline, labelled as such), asks the fleet controller one question when it cannot decide (in ASI:One, or in the terminal twin that runs the same code), and turns the answer into a scoped rule that the database backtests before it is stored. All state and every permission check live in one SpacetimeDB module.

Links: dashboard (local, see Run it), video (to come), Agentverse profile (to come).

> Simulated carrier. Sandbox money. Every figure on screen and in this file is read from the ledger or from `docs/FACTS.json`. Not for operational use.

![tag:innovationlab](https://img.shields.io/badge/innovationlab-3D8BD3)
![tag:hackathon](https://img.shields.io/badge/hackathon-5F43F1)

## Principles

- **Code first.** The kernel (`spacetimedb/src/kernel.ts`) is pure TypeScript with integer cents. It never calls a model.
- **Agents for judgment.** Droid investigates and recommends. Its output type has no `pay`.
- **No agent is trusted.** Three identities (seed, agent, controller) in a `role` table; every reducer checks the caller first; the agent cannot approve, and the requester of a release cannot approve it either.
- **Ask once.** A controller answer becomes a rule with a scope and an expiry. The database backtests it before it is stored and refuses any rule that would clear a confirmed exception.
- **Audit-ready.** Every action is an `audit_event` row with the actor's role. Refusals persist when the action goes through the `try_*` procedures, which is how the agent, the scripts and the demo call the module; a reducer refusal rolls back with its transaction and only the caller sees the message.

## Seats it fills

The AP clerk who matches and codes bills. It asks the fleet controller, who approves payments, and never sits in that seat.

## Hold 2231, the worked case

| | |
| --- | --- |
| Transaction | Fuel, 120.0 gal, $412.00, Love's 412, Schulenburg TX, business day 41 |
| Card | FC-1017, assigned to truck 17 |
| Telematics | Truck 17 parked at the San Antonio terminal, engine off, 96 miles away |
| Kernel | `location_mismatch` (threshold 25 miles). Hold raised, task opened |
| Investigator | Recorded finding (hand-written in the shape of a record-mode run, labelled `replayed`): `find_trips_near` names truck 22 at the pump within the window; `swap_log.txt` line 8: Ortiz moved to unit 22, unit 17 in the shop. Every quote is verified against its source file or tool result before it is written |
| Question to the controller | Did Ramon Ortiz drive truck 22 that day while truck 17 was in the shop? |
| Answer | Yes, swapped trucks that week |
| Rule | `location_mismatch`, scope driver 23, days 41 to 46, one-time. Backtest by the module: would clear 1 past row, 0 confirmed exceptions |
| Verdict | The controller approves the rule (ASI:One at the table; `scripts/controller_sim.py` in the measured run, which reads only the public tables and the dispatcher's swap log); the kernel re-runs and clears 2231; the payment row is written with role `rule` |

## What is measured

`scripts/facts.py` writes `docs/FACTS.json`, `docs/FACTS.md` and `docs/RESULTS.md` from the public tables and the answer key; the tables below are copied from that output and say when. Last run 2026-10-24T20:35:56+00:00, 7944 transactions over 92 business days, produced by `scripts/full_run.sh` (fresh publish, fixtures, worker in replay, 92 days, the agent identity asking to approve INV-1077, the scripted controller pass, facts).

| Code | Planted | Raised | Precision | Recall |
| --- | --- | --- | --- | --- |
| location_mismatch | 20 | 20 | 1.0 | 1.0 |
| capacity_exceeded | 6 | 6 | 1.0 | 1.0 |
| rate_variance | 9 | 9 | 1.0 | 1.0 |
| duplicate_toll | 11 | 11 | 1.0 | 1.0 |
| duplicate_invoice | 4 | 4 | 1.0 | 1.0 |
| vendor_bank_change | 3 | 3 | 1.0 | 1.0 |
| short_received | 5 | 5 | 1.0 | 1.0 |

| Metric | Result |
| --- | --- |
| Overall precision and recall on the 58 answer-key rows (52 planted exceptions and 6 decoys) | 1.0 and 1.0 |
| Decoys (legitimate unit swaps) cleared through an approved rule after exactly one controller answer | 6 of 6 |
| Planted exceptions cleared by a rule | 0 |
| Policy holds from the auto-pay limit (correct behaviour, not exceptions) | 6 |
| Auto-paid by the kernel or a rule | 7886 payments, $1,083,630.52 |
| Released by the controller | 9 payments, $37,547.00 |
| Refusals in the audit trail, by role | {'agent': 1} |
| Investigations by source in the offline run | {'replayed': 47} |

The whole cycle runs in about ten seconds.

## How it works

1. `seed/generate.py` renders the company and plants 52 exceptions and 6 decoys, writing `seed/fixtures/answer_key.json`. In the demo path only `scripts/facts.py` reads the key; the generator's own mirror and the seed tests read it to prove the generator, and nothing in `spacetimedb/`, `worker/`, `agent/` or `web/` can.
2. `scripts/load_fixtures.ts` loads the rows through `seed_*` reducers as the seed identity (SpacetimeDB).
3. `advance_day`, a scheduled reducer, ticks every 2 seconds and runs `matchDay`: the kernel evaluates every row dated that day and writes `match_result`, then a `payment` or a `hold` plus an `agent_task` (SpacetimeDB).
4. `worker/` holds the agent identity, claims tasks with a version-locked `claim_task`, and runs Droid with scoped tools over the evidence folder and the Elastic MCP endpoint when `FACTORY_API_KEY` is set; offline it replays the two hand-written recordings and writes a deterministic stand-in for every other task, labelled `scripted stand-in, not a model` on the card (Factory, Elastic).
5. The controller talks to a uAgent on ASI:One: list holds, ask why, answer, approve a rule, approve a payment. Each is a `try_*` procedure call with the controller token (Fetch.ai).
6. `create_rule` backtests inside the database; `approve_rule` re-runs the kernel on the source transaction; the dashboard, subscribed anonymously to the public tables, shows all of it live (SpacetimeDB).

## Where Droid runs

See `worker/README.md` for the `createSession` options block quoted from the code and the tool ids confirmed from the SDK types. In short: `cwd` is the read-only evidence folder, `autonomyLevel: Off`, `disabledToolIds` for Execute, Edit, Create and ApplyPatch, a `permissionHandler` that allows only MCP tool calls, `mcpServers` pointing at `{KIBANA_URL}/api/agent_builder/mcp`, a 90 second `AbortController`, and a JSON schema output whose `recommendation` is one of `clear`, `hold`, `hold_and_ask`.

## Agent addresses

| Name | Handle | Address | Role | Code |
| --- | --- | --- | --- | --- |
| dispatch-ledger-controller | to come | `agent1q...` (filled after first run) | the controller's seat on ASI:One | `agent/` |

## Elastic

Indices `telematics_log` (geo_point), `receipts`, `contracts`, `invoices` for a Serverless project; two Agent Builder ES|QL tools, `find_trips_near` and `contract_rate_for_vendor`, exposed to Droid over MCP. Setup, ingest and smoke tests in `elastic/` with a dry-run mode; not yet run against a live project (see context/CLAIMS_AUDIT.md).

## SpacetimeDB

Module in `spacetimedb/src/`. Tables and access in `schema.ts`; reducers, procedures and the kernel driver in `index.ts`; thresholds in `thresholds.ts`. Three identities are minted with `POST /v1/identity` and granted by `grant_role`. The segregation-of-duties check is `checkApprovePayment` in `index.ts`.

## Settlement

When a payment row appears (kernel auto-pay, a rule clearing a hold, or a controller approval), the worker's settlement watcher (`worker/src/settle.ts`) makes one call to Capital One's Nessie per payment: a transfer from the carrier's Checking account to the payee (the invoice's vendor, or a single fuel-and-tolls payee for card and toll payments) described as `txn_ref <ref>`. It writes the returned transfer id with `record_settlement(txnRef, bankTxnId)`, an agent-only reducer that refuses without a payment row or when the payment is already settled, sets `payment.bank_txn_id` and adds a `settle` audit row the dashboard shows as "paid, bank id <id>". Live settlement needs `NESSIE_API_KEY`, `WORKER_MODE` other than `replay`, and the accounts `scripts/nessie_seed.py` writes to `seed/fixtures/nessie_accounts.json`; otherwise the id is `offline-<txnRef>` and the Queue says "settlement offline". The worker can settle a payment but never create one. Nessie is a mock bank: no money moves, and a bank id proves only that the mock recorded the transfer.

## Vendor checks

On a `vendor_bank_change` hold, and on a vendor's first invoice, nothing inside the carrier's data can say whether the vendor is who it claims to be. The module inserts an `agent_task` of kind `vendor_check` for both, and the worker (`worker/src/vendor_check.ts`, client in `worker/src/crs.ts`) asks the CRS Credit API three things about the business:

- business credit (`crs:business_credit`)
- public records: liens, judgments, bankruptcy (`crs:public_records`)
- OFAC screen (`crs:ofac`)

Only the vendor's business name goes out. No consumer credit, no driver or person data is ever sent. The result is rule-based, not a model: clean on all three suggests approve, which writes `hold` with the question "Vendor check clean: approve with a call-back note?"; any hit or failed call suggests escalate (an OFAC match suggests reject), which writes `hold_and_ask` with "Vendor has <reasons>; reject or call back?". The agent never rejects on its own, and `approve_payment` still demands a call-back note on a bank-change hold.

Live calls need `CRS_USERNAME` and `CRS_PASSWORD` and `WORKER_MODE` of `live` or `record` (the Droid key does not gate them); `record` also writes the raw responses to `seed/fixtures/vendor_checks/<vendorId>.json`. Without them the worker replays that file, labelled `replayed`, or writes a stand-in that says "Scripted stand-in, not a vendor check" with recommendation escalate and confidence 0. `CRS_DRY_RUN=1` prints the requests with credentials redacted and sends nothing. `CRS_FIXTURE_VARIANT=hit` replays `3.hit.json` instead of `3.json`. The dashboard shows a "Vendor check" block under the investigation with the three rows, the recommendation and a live, replayed or stand-in badge.

Sandbox caveat: the CRS account is a sandbox, so a live answer is sandbox data, not a real report on a real company, and the two vendor 3 fixtures are hand-shaped examples of a response, not recorded ones. The three endpoint paths and request bodies are pending the sandbox collection: they sit in `CRS_ENDPOINTS` in `worker/src/crs.ts`, marked `TODO(crs-sandbox)`.

## Run it

Tests first:

```
npm ci && (cd spacetimedb && npm ci && npx vitest run)
(cd worker && npm ci && npm test)
python3 -m venv seed/.venv && seed/.venv/bin/pip install -r seed/requirements.txt && seed/.venv/bin/python -m pytest -q seed
python3 -m venv agent/.venv && agent/.venv/bin/pip install -r agent/requirements.txt && agent/.venv/bin/python -m pytest -q agent
python3 -m venv elastic/.venv && elastic/.venv/bin/pip install -r elastic/requirements.txt && elastic/.venv/bin/python -m pytest -q elastic
```

Then the demo month, no model calls, no network:

```
scripts/demo_up.sh
scripts/clock.sh run
agent/.venv/bin/python -m agent.cli "what needs me"
python3 scripts/facts.py
```

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `STDB_URI`, `STDB_DB` | yes | local server and database name |
| `STDB_SEED_TOKEN` | yes | the publisher; loads fixtures |
| `STDB_AGENT_TOKEN` | yes | the worker; can never approve |
| `STDB_CONTROLLER_TOKEN` | yes | the ASI:One agent and the terminal CLI |
| `WORKER_MODE` | yes | `replay` for the offline demo, `record` or `live` with keys |
| `FACTORY_API_KEY` | live only | Droid SDK |
| `ELASTICSEARCH_URL`, `ELASTIC_API_KEY`, `KIBANA_URL` | live only | Serverless project and Agent Builder MCP |
| `ANTHROPIC_API_KEY` | optional | rule drafting and explanations; templates otherwise |
| `ASI_ONE_API_KEY`, `AGENT_SEED`, `AGENT_PORT` | agent | ASI:One free-text classification and the agent's address |

`scripts/demo_up.sh` exports every model key as empty on purpose so the offline run cannot make a paid call.

## Repo map

| Path | What |
| --- | --- |
| `spacetimedb/` | the module: schema, kernel, reducers, procedures, tests |
| `module_bindings/` | generated client bindings, committed |
| `worker/` | Droid investigator, replay, rule drafting |
| `agent/` | uAgent for ASI:One and its terminal twin |
| `web/` | read-only live dashboard |
| `elastic/` | mappings, ingest, Agent Builder tools and agent |
| `seed/` | generator, planted errors, answer key, evidence |
| `scripts/` | demo_up, clock, inject, facts, load_fixtures, mint_identities |
| `docs/` | CONTRACT.md, FACTS.json, not-built.md, notability/ |
| `context/` | PROJECT_STATUS.md, JUDGE_QA.md, CLAIMS_AUDIT.md |

## What is real and what is simulated

<!-- honesty:start -->
What is live: the module, the kernel, the clock, the roles and refusals, the dashboard subscriptions, the controller agent against the local database, the rule backtest. What is simulated: the company, the money, the vendors. What is replayed or scripted in the offline demo: the investigator's findings, labelled on every card. In the measured run of 2026-10-24T20:35:56+00:00, 0 investigations were produced by a live model, 47 replayed recorded findings, and 0 were scripted stand-ins, each labelled on its card. The audit trail recorded 1 refusal through the `try_*` procedures in that run, all by the agent role. Not built: `docs/not-built.md`. Everything fails toward no money moving.
<!-- honesty:end -->

## Team

Anudeep Bonagiri (UTSA, founder of Cruze) with review by Shrithik.
