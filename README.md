# Dispatch Ledger

**The money does not move until the code has matched the line, and the agent can never approve what it proposed.**

An autonomous accounts-payable clerk for a 40-truck carrier. It matches every fuel, toll and maintenance charge against telematics and contracts in plain code, pays clean lines, holds the rest, investigates each hold with Factory's Droid over Elastic Agent Builder tools, asks the fleet controller one question through ASI:One when it cannot decide, and turns the answer into a scoped, backtested rule. All state and every permission check live in one SpacetimeDB module.

Links: dashboard (local, see Run it), video (to come), Agentverse profile (to come).

> Simulated carrier. Sandbox money. Every figure on screen and in this file is read from the ledger or from `docs/FACTS.json`. Not for operational use.

![tag:innovationlab](https://img.shields.io/badge/innovationlab-3D8BD3)
![tag:hackathon](https://img.shields.io/badge/hackathon-5F43F1)

## Principles

- **Code first.** The kernel (`spacetimedb/src/kernel.ts`) is pure TypeScript with integer cents. It never calls a model.
- **Agents for judgment.** Droid investigates and recommends. Its output type has no `pay`.
- **No agent is trusted.** Three identities (seed, agent, controller) in a `role` table; every reducer checks the caller first; the agent cannot approve, and the requester of a release cannot approve it either.
- **Ask once.** A controller answer becomes a rule with a scope and an expiry. The database backtests it before it is stored and refuses any rule that would clear a confirmed exception.
- **Audit-ready.** Every action, and every refusal, is an `audit_event` row with the actor's role.

## Seats it fills

The AP clerk who matches and codes bills. It asks the fleet controller, who approves payments, and never sits in that seat.

## Hold 2231, the worked case

| | |
| --- | --- |
| Transaction | Fuel, 120.0 gal, $412.00, Love's 412, Schulenburg TX, business day 41 |
| Card | FC-1017, assigned to truck 17 |
| Telematics | Truck 17 parked at the San Antonio terminal, engine off, 96 miles away |
| Kernel | `location_mismatch` (threshold 25 miles). Hold raised, task opened |
| Investigator | `find_trips_near` over MCP: truck 22 at the pump within the window. `swap_log.txt`: Ortiz moved to unit 22, unit 17 in the shop |
| Question to the controller | Did Ramon Ortiz drive truck 22 that day while truck 17 was in the shop? |
| Answer | Yes, swapped trucks that week |
| Rule | `location_mismatch`, scope driver 23, days 41 to 46, one-time. Backtest by the module: would clear 1 past row, 0 confirmed exceptions |
| Verdict | Controller approves the rule in ASI:One; the kernel re-runs and clears 2231; the payment row is written with role `rule` |

## What is measured

All numbers below are written by `scripts/facts.py` into `docs/FACTS.json` and `docs/RESULTS.md`; nothing is typed by hand. Last run 2026-10-24T18:38:38+00:00, 7944 transactions over 92 business days.

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
| Overall precision and recall on 58 planted exceptions | 1.0 and 1.0 |
| Decoys (legitimate unit swaps) cleared through an approved rule after exactly one controller answer | 6 of 6 |
| Planted exceptions cleared by a rule | 0 |
| Policy holds from the auto-pay limit (correct behaviour, not exceptions) | 6 |
| Auto-paid by the kernel or a rule | 7886 payments, $1,083,630.52 |
| Released by the controller | 9 payments, $37,547.00 |
| Investigations by source in the offline run | {'none': 45, 'replayed': 2} |

The whole cycle (publish with empty data, load fixtures, 92 days, scripted controller pass, facts) runs in about ten seconds with `scripts/full_run.sh`.

## How it works

1. `seed/generate.py` renders the company and plants 52 exceptions and 6 decoys, writing `seed/fixtures/answer_key.json`. Only `scripts/facts.py` reads the key.
2. `scripts/load_fixtures.ts` loads the rows through `seed_*` reducers as the seed identity (SpacetimeDB).
3. `advance_day`, a scheduled reducer, ticks every 2 seconds and runs `matchDay`: the kernel evaluates every row dated that day and writes `match_result`, then a `payment` or a `hold` plus an `agent_task` (SpacetimeDB).
4. `worker/` holds the agent identity, claims tasks with a version-locked `claim_task`, and runs Droid with scoped tools over the evidence folder and the Elastic MCP endpoint, or replays recorded findings offline (Factory, Elastic).
5. The controller talks to a uAgent on ASI:One: list holds, ask why, answer, approve a rule, approve a payment. Each is a `try_*` procedure call with the controller token (Fetch.ai).
6. `create_rule` backtests inside the database; `approve_rule` re-runs the kernel on the source transaction; the dashboard, subscribed anonymously to the public tables, shows all of it live (SpacetimeDB).

## Where Droid runs

See `worker/README.md` for the `createSession` options block quoted from the code and the tool ids confirmed from the SDK types. In short: `cwd` is the read-only evidence folder, `autonomyLevel: Off`, `disabledToolIds` for Execute, Edit, Create and ApplyPatch, a `permissionHandler` that allows only MCP tool calls, `mcpServers` pointing at `{KIBANA_URL}/api/agent_builder/mcp`, a 90 second `AbortController`, and a JSON schema output whose `recommendation` is one of `clear`, `hold`, `hold_and_ask`.

## Agent addresses

| Name | Handle | Address | Role | Code |
| --- | --- | --- | --- | --- |
| dispatch-ledger-controller | to come | `agent1q...` (filled after first run) | the controller's seat on ASI:One | `agent/` |

## Elastic

Indices `telematics_log` (geo_point), `receipts`, `contracts`, `invoices` on a Serverless project; two Agent Builder ES|QL tools, `find_trips_near` and `contract_rate_for_vendor`, exposed to Droid over MCP. Setup and smoke tests in `elastic/`.

## SpacetimeDB

Module in `spacetimedb/src/`. Tables and access in `schema.ts`; reducers, procedures and the kernel driver in `index.ts`; thresholds in `thresholds.ts`. Three identities are minted with `POST /v1/identity` and granted by `grant_role`. The segregation-of-duties check is `checkApprovePayment` in `index.ts`.

## Run it

Tests first:

```
cd spacetimedb && npm install && npx vitest run
cd ../worker && npm install && npm test
cd ../seed && python3 -m pytest
cd ../agent && python3 -m pytest
```

Then the demo month, no model calls, no network:

```
scripts/demo_up.sh
scripts/clock.sh run
python3 -m agent.cli "what needs me"
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

## Status and honesty

What is live: the module, the kernel, the clock, the roles and refusals, the dashboard subscriptions, the controller agent against the local database, the rule backtest. What is simulated: the company, the money, the vendors. What is replayed or scripted in the offline demo: the investigator's findings, labelled on every card. Not built: `docs/not-built.md`. Everything fails toward no money moving.

## Team

Anudeep Bonagiri (UTSA, founder of Cruze) with review by Shrithik.
