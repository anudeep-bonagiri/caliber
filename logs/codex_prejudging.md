Reading additional input from stdin...
OpenAI Codex v0.160.0
--------
workdir: /Users/anudeepbonagiri/dev/hackathons/dispatch-ledger
model: gpt-6-sol
provider: openai
approval: never
sandbox: read-only
reasoning effort: high
reasoning summaries: none
session id: 01a16f36-e8b4-7451-acb5-c9dc38eee9e9
--------
user
Pre-judging audit of a hackathon repo. Read README.md, docs/FACTS.md, docs/RESULTS.md, docs/RUNBOOK.md, docs/not-built.md, context/CLAIMS_AUDIT.md, scripts/demo_up.sh, scripts/full_run.sh, scripts/controller_sim.py, scripts/facts.py, spacetimedb/src/index.ts, worker/src/replay.ts, agent/handlers.py. Answer three questions, concretely, under 60 lines total: (1) Which sentences in README.md or docs/DEVPOST.md claim more than the code and the facts file support? Quote each and say what would be accurate. (2) Does scripts/controller_sim.py or any script other than scripts/facts.py read seed/fixtures/answer_key.json or otherwise leak the key into the run (the README says only facts.py reads it)? (3) What is the single most likely way the offline demo at the judging table fails, given demo_up.sh and the runbook, and what one-line change prevents it? No style comments.
2026-10-24T18:40:33.018909Z ERROR rmcp::transport::worker: worker quit with fatal: Transport channel closed, when AuthRequired(AuthRequiredError { www_authenticate_header: "Bearer error=\"invalid_token\", error_description=\"No authorization provided\", resource_metadata=\"https://mcp.vercel.com/.well-known/oauth-protected-resource\"" })
codex
I’ll compare the public claims with the implementation and recorded results, then trace answer-key reads and the offline demo startup path.
exec
/bin/zsh -lc 'git status --short' in /Users/anudeepbonagiri/dev/hackathons/dispatch-ledger
 succeeded in 0ms:
?? logs/

exec
/bin/zsh -lc "rg --files -g 'AGENTS.md' -g 'README.md' -g 'DEVPOST.md' -g 'FACTS.md' -g 'RESULTS.md' -g 'RUNBOOK.md' -g 'not-built.md' -g 'CLAIMS_AUDIT.md' -g 'demo_up.sh' -g 'full_run.sh' -g 'controller_sim.py' -g 'facts.py' -g 'index.ts' -g 'replay.ts' -g 'handlers.py'" in /Users/anudeepbonagiri/dev/hackathons/dispatch-ledger
 succeeded in 0ms:
spacetimedb/src/index.ts
module_bindings/index.ts
worker/src/index.ts
worker/src/replay.ts
worker/README.md
scripts/controller_sim.py
scripts/demo_up.sh
scripts/full_run.sh
scripts/facts.py
README.md
agent/README.md
agent/handlers.py
context/CLAIMS_AUDIT.md
docs/notability/README.md
docs/DEVPOST.md
docs/FACTS.md
docs/RESULTS.md
docs/not-built.md
docs/RUNBOOK.md
seed/README.md
elastic/README.md
web/README.md

exec
/bin/zsh -lc "rg -n 'answer_key|facts\\.py|controller_sim|offline|demo_up|full_run|DEVPOST' . --glob '"'!node_modules/**'"' --glob '"'!target/**'"'" in /Users/anudeepbonagiri/dev/hackathons/dispatch-ledger
 succeeded in 29ms:
./README.md:42:All numbers below are written by `scripts/facts.py` into `docs/FACTS.json` and `docs/RESULTS.md`; nothing is typed by hand. Last run 2026-10-24T18:38:38+00:00, 7944 transactions over 92 business days.
./README.md:62:| Investigations by source in the offline run | {'none': 45, 'replayed': 2} |
./README.md:64:The whole cycle (publish with empty data, load fixtures, 92 days, scripted controller pass, facts) runs in about ten seconds with `scripts/full_run.sh`.
./README.md:68:1. `seed/generate.py` renders the company and plants 52 exceptions and 6 decoys, writing `seed/fixtures/answer_key.json`. Only `scripts/facts.py` reads the key.
./README.md:71:4. `worker/` holds the agent identity, claims tasks with a version-locked `claim_task`, and runs Droid with scoped tools over the evidence folder and the Elastic MCP endpoint, or replays recorded findings offline (Factory, Elastic).
./README.md:107:scripts/demo_up.sh
./README.md:110:python3 scripts/facts.py
./README.md:121:| `WORKER_MODE` | yes | `replay` for the offline demo, `record` or `live` with keys |
./README.md:127:`scripts/demo_up.sh` exports every model key as empty on purpose so the offline run cannot make a paid call.
./README.md:140:| `scripts/` | demo_up, clock, inject, facts, load_fixtures, mint_identities |
./README.md:146:What is live: the module, the kernel, the clock, the roles and refusals, the dashboard subscriptions, the controller agent against the local database, the rule backtest. What is simulated: the company, the money, the vendors. What is replayed or scripted in the offline demo: the investigator's findings, labelled on every card. Not built: `docs/not-built.md`. Everything fails toward no money moving.
./worker/src/replay.ts:55:    note: `Recorded from a live Droid run in WORKER_MODE=record. Replayed verbatim when the worker runs offline.`,
./worker/src/config.ts:2:// Replay is forced when FACTORY_API_KEY is empty so an offline demo can never make a paid Droid call.
./scripts/controller_sim.py:2:"""A scripted fleet controller for the offline run.
./scripts/controller_sim.py:12:Usage: python scripts/controller_sim.py [--rounds 30] [--sleep 3] [--dry-run]
./worker/src/rules.ts:3:// The answer key (seed/fixtures/answer_key.json) is never read here. Only public tables are used.
./context/CLAIMS_AUDIT.md:3:Every claim in the README, the Devpost text and the video, with where it is made, what backs it, and a verdict: backed, softened, removed, or not verifiable. Run Sunday after the offline run. Backing must be a named test, a dated status entry, or a command run for the audit.
./context/CLAIMS_AUDIT.md:24:| 18 | The company is simulated and the key is published | README disclaimer | `seed/fixtures/answer_key.json` in the repo | backed |
./docs/FACTS.md:3:Written by scripts/facts.py at 2026-10-24T18:38:38+00:00. Nothing in it is typed by hand.
./worker/README.md:3:The autonomous accounts-payable clerk's hands. It is the only process that holds the `agent` identity and the Factory and Elastic keys. It claims investigation tasks from the SpacetimeDB module, runs Factory's Droid SDK (or replays recorded findings offline), drafts and backtests rules, and writes results back through role-checked reducers.
./worker/README.md:21:- Read `seed/fixtures/answer_key.json`. The backtest uses `match_result` and `hold` only.
./worker/README.md:26:`WORKER_MODE` selects the mode. An empty `FACTORY_API_KEY` forces `replay` whatever the variable says, so an offline demo cannot make a paid Droid call by accident.
./elastic/README.md:23:.venv/bin/python -m pytest -q tests          # offline, no network
./elastic/README.md:180:| `tests/test_elastic.py` | offline pytest suite |
./context/PROJECT_STATUS.md:31:- First full run exposed four duplicate_invoice false positives (recurring same-amount invoices under alternating POs colliding with planted duplicates) and a facts.py option-decoding bug. Both fixed; the kernel was right.
./context/JUDGE_QA.md:27:**How do you know precision and recall?** `scripts/facts.py` reads the public tables anonymously and the answer key, and writes `docs/FACTS.json`. It is the only program allowed to read the key.
./docs/RESULTS.md:3:Run date: 2026-10-24T18:38:38+00:00. Rerun: `scripts/full_run.sh` (fresh publish, fixtures, worker in replay, 92 days, scripted controller pass, then this file).
./seed/plant.py:144:    """Add planted card and toll rows, assign ids, return (card_txns, tolls, answer_key_rows)."""
./worker/test/replay.test.ts:80:    expect(loadFixture(FIXTURES, '../answer_key')).toBeUndefined();
./docs/not-built.md:10:- Rule drafting by a model is optional and off in the offline demo; the deterministic draft (driver scope, five-day window) is what the judges see unless an Anthropic key is present.
./seed/generate.py:77:    dump(out / "answer_key.json", key)
./seed/generate.py:108:                   "answer_key_rows": len(key)},
./seed/fixtures/summary.json:8:    "answer_key_rows": 58,
./docs/CONTRACT.md:80:`rule.backtest_json` is computed by the module itself inside `create_rule` from `match_result` and `hold` (the worker's own numbers are stored under `workerPreview` for comparison; the answer key is never read by anything but `scripts/facts.py`):
./docs/CONTRACT.md:137:| `answer_key.json` | `[{"txnRef", "code", "expected": "hold" \| "auto_reject" \| "clear_after_question", "note"}]`. Read only by `scripts/facts.py`. |
./seed/mirror.py:176:    key = json.loads((fx / "answer_key.json").read_text())
./scripts/demo_up.sh:3:#   scripts/demo_up.sh            start everything (server, module, identities, fixtures, worker in replay, web)
./scripts/demo_up.sh:4:#   scripts/demo_up.sh --no-web   skip the web dev server
./scripts/demo_up.sh:6:# so the offline run cannot make a paid call by accident.
./scripts/demo_up.sh:79:  python3 scripts/facts.py    recompute docs/FACTS.json from the ledger
./web/src/lib/useModuleIdentity.ts:19:        // offline or wrong URI; requester role falls back to the reason prefix
./docs/RUNBOOK.md:23:- [ ] One full 92-day run, then `python3 scripts/facts.py` once, then open `docs/FACTS.md`. Those are the only numbers you may say. Never run `facts.py` at the table: it overwrites `docs/FACTS.json` and `web/public/FACTS.json` with whatever day the clock is on.
./docs/RUNBOOK.md:25:- [ ] Measured times: `demo_up.sh` ____ s, `run_days.ts --until 40` ____ s, uAgent mailbox ready ____ s.
./docs/RUNBOOK.md:32:scripts/demo_up.sh
./docs/RUNBOOK.md:47:Start it after `demo_up.sh`, never before. Expect `dispatch-ledger-controller address agent1q...`, `Agent Inspector: ...` and `ledger http://127.0.0.1:3100 db dispatch-ledger model on` (or `model off (regex + last-hold fallback)` without `ASI_ONE_API_KEY`). Give the mailbox fifteen seconds, then send `status` from the second laptop.
./docs/RUNBOOK.md:160:Expect `kernel verdict: location_mismatch` with `distanceMiles` far above `thresholdMiles: 25`. Dashboard: a new hold under `location_mismatch` in the Queue; within a second the card's badge reads `scripted stand-in, not a model` (only 2231 and INV-1077 have recorded findings), and the `model offline` pill may appear. Both are the labels working.
./docs/RUNBOOK.md:176:An injected row stays in `card_txn` after `scripts/clock.sh reset` and is matched again on that day of the next replay, raised by the database this time. Run `scripts/demo_up.sh` at a long break to clear them.
./docs/RUNBOOK.md:204:| ASI:One replies `Ledger error` or a role refusal it should not | `demo_up.sh` ran after the uAgent started; it holds an old token. Restart A1. Use B1 meanwhile. | "Restarting the chat seat; the ledger is fine." |
./docs/RUNBOOK.md:207:| `clock.sh status` fails, CLI says `ledger unreachable` | Server died. Stop the old worker and web, run `scripts/demo_up.sh` (two minutes), restart A1, re-stage to day 40. Play the recording meanwhile. | "Fresh publish; every number on screen will come back from the ledger." |
./docs/RUNBOOK.md:211:pkill -f 'tsx src/index.ts'; lsof -ti :5173 | xargs kill     # before re-running demo_up.sh
./docs/RUNBOOK.md:220:1. Is the company real? No; `seed/generate.py` makes it with seed 42 and a published key. `seed/fixtures/answer_key.json`
./docs/RUNBOOK.md:246:3. Was that live? Read the badge; the table demo runs `WORKER_MODE=replay` with every key empty, so it says `replayed` or `scripted stand-in`. `scripts/demo_up.sh`
./.env.example:1:# SpacetimeDB (local demo server; see scripts/demo_up.sh)
./scripts/mint_identities.py:67:        print("STDB_SEED_TOKEN missing from .env; run scripts/demo_up.sh or spacetime login show --token", file=sys.stderr)
./seed/README.md:4:(2026-07-01 to 2026-11-05, weekdays only), plus the evidence folder and `answer_key.json`.
./seed/README.md:30:about 35 percent. Local time is UTC-5 for all 92 days. No code outside `scripts/facts.py` may read `answer_key.json`.
./logs/codex_prejudging.md:14:Pre-judging audit of a hackathon repo. Read README.md, docs/FACTS.md, docs/RESULTS.md, docs/RUNBOOK.md, docs/not-built.md, context/CLAIMS_AUDIT.md, scripts/demo_up.sh, scripts/full_run.sh, scripts/controller_sim.py, scripts/facts.py, spacetimedb/src/index.ts, worker/src/replay.ts, agent/handlers.py. Answer three questions, concretely, under 60 lines total: (1) Which sentences in README.md or docs/DEVPOST.md claim more than the code and the facts file support? Quote each and say what would be accurate. (2) Does scripts/controller_sim.py or any script other than scripts/facts.py read seed/fixtures/answer_key.json or otherwise leak the key into the run (the README says only facts.py reads it)? (3) What is the single most likely way the offline demo at the judging table fails, given demo_up.sh and the runbook, and what one-line change prevents it? No style comments.
./logs/codex_prejudging.md:17:I’ll compare the public claims with the implementation and recorded results, then trace answer-key reads and the offline demo startup path.
./web/README.md:31:Two charts read `/FACTS.json` (copy `docs/FACTS.json` into `public/`). A `model offline` pill appears when the newest investigated task has `source = none`.
./scripts/full_run.sh:5:# Usage: scripts/full_run.sh [--keep-worker]
./scripts/full_run.sh:16:curl -sf http://127.0.0.1:3100/v1/ping >/dev/null || { echo "local SpacetimeDB is not running on 3100; run scripts/demo_up.sh first"; exit 1; }
./scripts/full_run.sh:48:python3 scripts/controller_sim.py --rounds 30 --sleep 2 | tail -4
./scripts/full_run.sh:51:python3 scripts/facts.py | sed -n '5,40p'
./web/src/components/Charts.tsx:65:  const label = 'from docs/FACTS.json, written by scripts/facts.py';
./web/src/components/Charts.tsx:93:        docs/FACTS.json is not served at /FACTS.json. Run scripts/facts.py and copy the file into web/public/ to see exceptions by code and precision and recall.
./web/src/components/Charts.tsx:147:            Precision and recall by code <span className="text-faint">(FACTS.byCode, against seed/fixtures/answer_key.json)</span>
./scripts/facts.py:5:which this script writes. It is the only program in the repository that reads seed/fixtures/answer_key.json.
./scripts/facts.py:7:Usage: python scripts/facts.py [--uri http://127.0.0.1:3100] [--db dispatch-ledger] [--key seed/fixtures/answer_key.json]
./scripts/facts.py:53:    ap.add_argument("--key", default=str(ROOT / "seed/fixtures/answer_key.json"))
./scripts/facts.py:183:    md = ["# Facts", "", f"Written by scripts/facts.py at {facts['asOf']}. Nothing in it is typed by hand.", "",
./scripts/facts.py:203:        f"Run date: {facts['asOf']}. Rerun: `scripts/full_run.sh` (fresh publish, fixtures, worker in replay, 92 days, scripted controller pass, then this file).",
./web/src/components/TopBar.tsx:53:            model offline
./seed/tests/test_seed.py:38:    data["answer_key"] = json.loads((FIXTURES / "answer_key.json").read_text())
./seed/tests/test_seed.py:124:    capacity_refs = {r["txnRef"] for r in fx["answer_key"] if r["code"] == "capacity_exceeded"}
./seed/tests/test_seed.py:145:def test_answer_key_counts(fx):
./seed/tests/test_seed.py:146:    key = fx["answer_key"]
./seed/tests/test_seed.py:170:    row = next(r for r in fx["answer_key"] if r["txnRef"] == "2231")
./seed/tests/test_seed.py:182:    row = next(r for r in fx["answer_key"] if r["txnRef"] == "INV-1077")
./seed/tests/test_seed.py:188:    lm = [cards[r["txnRef"]] for r in fx["answer_key"] if r["code"] == "location_mismatch" and r["expected"] == "hold"]
./seed/tests/test_seed.py:189:    decoys = [cards[r["txnRef"]] for r in fx["answer_key"] if r["expected"] == "clear_after_question"]
./seed/tests/test_seed.py:199:    for r in fx["answer_key"]:
./seed/tests/test_seed.py:216:    mirror.compare_with_key(res, fx["answer_key"])
./seed/tests/test_seed.py:243:    planted = {r["txnRef"] for r in fx["answer_key"] if r["code"] == "duplicate_invoice"}
./seed/tests/test_seed.py:255:    planted = {r["txnRef"] for r in fx["answer_key"] if r["code"] == "duplicate_toll"}
./seed/maintenance.py:106:    """Returns (contracts, pos, invoices, answer_key_rows, info). Ids are assigned here."""

exec
/bin/zsh -lc 'cat README.md docs/DEVPOST.md' in /Users/anudeepbonagiri/dev/hackathons/dispatch-ledger
exec
/bin/zsh -lc 'cat scripts/controller_sim.py scripts/facts.py' in /Users/anudeepbonagiri/dev/hackathons/dispatch-ledger
exec
/bin/zsh -lc 'cat docs/RUNBOOK.md scripts/demo_up.sh scripts/full_run.sh' in /Users/anudeepbonagiri/dev/hackathons/dispatch-ledger
exec
/bin/zsh -lc 'cat docs/FACTS.md docs/RESULTS.md docs/not-built.md context/CLAIMS_AUDIT.md' in /Users/anudeepbonagiri/dev/hackathons/dispatch-ledger
exec
/bin/zsh -lc 'cat spacetimedb/src/index.ts worker/src/replay.ts agent/handlers.py' in /Users/anudeepbonagiri/dev/hackathons/dispatch-ledger
 succeeded in 0ms:
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
| Overall precision and recall on the 58 answer-key rows (52 planted exceptions and 6 decoys) | 1.0 and 1.0 |
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
# Devpost draft

Title: Dispatch Ledger

Tagline: An AP clerk for a trucking fleet that pays what the code can prove and asks a human about the rest.

Tracks to tag: Hyphenate, SpacetimeDB, Fetch.ai, Factory, Elastic, Notability, Microsoft. (CRS only if built.)

## Inspiration

I run a fleet software company. The back office of every carrier we talk to has one person matching fuel-card statements against trucks that may not have been where the card was. We built the clerk that does that match in code and knows when to ask.

## What it does

Matches every fuel, toll and maintenance charge for a simulated 40-truck Texas carrier against telematics, tank sizes, prior tolls, POs, contract rates, receiving and vendor bank changes. Clean lines pay under auto-pay limits. Holds get an investigator (Factory Droid) with scoped tools over Elastic, a question to the controller on ASI:One, and the answer becomes a scoped, backtested, expiring rule enforced by the kernel.

## How we built it

One SpacetimeDB TypeScript module holds all state and every permission check: three identities in a role table, a scheduled reducer that advances the business day, procedures that commit refusals to the audit trail. A pure kernel in integer cents. A Node worker running the Droid SDK with autonomy Off and only MCP tool calls allowed. A Python uAgent on Agentverse as the controller's seat. A read-only React dashboard subscribed anonymously to public tables.

## Challenges

The CLI installed 2.13 the morning of, not the 2.10 we had verified against. A thrown refusal rolls back its own audit row, so we added procedures that commit the refusal first. The backtest had to move into the database because agent code may never read the answer key.

## Accomplishments

From docs/FACTS.json: recall 1.0 and precision 1.0 on 58 answer-key rows (52 planted exceptions and 6 decoys) across seven classes over 7944 transactions; 6 of 6 legitimate truck swaps cleared through a backtested rule after exactly one controller answer; zero planted exceptions cleared by a rule; every refusal, including the agent identity trying to approve a payment, is a row in the audit trail with its role.

## What we learned

Controls belong in the database, not in prompts. A model that cannot pay is easy to trust.

## What is next

Real fuel-card and telematics connectors for the pilot fleet; the rule memory as the product.

## Built with

spacetimedb, typescript, node, react, vite, python, uagents, asi-one, factory-droid-sdk, elasticsearch, agent-builder, zod, vitest, pytest

## Video

To come: 3:30, opens on hold 2231.

 succeeded in 0ms:
# Facts

Written by scripts/facts.py at 2026-10-24T18:38:38+00:00. Nothing in it is typed by hand.

Day reached: 92 of 92. Transactions matched: 7944.

| Code | Planted | Raised | True positives | False positives | Precision | Recall |
| --- | --- | --- | --- | --- | --- | --- |
| location_mismatch | 20 | 20 | 20 | 0 | 1.0 | 1.0 |
| capacity_exceeded | 6 | 6 | 6 | 0 | 1.0 | 1.0 |
| rate_variance | 9 | 9 | 9 | 0 | 1.0 | 1.0 |
| duplicate_toll | 11 | 11 | 11 | 0 | 1.0 | 1.0 |
| duplicate_invoice | 4 | 4 | 4 | 0 | 1.0 | 1.0 |
| vendor_bank_change | 3 | 3 | 3 | 0 | 1.0 | 1.0 |
| short_received | 5 | 5 | 5 | 0 | 1.0 | 1.0 |

Overall precision 1.0, recall 1.0.
Decoys cleared through an approved rule: 6 of 6 (6 with exactly one controller answer).
Planted exceptions cleared by a rule: 0 (must be 0).
Policy holds (auto-pay limit, not exceptions): 6.
Auto-paid by the kernel or a rule: 7886 payments, $1,083,630.52.
Released by the controller: 9 payments, $37,547.00.
Refusals recorded in the audit trail: 0 ({}).
Investigations by source: {'none': 45, 'replayed': 2}; by status: {'investigated': 47}.

# Results

Run date: 2026-10-24T18:38:38+00:00. Rerun: `scripts/full_run.sh` (fresh publish, fixtures, worker in replay, 92 days, scripted controller pass, then this file).

| Metric | Result | Target |
| --- | --- | --- |
| Recall on planted exceptions (58) | 1.0 | 1.0 |
| Precision on raised exceptions | 1.0 | at or above 0.95 |
| Decoys cleared through an approved rule | 6 of 6 | 6 of 6 |
| Decoys cleared with exactly one controller answer | 6 of 6 | 6 of 6 |
| Planted exceptions cleared by a rule | 0 | 0 |
| Duplicate tolls auto-rejected without a task | 11 | 11 |
| Days replayed | 92 | 92 |
| Policy holds (auto-pay limit) | 6 | reported, not scored |

## Hard negatives

The six decoys are legitimate unit swaps recorded in the dispatcher's swap log. Under the kernel they are indistinguishable from card misuse until the controller answers.

| Decoy | Raised | Question asked | Answers | Rule | Backtest n | Confirmed exceptions covered | Cleared |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1421 | True | True | 1 | 1 | 1 | 0 | True |
| 2044 | True | True | 1 | 2 | 1 | 0 | True |
| 2231 | True | True | 1 | 3 | 1 | 0 | True |
| 3955 | True | True | 1 | 4 | 1 | 0 | True |
| 5428 | True | True | 1 | 5 | 1 | 0 | True |
| 5986 | True | True | 1 | 6 | 1 | 0 | True |

## History

- First full run (fixtures from 11:18): duplicate_invoice precision 0.5 because recurring same-amount invoices under alternating POs collided with the planted duplicates. Fixed in the generator, not the kernel.
- A facts bug counted every option-typed `rule_id` as set (SQL encodes none as `[1, []]`); fixed before the second run.
- Second run on the final fixtures: every target met.

## Caveat

The company, the money and the vendors are synthetic, generated by seed/generate.py with seed 42, and the planted errors come from the same generator that made the clean rows. Recall and precision therefore measure whether the kernel finds what we planted, not how it would behave on a real carrier's statements. Investigations in this run are scripted stand-ins or hand-written recordings, labelled as such; no live model produced a finding.

# Not built

"Not built" is a complete answer. Say it without a wince.

- Real connectors. There is no fuel-card, toll-authority, telematics or accounting integration. Every row comes from `seed/generate.py` with seed 42 and a published answer key.
- Payment execution. A `payment` row is the end of the line. Nothing moves money to a bank.
- OCR or document extraction. Receipts and invoices are rendered as text from the same generator that made the rows; the kernel reads rows, not documents. The optional fine-tuning benchmark (Task 14 in the plan) was not attempted.
- Multi-entity, multi-currency, tax. One carrier, US dollars, cents as integers.
- Production identity. Roles are a table of identities granted by the publisher. No OIDC provider, no key rotation, no per-user dashboard login.
- Rule drafting by a model is optional and off in the offline demo; the deterministic draft (driver scope, five-day window) is what the judges see unless an Anthropic key is present.
- Live Droid and live Elastic runs are gated on keys the demo laptop does not export. Replay mode serves recorded or scripted findings and labels them as such on every card.
- A controller inbox beyond ASI:One and the terminal twin (no email, no Slack).
- Horizontal scale. One module, one worker (concurrency 2), one local server.
# Claims audit

Every claim in the README, the Devpost text and the video, with where it is made, what backs it, and a verdict: backed, softened, removed, or not verifiable. Run Sunday after the offline run. Backing must be a named test, a dated status entry, or a command run for the audit.

| # | Claim | Where | Backing | Verdict |
| --- | --- | --- | --- | --- |
| 1 | The kernel never calls a model | README Principles | `spacetimedb/src/kernel.ts` imports only `./thresholds`; grep for `fetch`, `http`, `anthropic` returns nothing | backed |
| 2 | Money is integer cents everywhere | README Principles | `t.i64()` on every cents column in `schema.ts`; kernel tests use bigint | backed |
| 3 | The agent identity cannot approve a payment | README Principles, video | `module.test.ts` roles scenario; live `try_approve_payment` with the agent token returns `[false, "agent may not do this"]` and writes an audit row | backed |
| 4 | The requester of a release cannot approve it | README Principles | `checkApprovePayment` in `index.ts`; module test SoD scenario | backed |
| 5 | Rules are backtested by the database before they are stored | README Principles | `backtest()` in `index.ts`, called inside `create_rule`; module test rules scenario | backed |
| 6 | A rule that would clear a confirmed exception is refused | README Principles | `create_rule` refusal `would clear`; module test | backed |
| 7 | Every refusal is in the audit trail with the caller's role | README Principles | `try_*` procedures; live audit rows dated 2026-10-24 | backed |
| 8 | Recall 1.0 on 52 planted exceptions | README What is measured | `docs/FACTS.json` `overall.recall` from the final run | backed (1.0) |
| 9 | Precision at or above 0.95 | README What is measured | `docs/FACTS.json` `overall.precision` | backed (1.0) |
| 10 | 6 decoys cleared with exactly one controller answer each | README What is measured | `docs/FACTS.json` `decoysClearedWithOneAnswer` | backed (6 of 6) |
| 11 | Zero planted exceptions cleared by a rule | README What is measured | `docs/FACTS.json` `plantedClearedByRule` is empty | backed (0) |
| 12 | 92 days replay in under 4 minutes | Tasks target | `scripts/run_days.ts` timing line from the final run | backed (under 1 s of module time; 10 s cycle) |
| 13 | The dashboard updates without refresh on a second laptop | Tasks target | observed at the table | softened: dashboard and database listen on 127.0.0.1, so the second laptop runs ASI:One, not the dashboard |
| 14 | Droid runs with autonomy Off and only MCP tool calls allowed | README Where Droid runs | `worker/src/droid.ts` options block; SDK type names confirmed in `worker/README.md` | backed by types; live run not performed |
| 15 | Live Droid investigated hold 2231 and named truck 22 | video (only if live keys were used) | `seed/fixtures/investigations/2231.json` is hand-written unless `WORKER_MODE=record` ran; say "recorded" or "scripted" accordingly | removed from the video: the recordings are hand-written, labelled as such |
| 16 | The Elastic tools work through the MCP endpoint | README Elastic | `elastic/smoke.py` output, only with a real project | not verifiable without a Serverless project |
| 17 | The agent is discoverable on ASI:One | README Agent addresses | Agentverse profile URL and address after registration | pending registration |
| 18 | The company is simulated and the key is published | README disclaimer | `seed/fixtures/answer_key.json` in the repo | backed |

 succeeded in 0ms:
#!/usr/bin/env python3
"""A scripted fleet controller for the offline run.

It does what the human controller does at the table, using only what a controller would have:
the public tables and the dispatcher's swap log in the evidence folder. It never reads the answer key.

For every hold waiting on the controller it decides from the swap log whether a location mismatch was a
legitimate unit swap (answer yes, which lets the worker draft a scoped rule) or card misuse (reject).
Other exception codes are rejected with a reason. Bank-change holds are released with a call-back note.
Policy holds (`limit`) are released. Candidate rules are approved. It loops until nothing is pending.

Usage: python scripts/controller_sim.py [--rounds 30] [--sleep 3] [--dry-run]
"""
import argparse
import json
import os
import re
import sys
import time
import urllib.request
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SWAP_LOG = ROOT / "seed/fixtures/evidence/swap_log.txt"
START = date(2026, 7, 1)


def load_env():
    env = dict(os.environ)
    p = ROOT / ".env"
    if p.exists():
        for line in p.read_text().splitlines():
            if "=" in line and not line.strip().startswith("#"):
                k, v = line.split("=", 1)
                env.setdefault(k.strip(), v.strip())
    return env


ENV = load_env()
URI, DB = ENV.get("STDB_URI", "http://127.0.0.1:3100"), ENV.get("STDB_DB", "dispatch-ledger")
TOKEN = ENV.get("STDB_CONTROLLER_TOKEN", "")


def day_for_date(d: date) -> int:
    n, cur = 0, START
    while cur <= d:
        if cur.weekday() < 5:
            n += 1
        cur += timedelta(days=1)
    return n


def sql(query: str) -> list[dict]:
    req = urllib.request.Request(f"{URI}/v1/database/{DB}/sql", data=query.encode(), method="POST")
    with urllib.request.urlopen(req, timeout=60) as r:
        res = json.loads(r.read().decode())[0]
    names = [e["name"]["some"] for e in res["schema"]["elements"]]
    out = []
    for raw in res["rows"]:
        row = {}
        for k, v in zip(names, raw):
            if isinstance(v, list) and len(v) == 2 and v[0] in (0, 1) and (v[0] == 1 and v[1] == [] or v[0] == 0):
                v = None if v[0] == 1 else v[1]
            row[k] = v
        out.append(row)
    return out


def call_try(name: str, *args):
    req = urllib.request.Request(f"{URI}/v1/database/{DB}/call/{name}", data=json.dumps(list(args)).encode(), method="POST")
    req.add_header("Authorization", f"Bearer {TOKEN}")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            body = json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return False, f"http {e.code}: {e.read().decode()[:200]}"
    if isinstance(body, list) and len(body) == 2:
        return bool(body[0]), str(body[1])
    return True, str(body)


SWAP_RE = re.compile(r"^(\d{4}-\d{2}-\d{2})\s+(.+?)\s+\(drv (\d+)\)\s+(\d+)\s+(\d+)\s+(.*)$")
THROUGH_RE = re.compile(r"through (\d{4}-\d{2}-\d{2})")


def load_swaps():
    """Returns a list of {driverId, name, ownUnit, reliefUnit, fromDay, toDay, date}."""
    swaps = []
    if not SWAP_LOG.exists():
        return swaps
    for line in SWAP_LOG.read_text().splitlines():
        m = SWAP_RE.match(line.strip())
        if not m:
            continue
        d, name, drv, frm, to, reason = m.groups()
        t = THROUGH_RE.search(reason)
        if "moved to unit" not in reason or not t:
            continue
        swaps.append({
            "driverId": int(drv), "name": name.strip(), "ownUnit": int(frm), "reliefUnit": int(to),
            "fromDay": day_for_date(date.fromisoformat(d)), "toDay": day_for_date(date.fromisoformat(t.group(1))), "date": d,
        })
    return swaps


def swap_for(swaps, driver_id: int, day: int):
    for s in swaps:
        if s["driverId"] == driver_id and s["fromDay"] <= day <= s["toDay"]:
            return s
    return None


def dollars(cents) -> str:
    return f"${int(cents) / 100:,.2f}"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--rounds", type=int, default=30)
    ap.add_argument("--sleep", type=float, default=3.0)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    if not TOKEN:
        print("STDB_CONTROLLER_TOKEN missing", file=sys.stderr)
        return 2
    swaps = load_swaps()
    print(f"swap log: {len(swaps)} swaps on record")
    acted = {"answered": 0, "rejected": 0, "released": 0, "rules_approved": 0, "refused": 0}
    decided = set()

    def act(name, *a):
        if args.dry_run:
            print(f"  dry-run {name} {a}")
            return True, "dry"
        ok, msg = call_try(name, *a)
        if not ok:
            acted["refused"] += 1
            print(f"  refused {name} {a[0]}: {msg}")
        return ok, msg

    for rnd in range(1, args.rounds + 1):
        holds = sql("SELECT * FROM hold")
        mr = {m["txn_ref"]: m for m in sql("SELECT * FROM match_result")}
        pending_tasks = [t for t in sql("SELECT * FROM agent_task") if t["status"] in ("open", "claimed")]
        did = 0

        for h in holds:
            ref = h["txn_ref"]
            if ref in decided:
                continue
            code, status = h["code"], h["status"]
            ev = json.loads(mr[ref]["evidence_json"]) if ref in mr else {}
            if status == "awaiting_controller":
                if code == "location_mismatch":
                    s = swap_for(swaps, int(ev.get("driverId", -1)), int(h["day"]))
                    if s:
                        text = (f"Yes. {s['name']} drove relief unit {s['reliefUnit']} that week while unit {s['ownUnit']} "
                                f"was in the shop, per the swap log entry of {s['date']}. He kept his own fuel card.")
                        ok, _ = act("try_answer_question", ref, text)
                        if ok: acted["answered"] += 1; decided.add(ref); did += 1
                    else:
                        ok, _ = act("try_reject_payment", ref, "Card misuse: the truck was not at the station and the swap log shows no reassignment for this driver.")
                        if ok: acted["rejected"] += 1; decided.add(ref); did += 1
                elif code == "rate_variance":
                    ok, _ = act("try_reject_payment", ref, f"Unit price above the contract rate ({ev.get('variancePct', '?')} percent); vendor to reissue at contract.")
                    if ok: acted["rejected"] += 1; decided.add(ref); did += 1
                elif code == "duplicate_invoice":
                    ok, _ = act("try_reject_payment", ref, f"Duplicate of {ev.get('duplicateOf', 'an earlier invoice')} under another PO.")
                    if ok: acted["rejected"] += 1; decided.add(ref); did += 1
                elif code == "short_received":
                    ok, _ = act("try_reject_payment", ref, f"Billed {ev.get('qty')} but received {ev.get('receivedQty')}; pay on credit memo for the received quantity only.")
                    if ok: acted["rejected"] += 1; decided.add(ref); did += 1
                elif code == "po_mismatch":
                    ok, _ = act("try_reject_payment", ref, f"PO reference does not match: {ev.get('reason', '')}.")
                    if ok: acted["rejected"] += 1; decided.add(ref); did += 1
                elif code == "vendor_bank_change":
                    ok, _ = act("try_approve_payment", ref, {"some": f"Called {ev.get('vendorName', 'the vendor')} on the number on file; new account confirmed by the AR desk."})
                    if ok: acted["released"] += 1; decided.add(ref); did += 1
                elif code == "capacity_exceeded":
                    ok, _ = act("try_reject_payment", ref, f"{ev.get('gallons')} gal exceeds the tank limit of {ev.get('capacityLimitGal')} gal.")
                    if ok: acted["rejected"] += 1; decided.add(ref); did += 1
            elif status == "open" and code == "capacity_exceeded":
                ok, _ = act("try_reject_payment", ref, f"{ev.get('gallons')} gal exceeds the tank limit of {ev.get('capacityLimitGal')} gal; no question to ask.")
                if ok: acted["rejected"] += 1; decided.add(ref); did += 1
            elif status == "open" and code == "vendor_bank_change" and not any(t["txn_ref"] == ref for t in pending_tasks):
                ok, _ = act("try_approve_payment", ref, {"some": f"Called {ev.get('vendorName', 'the vendor')} on the number on file; new account confirmed by the AR desk."})
                if ok: acted["released"] += 1; decided.add(ref); did += 1
            elif status == "open" and code == "limit":
                ok, msg = act("try_approve_payment", ref, {"none": []})
                if not ok and "call-back" in msg:
                    ok, _ = act("try_approve_payment", ref, {"some": "Called the vendor on the number on file; account confirmed by the AR desk."})
                if ok: acted["released"] += 1; decided.add(ref); did += 1

        for r in sql("SELECT * FROM rule"):
            if r["status"] == "candidate":
                ok, _ = act("try_approve_rule", int(r["id"]))
                if ok: acted["rules_approved"] += 1; did += 1

        waiting = [h for h in sql("SELECT * FROM hold") if h["status"] in ("open", "awaiting_controller", "answered") and h["txn_ref"] not in decided]
        pending_tasks = [t for t in sql("SELECT * FROM agent_task") if t["status"] in ("open", "claimed")]
        print(f"round {rnd}: acted {did}, holds still pending {len(waiting)}, tasks in flight {len(pending_tasks)}")
        if did == 0 and not pending_tasks and not [h for h in waiting if h["status"] in ("awaiting_controller",)]:
            break
        if args.dry_run:
            break
        time.sleep(args.sleep)

    print(json.dumps(acted))
    left = [h for h in sql("SELECT * FROM hold") if h["status"] in ("open", "awaiting_controller", "answered")]
    if left:
        print(f"{len(left)} holds left pending:")
        for h in left[:20]:
            print(f"  {h['txn_ref']:10} {h['code']:20} {h['status']:20} {dollars(h['cents'])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
#!/usr/bin/env python3
"""Recompute every published number from the ledger and the answer key.

Nothing in the README, the Devpost text or the video is typed by hand: it is read from docs/FACTS.json,
which this script writes. It is the only program in the repository that reads seed/fixtures/answer_key.json.

Usage: python scripts/facts.py [--uri http://127.0.0.1:3100] [--db dispatch-ledger] [--key seed/fixtures/answer_key.json]
Reads public tables anonymously over the SQL endpoint.
"""
import argparse
import json
import os
import sys
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OPTION_COLS = {"rule_id", "question", "answer", "callback_note", "approved_by", "claimed_by", "claimed_at", "po_id"}
EXCEPTION_CODES = ["location_mismatch", "capacity_exceeded", "rate_variance", "duplicate_toll",
                   "duplicate_invoice", "vendor_bank_change", "short_received"]


def sql(uri: str, db: str, query: str) -> list[dict]:
    req = urllib.request.Request(f"{uri}/v1/database/{db}/sql", data=query.encode(), method="POST")
    with urllib.request.urlopen(req, timeout=60) as r:
        res = json.loads(r.read().decode())[0]
    names = [e["name"]["some"] for e in res["schema"]["elements"]]
    rows = []
    for raw in res["rows"]:
        row = {}
        for k, v in zip(names, raw):
            if isinstance(v, dict) and "some" in v:
                v = v["some"]
            elif isinstance(v, dict) and "none" in v:
                v = None
            elif isinstance(v, list) and len(v) == 2 and v[0] == 1 and v[1] == [] and k in OPTION_COLS:
                v = None
            elif isinstance(v, list) and len(v) == 2 and v[0] == 0 and k in OPTION_COLS:
                v = v[1]
            elif isinstance(v, list) and len(v) == 1 and k in ("at", "decided_at", "updated_at", "created_at", "claimed_at", "actor", "requested_by", "released_by", "created_by", "approved_by", "claimed_by"):
                v = v[0]
            row[k] = v
        rows.append(row)
    return rows


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--uri", default=os.environ.get("STDB_URI", "http://127.0.0.1:3100"))
    ap.add_argument("--db", default=os.environ.get("STDB_DB", "dispatch-ledger"))
    ap.add_argument("--key", default=str(ROOT / "seed/fixtures/answer_key.json"))
    ap.add_argument("--out", default=str(ROOT / "docs"))
    args = ap.parse_args()

    key = json.loads(Path(args.key).read_text())
    key_by_ref = {k["txnRef"]: k for k in key}
    planted = [k for k in key if k["expected"] in ("hold", "auto_reject")]
    decoys = [k for k in key if k["expected"] == "clear_after_question"]

    mr = sql(args.uri, args.db, "SELECT * FROM match_result")
    holds = sql(args.uri, args.db, "SELECT * FROM hold")
    payments = sql(args.uri, args.db, "SELECT * FROM payment")
    rules = sql(args.uri, args.db, "SELECT * FROM rule")
    tasks = sql(args.uri, args.db, "SELECT * FROM agent_task")
    totals = sql(args.uri, args.db, "SELECT * FROM day_total")
    clock = sql(args.uri, args.db, "SELECT * FROM business_day")
    audit = sql(args.uri, args.db, "SELECT action, actor_role, ref FROM audit_event")

    hold_by_ref = {h["txn_ref"]: h for h in holds}
    mr_by_ref = {m["txn_ref"]: m for m in mr}

    # Raised exceptions: every hold with an exception code (a hold row survives release or clearing),
    # plus duplicate tolls, which are auto-rejected without a hold.
    raised: dict[str, str] = {}
    for h in holds:
        if h["code"] in EXCEPTION_CODES:
            raised[h["txn_ref"]] = h["code"]
    for m in mr:
        if m["code"] == "duplicate_toll":
            raised[m["txn_ref"]] = "duplicate_toll"

    by_code = []
    tp_total = fp_total = planted_total = 0
    for code in EXCEPTION_CODES:
        planted_refs = {k["txnRef"] for k in key if k["code"] == code}
        raised_refs = {r for r, c in raised.items() if c == code}
        tp = len(planted_refs & raised_refs)
        fp = len(raised_refs - planted_refs)
        fn = len(planted_refs - raised_refs)
        by_code.append({
            "code": code, "planted": len(planted_refs), "raised": len(raised_refs), "truePositives": tp,
            "falsePositives": fp, "missed": sorted(planted_refs - raised_refs),
            "precision": round(tp / len(raised_refs), 4) if raised_refs else None,
            "recall": round(tp / len(planted_refs), 4) if planted_refs else None,
        })
        tp_total += tp; fp_total += fp; planted_total += len(planted_refs)
    overall_precision = round(tp_total / (tp_total + fp_total), 4) if tp_total + fp_total else None
    overall_recall = round(tp_total / planted_total, 4) if planted_total else None

    # Decoys: cleared through an approved rule after exactly one controller answer.
    decoy_rows = []
    for d in decoys:
        h = hold_by_ref.get(d["txnRef"])
        drafts = [t for t in tasks if t["txn_ref"] == d["txnRef"] and t["kind"] == "draft_rule"]
        rule = next((r for r in rules if r["source_txn_ref"] == d["txnRef"] and r["status"] in ("approved", "expired")), None)
        decoy_rows.append({
            "txnRef": d["txnRef"], "raised": h is not None, "status": h["status"] if h else None,
            "questions": 1 if (h and h.get("question")) else 0, "answers": 1 if (h and h.get("answer")) else 0,
            "draftTasks": len(drafts), "clearedByRule": bool(h and h["status"] == "cleared_by_rule"),
            "ruleId": rule["id"] if rule else None,
            "backtest": json.loads(rule["backtest_json"]) if rule else None,
        })
    decoys_cleared = sum(1 for r in decoy_rows if r["clearedByRule"])
    decoys_one_answer = sum(1 for r in decoy_rows if r["clearedByRule"] and r["answers"] == 1 and r["draftTasks"] == 1)

    # The claim that matters: no planted exception was ever cleared by a rule.
    planted_cleared_by_rule = [k["txnRef"] for k in planted
                               if (hold_by_ref.get(k["txnRef"], {}).get("status") == "cleared_by_rule")
                               or (mr_by_ref.get(k["txnRef"], {}).get("rule_id") not in (None, 0))]

    limit_holds = [h for h in holds if h["code"] == "limit"]
    auto_paid = [p for p in payments if p["released_role"] in ("kernel", "rule")]
    controller_paid = [p for p in payments if p["released_role"] == "controller"]
    refused = [a for a in audit if a["action"] == "refused"]
    refused_by_role = dict(Counter(a["actor_role"] for a in refused))
    task_sources = dict(Counter(t["source"] for t in tasks if t["kind"] == "investigate"))
    task_status = dict(Counter(t["status"] for t in tasks if t["kind"] == "investigate"))

    by_day = []
    holds_per_day = Counter(h["day"] for h in holds if h["code"] in EXCEPTION_CODES)
    dups_per_day = Counter(m["day"] for m in mr if m["code"] == "duplicate_toll")
    for t in sorted(totals, key=lambda x: x["day"]):
        by_day.append({"day": t["day"], "exceptions": holds_per_day.get(t["day"], 0) + dups_per_day.get(t["day"], 0),
                       "autoPaid": t["auto_paid_count"], "autoPaidCents": int(t["auto_paid_cents"]),
                       "holds": t["hold_count"], "autoRejected": t["rejected_count"], "txns": t["txn_count"]})

    unreviewed = [k["txnRef"] for k in planted if k["txnRef"] not in raised]
    cost = {"tasks": 0, "inputTokens": 0, "outputTokens": 0, "durationMs": 0}
    cost_log = ROOT / "worker/cost_log.jsonl"
    if cost_log.exists():
        for line in cost_log.read_text().splitlines():
            try:
                e = json.loads(line)
            except json.JSONDecodeError:
                continue
            cost["tasks"] += 1
            cost["inputTokens"] += int(e.get("inputTokens", 0))
            cost["outputTokens"] += int(e.get("outputTokens", 0))
            cost["durationMs"] += int(e.get("durationMs", 0))

    facts = {
        "asOf": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "dayReached": clock[0]["day"] if clock else 0,
        "transactionsMatched": len(mr),
        "plantedExceptions": planted_total,
        "decoys": len(decoys),
        "overall": {"precision": overall_precision, "recall": overall_recall, "truePositives": tp_total, "falsePositives": fp_total},
        "byCode": by_code,
        "decoyRows": decoy_rows,
        "decoysCleared": decoys_cleared,
        "decoysClearedWithOneAnswer": decoys_one_answer,
        "plantedClearedByRule": planted_cleared_by_rule,
        "limitHolds": {"count": len(limit_holds), "cents": sum(int(h["cents"]) for h in limit_holds)},
        "autoPaid": {"count": len(auto_paid), "cents": sum(int(p["cents"]) for p in auto_paid)},
        "controllerReleased": {"count": len(controller_paid), "cents": sum(int(p["cents"]) for p in controller_paid)},
        "refusals": {"count": len(refused), "byRole": refused_by_role},
        "investigations": {"bySource": task_sources, "byStatus": task_status},
        "rules": dict(Counter(r["status"] for r in rules)),
        "byDay": by_day,
        "worker_cost": cost,
        "unreviewedPlanted": unreviewed,
        "complete": not unreviewed and clock and clock[0]["day"] >= 92,
    }
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    (out / "FACTS.json").write_text(json.dumps(facts, indent=2, sort_keys=True) + "\n")
    web_public = ROOT / "web/public"
    if web_public.exists():
        (web_public / "FACTS.json").write_text(json.dumps(facts, indent=2, sort_keys=True) + "\n")

    md = ["# Facts", "", f"Written by scripts/facts.py at {facts['asOf']}. Nothing in it is typed by hand.", "",
          f"Day reached: {facts['dayReached']} of 92. Transactions matched: {len(mr)}.", "",
          "| Code | Planted | Raised | True positives | False positives | Precision | Recall |", "| --- | --- | --- | --- | --- | --- | --- |"]
    for b in by_code:
        md.append(f"| {b['code']} | {b['planted']} | {b['raised']} | {b['truePositives']} | {b['falsePositives']} | {b['precision']} | {b['recall']} |")
    md += ["", f"Overall precision {overall_precision}, recall {overall_recall}.",
           f"Decoys cleared through an approved rule: {decoys_cleared} of {len(decoys)} ({decoys_one_answer} with exactly one controller answer).",
           f"Planted exceptions cleared by a rule: {len(planted_cleared_by_rule)} (must be 0).",
           f"Policy holds (auto-pay limit, not exceptions): {len(limit_holds)}.",
           f"Auto-paid by the kernel or a rule: {facts['autoPaid']['count']} payments, ${facts['autoPaid']['cents']/100:,.2f}.",
           f"Released by the controller: {facts['controllerReleased']['count']} payments, ${facts['controllerReleased']['cents']/100:,.2f}.",
           f"Refusals recorded in the audit trail: {len(refused)} ({refused_by_role}).",
           f"Investigations by source: {task_sources}; by status: {task_status}.", ""]
    if unreviewed:
        md.append(f"Unreviewed planted rows (the run is not complete): {unreviewed}")
    (out / "FACTS.md").write_text("\n".join(md) + "\n")

    # Evals in the winners' format: run date, rerun command, metric/result/target, hard negatives, history, caveat.
    results = [
        "# Results", "",
        f"Run date: {facts['asOf']}. Rerun: `scripts/full_run.sh` (fresh publish, fixtures, worker in replay, 92 days, scripted controller pass, then this file).",
        "", "| Metric | Result | Target |", "| --- | --- | --- |",
        f"| Recall on planted exceptions ({planted_total}) | {overall_recall} | 1.0 |",
        f"| Precision on raised exceptions | {overall_precision} | at or above 0.95 |",
        f"| Decoys cleared through an approved rule | {decoys_cleared} of {len(decoys)} | 6 of 6 |",
        f"| Decoys cleared with exactly one controller answer | {decoys_one_answer} of {len(decoys)} | 6 of 6 |",
        f"| Planted exceptions cleared by a rule | {len(planted_cleared_by_rule)} | 0 |",
        f"| Duplicate tolls auto-rejected without a task | {sum(1 for m in mr if m['code'] == 'duplicate_toll')} | 11 |",
        f"| Days replayed | {facts['dayReached']} | 92 |",
        f"| Policy holds (auto-pay limit) | {len(limit_holds)} | reported, not scored |",
        "", "## Hard negatives", "",
        "The six decoys are legitimate unit swaps recorded in the dispatcher's swap log. Under the kernel they are indistinguishable from card misuse until the controller answers.", "",
        "| Decoy | Raised | Question asked | Answers | Rule | Backtest n | Confirmed exceptions covered | Cleared |", "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for r in decoy_rows:
        bt = r["backtest"] or {}
        results.append(f"| {r['txnRef']} | {r['raised']} | {bool(r['questions'])} | {r['answers']} | {r['ruleId']} | {bt.get('n')} | {bt.get('confirmedExceptionsCovered')} | {r['clearedByRule']} |")
    results += ["", "## History", "",
        "- First full run (fixtures from 11:18): duplicate_invoice precision 0.5 because recurring same-amount invoices under alternating POs collided with the planted duplicates. Fixed in the generator, not the kernel.",
        "- A facts bug counted every option-typed `rule_id` as set (SQL encodes none as `[1, []]`); fixed before the second run.",
        "- Second run on the final fixtures: every target met.",
        "", "## Caveat", "",
        "The company, the money and the vendors are synthetic, generated by seed/generate.py with seed 42, and the planted errors come from the same generator that made the clean rows. "
        "Recall and precision therefore measure whether the kernel finds what we planted, not how it would behave on a real carrier's statements. "
        "Investigations in this run are scripted stand-ins or hand-written recordings, labelled as such; no live model produced a finding.", ""]
    (out / "RESULTS.md").write_text("\n".join(results) + "\n")
    print("\n".join(md))
    return 0 if not planted_cleared_by_rule else 1


if __name__ == "__main__":
    sys.exit(main())

 succeeded in 0ms:
# Judging-table runbook

Written 2026-10-24 from the scripts on disk. Nothing below was run for this document, because other processes were using the database. Every expected line is read from the code that prints it. Fill in the measured times the night before.

Say it in the first ten seconds: simulated carrier, sandbox money, a published answer key.

**The one rule: if a live step hangs for five seconds, move to Terminal B and keep talking. Never debug live.**

## 1. Night before

- [ ] Both laptops charged, both chargers in the bag, a phone hotspot tested with the demo laptop. Only ASI:One needs the internet; the database, worker, dashboard and CLI all run on 127.0.0.1.
- [ ] WiFi off test on the demo laptop: boot, both moments, the refusal and one inject, all from Terminal B. Everything except ASI:One must work.
- [ ] `.env` exists on the demo laptop only. The second laptop holds no clone with a `.env`. Check the keys without printing them; expect `4`:

```
grep -c -E '^(STDB_SEED_TOKEN|STDB_AGENT_TOKEN|STDB_CONTROLLER_TOKEN|AGENT_SEED)=.+' .env
```

- [ ] `AGENT_SEED` was missing from `.env` on 2026-10-24. Add it once (`openssl rand -hex 32`) and never change it: it fixes the agent's address.
- [ ] Agentverse mailbox connected: start the uAgent (section 2), open the Inspector link it logs, Connect, Mailbox, Finish. Agentverse shows the mailbox as connected. Paste `agent/README.md` into the profile and put the real address in the README table.
- [ ] Second laptop logged into ASI:One with a chat to `@dispatch-ledger-controller` open. Send `status` and get a reply.
- [ ] Notability: dated page screenshots in `docs/notability/` with `captions.md`; the same images and captions in the Devpost gallery.
- [ ] One full 92-day run, then `python3 scripts/facts.py` once, then open `docs/FACTS.md`. Those are the only numbers you may say. Never run `facts.py` at the table: it overwrites `docs/FACTS.json` and `web/public/FACTS.json` with whatever day the clock is on.
- [ ] Screen recordings of moment one and moment two on the desktop, played once with sound off. Last fallback.
- [ ] Measured times: `demo_up.sh` ____ s, `run_days.ts --until 40` ____ s, uAgent mailbox ready ____ s.

## 2. Boot at the table

Run from the repo root on the demo laptop, in this order.

```
scripts/demo_up.sh
```

Expected lines, in order: `==> 1/7 local SpacetimeDB on 127.0.0.1:3100`, `==> 2/7 seed identity`, `==> 3/7 publish the module (fresh data)`, `==> 4/7 agent and controller identities` then `agent: <hex>`, `controller: <hex>`, `wrote .../.env`, `==> 5/7 fixtures` then `connected to http://127.0.0.1:3100 dispatch-ledger`, one `<table>: N rows` line per table and `done in N s`, `==> 6/7 worker in replay mode (logs/worker.log)`, `==> 7/7 web dashboard (logs/web.log)`, `dashboard: http://127.0.0.1:5173`, `Ready. The clock is paused on day 0.` Budget two to three minutes; the fixture load is the long step. It wipes the data and writes new agent and controller tokens into `.env`, so anything started before it must be restarted after it.

```
scripts/clock.sh status
```

Expect `{'id': 1, 'day': 0, 'date': '2026-07-01', 'paused': True, 'tick_micros': 2000000}`. Under a second.

```
agent/.venv/bin/python agent/agent.py
```

Start it after `demo_up.sh`, never before. Expect `dispatch-ledger-controller address agent1q...`, `Agent Inspector: ...` and `ledger http://127.0.0.1:3100 db dispatch-ledger model on` (or `model off (regex + last-hold fallback)` without `ASI_ONE_API_KEY`). Give the mailbox fifteen seconds, then send `status` from the second laptop.

Open http://127.0.0.1:5173. The top bar pill reads `connected` and eight hex characters. Then stage the clock one day before the moment:

```
(cd scripts && npx tsx run_days.ts --until 40)
scripts/clock.sh status
```

Expect `day 0 -> 40`, a line every tenth day, `done: 40 days in N s`, then status shows day 40 and `'paused': True`.

## 3. Two terminals

Terminal A is live. Terminal B is code and fallback. Both sit in the repo root.

| Window | What runs | Pre-typed |
| --- | --- | --- |
| A1 | `agent/.venv/bin/python agent/agent.py` (do not type here) | nothing |
| A2 | `tail -f logs/worker.log` | nothing |
| A3 | commands | `scripts/clock.sh step`, `scripts/as_agent.sh approve INV-1077`, the three inject lines from section 6 |
| B1 | the CLI twin, keys blanked first: `export ASI_ONE_API_KEY= FACTORY_API_KEY= ANTHROPIC_API_KEY= ELASTIC_API_KEY=` | the `python3 -m agent.cli` lines from section 4, in order |
| B2 | editor | `spacetimedb/src/index.ts` at `checkApprovePayment`, `spacetimedb/src/kernel.ts` at `evaluateCardTxn`, `worker/src/droid.ts` at the options block, `agent/handlers.py`, `spacetimedb/src/thresholds.ts` |

The dashboard is full screen on the demo laptop. The second laptop shows ASI:One only: the dashboard and the database listen on 127.0.0.1 and cannot be reached from it.

Each one-shot `python3 -m agent.cli "..."` is a new process and forgets the last hold discussed, so the fallback always names the hold (`answer 2231 ...`). Interactive `python3 -m agent.cli` remembers it.

If a live step hangs for five seconds, move to Terminal B and keep talking. Say "same handler, other front door" and run the B1 line.

## 4. The two moments

### Moment one: hold 2231

1. Step to day 41: type `step` in ASI:One, or run `scripts/clock.sh step` in A3. Point at the Queue: 2231 appears under `location_mismatch`. Click it; the Investigation panel fills with tool calls and the badge reads `replayed`.
2. ASI:One, type each line and wait for the reply:

| Type | Reply starts with |
| --- | --- |
| `what needs me` | `Needs you (n):` and a line `2231 ... location_mismatch day 41 Q: Did Ramon Ortiz drive truck 22 ...` |
| `why 2231` | the finding, two `Evidence:` lines with their source, `Recommendation: hold_and_ask`, `Question:`, `source: replayed` |
| `answer 2231 yes, Ortiz swapped to 22 that week, 17 was in the shop` | `answer_question 2231 written to audit_event by controller` and `The worker will draft a rule ...` |
| `rules` | `#<n>  candidate  location_mismatch  scope {"driverId":23}  one_time  days 41-46  from 2231  would have cleared X of Y past rows; 0 were true exceptions` |
| `approve rule <n>` | `approve_rule <n> written to audit_event by controller` |

3. Use the explicit `answer 2231 ...` form at the table. Bare free text lands on the last hold discussed, and with `ASI_ONE_API_KEY` set the model picks the hold from all waiting questions. Keep these words out of the answer: `no`, `never`, `not ours`, `did not`, `fraud`, `reject` (the drafter treats it as a confirmed exception and drafts nothing), and `always`, `every`, `standing` (it drafts a 30-day standing rule).
4. Read `<n>` off the `rules` reply. The video says rule 1; that holds only on a fresh publish, because the id keeps counting after a reset.
5. Point at the dashboard: 2231 moves to the resolved section as `cleared_by_rule`; the Ledger of trust shows `approve_rule` then `cleared_by_rule 2231 rule <n>`. The Rules panel shows the rule as `expired` at once, because it was one-time and 2231 consumed it. Say that before anyone asks.
6. The payment table is not on the dashboard. To show the payment written with role `rule`, run in B1:

```
curl -s -X POST http://127.0.0.1:3100/v1/database/dispatch-ledger/sql -d "SELECT txn_ref, cents, released_role FROM payment WHERE txn_ref = '2231'"
```

Fallback, same commands, B1:

```
python3 -m agent.cli "what needs me"
python3 -m agent.cli "why 2231"
python3 -m agent.cli "answer 2231 yes, Ortiz swapped to 22 that week, 17 was in the shop"
python3 -m agent.cli "rules"
python3 -m agent.cli "approve rule <n>"
```

### Moment two: INV-1077, the bank change

1. Step three times to day 44 (`step` in ASI:One, or `scripts/clock.sh step` in A3). INV-1077 arrives on day 44; Gulf Coast Diesel's bank change is on day 42. Wait for the A2 line with `INV-1077 investigate -> hold (replayed, replayed)`.
2. ASI:One:

| Type | Reply starts with |
| --- | --- |
| `why INV-1077` | the finding, `Question: Call Gulf Coast Diesel on the number on file ...`, `source: replayed` |
| `approve INV-1077` | `Refused: call-back note required for a bank change` |
| (now run section 5 in A3) | |
| `approve INV-1077 spoke to Gulf Coast Diesel on the number on file, confirmed by M. Reyes` | `approve_payment INV-1077 written to audit_event by controller` |

3. Point at the Ledger of trust: a red `refused` row, actor `controller`, ref `INV-1077`, detail `call-back note required for a bank change`; later the `approve_payment` row with the note as its detail. In the Queue, INV-1077 moves to resolved as `released`.

Fallback, B1:

```
python3 -m agent.cli "why INV-1077"
python3 -m agent.cli "approve INV-1077"
python3 -m agent.cli "approve INV-1077 spoke to Gulf Coast Diesel on the number on file, confirmed by M. Reyes"
```

## 5. Segregation of duties, live

```
scripts/as_agent.sh approve INV-1077
```

It prints the raw procedure body, `[false,"agent may not do this (needs controller)"]`, then `audit trail (last refusal):` and a row with `refused`, `agent`, `INV-1077`. Point at the dashboard: the newest row in the Ledger of trust, red background, actor pill `agent`, action `refused`. The script's "last refusal" line takes the last row the SQL returns, which is not ordered by id; after several judges it may print an older refusal, so point at the dashboard row.

A second proof comes free with section 6: the controller who injects a hold is its requester, so `python3 -m agent.cli "approve <id>"` answers `Refused: requester cannot approve`.

## 6. The judge's own scenario

`scripts/inject.py` lands one fuel purchase on the current business day at a UTC time and runs the same kernel. The kernel uses the truck's nearest ping within 30 minutes; pings are hourly. The examples use truck 29 (100 gallon tank, so the limit is 110.0 gallons), parked at the San Antonio terminal all of day 41 and all of day 44. Pass `--driver 30`: the script's default (driver id = truck id) does not match the seed, where driver 30 drives truck 29.

Clean fuel-up at the pump:

```
python3 scripts/inject.py --truck 29 --driver 30 --gallons 80 --lat 29.4241 --lon -98.4936 --time 18:00
```

Expect `kernel verdict: matched`, `distanceMiles` near 0, `thresholdMiles: 25`. Dashboard: the Ledger of trust shows `inject` then `auto_pay`; the auto-paid counter goes up by one. If it says `limit` with `limitReason: daily_cap`, the day's auto-pay cap was already reached. That is a policy hold and correct.

A far-away purchase:

```
python3 scripts/inject.py --truck 29 --driver 30 --gallons 80 --station "Love's 412, Schulenburg TX" --time 18:00
```

Expect `kernel verdict: location_mismatch` with `distanceMiles` far above `thresholdMiles: 25`. Dashboard: a new hold under `location_mismatch` in the Queue; within a second the card's badge reads `scripted stand-in, not a model` (only 2231 and INV-1077 have recorded findings), and the `model offline` pill may appear. Both are the labels working.

A tank overfill:

```
python3 scripts/inject.py --truck 29 --driver 30 --gallons 150 --lat 29.4241 --lon -98.4936 --time 18:00
```

Expect `kernel verdict: capacity_exceeded` and `capacityLimitGal: 110.0`. Capacity is checked before location. The stand-in recommends hold and asks nothing; no rule may ever clear this code.

For another truck or day, read its pings from the fixture (day, then truck):

```
python3 -I -c "import json,sys;d,t=int(sys.argv[1]),int(sys.argv[2]);[print(p['at'],p['lat'],p['lon'],p['engineOn']) for p in json.load(open('seed/fixtures/trip_pings.json')) if p['day']==d and p['truckId']==t]" 44 29
```

An injected row stays in `card_txn` after `scripts/clock.sh reset` and is matched again on that day of the next replay, raised by the database this time. Run `scripts/demo_up.sh` at a long break to clear them.

## 7. The clock

```
scripts/clock.sh run            # 2 second business day
scripts/clock.sh pause          # stop on the current day
scripts/clock.sh step           # one day, paused or not
scripts/clock.sh tick 500000    # faster: 0.5 s per day (minimum 100000)
scripts/clock.sh tick 2000000   # back to normal
scripts/clock.sh status
```

Between judges, without republishing:

```
scripts/clock.sh reset
scripts/clock.sh tick 2000000
(cd scripts && npx tsx run_days.ts --until 40)
```

For the month from zero, use `scripts/clock.sh run` after the reset instead and pause a few days before 41, then step. `reset` clears holds, matches, payments, day totals, tasks and rules and leaves day 0 paused. It keeps the audit trail (refusals pile up across judges), the tick setting, the rule id counter, injected rows and all company data. The worker, the uAgent and the dashboard need no restart; tokens do not change.

## 8. Failure modes

| What you see | Do | Say |
| --- | --- | --- |
| ASI:One slow or down | After five seconds, run the same line in B1 with `python3 -m agent.cli`. Try the hotspot later. | "Same handler, other front door. The database does not care which." |
| ASI:One replies `Ledger error` or a role refusal it should not | `demo_up.sh` ran after the uAgent started; it holds an old token. Restart A1. Use B1 meanwhile. | "Restarting the chat seat; the ledger is fine." |
| A2 stops moving; cards read `Task is open. Waiting for the worker to claim it.` | Check `ls worker/PAUSE` and remove it if present. Otherwise restart the worker (below). It claims the open tasks. | "Holds are raised by the kernel inside the database, so nothing slipped through. The investigator is catching up." |
| Pill reads `reconnecting` or `database unreachable` | Reload the page; the anonymous token is cached in the browser. | "The page is a read-only subscriber." |
| `clock.sh status` fails, CLI says `ledger unreachable` | Server died. Stop the old worker and web, run `scripts/demo_up.sh` (two minutes), restart A1, re-stage to day 40. Play the recording meanwhile. | "Fresh publish; every number on screen will come back from the ledger." |

```
(cd worker && WORKER_MODE=replay FACTORY_API_KEY= ANTHROPIC_API_KEY= nohup npm start > ../logs/worker.log 2>&1 &)
pkill -f 'tsx src/index.ts'; lsof -ti :5173 | xargs kill     # before re-running demo_up.sh
```

## 9. Honest answers by table

`context/JUDGE_QA.md` is split by audience, not sponsor; these lines map its answers to each table. One line each; open the file only if they ask to see code.

**Hyphenate** (their booth said they would run their own scenario; that is section 6)

1. Is the company real? No; `seed/generate.py` makes it with seed 42 and a published key. `seed/fixtures/answer_key.json`
2. What does the clerk do? A three-way match in integer cents in plain code; clean lines pay under the auto-pay limits, the rest holds. `spacetimedb/src/kernel.ts`
3. Can I try my own case? Yes, on the current day, through the same kernel. `scripts/inject.py`
4. Who approves? The controller, from ASI:One or the terminal; the agent is refused by the database and the refusal is a row. `spacetimedb/src/index.ts` (`checkApprovePayment`)
5. Does money move? No; a payment row is the end of the line. `docs/not-built.md`

**SpacetimeDB**

1. Why SpacetimeDB? The permission model is the database: roles are a table and every reducer checks the caller first, with no API layer to bypass. `spacetimedb/src/index.ts` (`roleOf`, `checkRole`)
2. How does a refusal survive? A thrown error rolls back its own audit row, so the `try_` procedures commit the refusal and return `[ok, message]`. `spacetimedb/src/index.ts` (`attempt`), `docs/CONTRACT.md`
3. How does the clock work? `advance_day` is a scheduled reducer only the database identity may call. `spacetimedb/src/index.ts` (`advanceDay`)
4. Who computes the backtest? The module, inside `create_rule`, from `match_result` and `hold`; the worker's numbers are stored only as a preview. `spacetimedb/src/index.ts` (`backtest`)
5. Can the dashboard write? No; it is anonymous and reads public tables, and there is no pause button because Vite would bundle the token. `web/src/stdb.ts`

**Fetch.ai**

1. What is the agent? A uAgent with the chat protocol and a mailbox, holding the controller identity, running the same handler as the CLI. `agent/agent.py`
2. Where is the model? One `asi1-mini` call routes free text when the key is set, after the regex fast paths; it never decides money. `agent/intents.py`
3. Can it approve on its own? No; it acts only on the controller's typed line, through `try_` procedures the database checks. `agent/handlers.py`
4. Is it discoverable on ASI:One? Say only what the Agentverse profile shows that day. `agent/README.md`
5. What if ASI:One is down? The terminal twin calls the same `handle()` with no internet. `agent/cli.py`

**Factory**

1. What does Droid touch? A read-only evidence folder and two Elastic tools over MCP; autonomy Off, four tools disabled by id, only MCP calls allowed, a 90 second abort. `worker/src/droid.ts`
2. Can it pay? No; the output schema has no `pay`, zod gates it, and the agent role is refused at approval. `worker/src/finding.ts`
3. Was that live? Read the badge; the table demo runs `WORKER_MODE=replay` with every key empty, so it says `replayed` or `scripted stand-in`. `scripts/demo_up.sh`
4. What if it hangs? The abort falls back to the recorded finding or the stand-in, and a timeout row is written after the grace period. `worker/src/investigate.ts`, `worker/src/loop.ts`
5. What if two workers grab a task? `claim_task` is version-locked; the loser logs "another worker won". `worker/src/stdb.ts`

**Elastic**

1. What is in Elastic? Four indices: `telematics_log` with a geo_point, `receipts`, `contracts`, `invoices`. `elastic/mappings/`
2. What tools? Two hand-written ES|QL tools in Agent Builder, `find_trips_near` and `contract_rate_for_vendor`; no ES|QL is written at runtime. `elastic/tools/`
3. How does Droid reach them? The Agent Builder MCP endpoint at `{KIBANA_URL}/api/agent_builder/mcp`, only when both variables are set. `worker/src/droid.ts`
4. Was Elastic queried at this table? No; the demo exports no Elastic keys, and the smoke test only proves it against a real project. `elastic/smoke.py`
5. Does the kernel use Elastic? No; the kernel reads module rows, and Elastic is evidence for the investigator only. `spacetimedb/src/kernel.ts`

## 10. Never say

1. A number that is not on a screen right now or in `docs/FACTS.md`. Nothing from memory.
2. "The model decided." The kernel decides, the investigator recommends, the controller approves.
3. "Real-time" without pointing at the `audit_event` row that just appeared.
4. "Droid ran live" unless `WORKER_MODE` was live and the badge says `live`. The 2231 and INV-1077 fixtures carry a "live droid run (record)" note; do not repeat it unless you watched that record run.
5. "Elastic just found truck 22." In replay, the card replays a recorded tool call.
6. "It pays vendors" or "it moves money." A payment row is the end of the line.
7. Anything that makes the carrier, the vendors or the money sound real.
8. "Rule 1" without reading the id from `rules`.
9. "It learns" without "from your answer, scoped, expiring and backtested by the database".
10. Anything about Cruze's pilot or customers beyond the one line in `context/JUDGE_QA.md`.
#!/usr/bin/env bash
# Build and serve the demo month with no model calls and no network.
#   scripts/demo_up.sh            start everything (server, module, identities, fixtures, worker in replay, web)
#   scripts/demo_up.sh --no-web   skip the web dev server
# Every model key is exported empty on purpose: a variable that is set, even to nothing, wins over .env,
# so the offline run cannot make a paid call by accident.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export PATH="$HOME/.local/bin:$PATH"
export FACTORY_API_KEY= ANTHROPIC_API_KEY= ELASTIC_API_KEY= ELASTICSEARCH_URL= KIBANA_URL= ASI_ONE_API_KEY=
export WORKER_MODE=replay
export STDB_URI=http://127.0.0.1:3100 STDB_DB=dispatch-ledger
mkdir -p .spacetime logs

step() { printf '\n==> %s\n' "$*"; }

step "1/7 local SpacetimeDB on 127.0.0.1:3100"
if ! curl -sf "$STDB_URI/v1/ping" >/dev/null 2>&1; then
  nohup spacetime start --listen-addr 127.0.0.1:3100 --data-dir "$ROOT/.spacetime/data" > logs/spacetimedb.log 2>&1 &
  for i in $(seq 1 40); do curl -sf "$STDB_URI/v1/ping" >/dev/null 2>&1 && break; sleep 0.5; done
fi
curl -sf "$STDB_URI/v1/ping" >/dev/null || { echo "server did not start; see logs/spacetimedb.log"; exit 1; }
spacetime server add local3100 --url "$STDB_URI" >/dev/null 2>&1 || true

step "2/7 seed identity (the publisher becomes the seed role)"
touch .env
if ! grep -q '^STDB_SEED_TOKEN=.\+' .env; then
  SEED=$(curl -s -X POST "$STDB_URI/v1/identity")
  TOKEN=$(printf '%s' "$SEED" | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
  IDENT=$(printf '%s' "$SEED" | python3 -c 'import sys,json;print(json.load(sys.stdin)["identity"])')
  printf 'STDB_URI=%s\nSTDB_DB=%s\nSTDB_SEED_IDENTITY=%s\nSTDB_SEED_TOKEN=%s\n' "$STDB_URI" "$STDB_DB" "$IDENT" "$TOKEN" >> .env
fi
SEED_TOKEN=$(grep '^STDB_SEED_TOKEN=' .env | cut -d= -f2-)
spacetime login --token "$SEED_TOKEN" >/dev/null 2>&1

step "3/7 publish the module (fresh data)"
( cd spacetimedb && [ -d node_modules ] || npm install --silent )
( cd spacetimedb && spacetime publish dispatch-ledger --module-path . --server local3100 --delete-data=always --yes 2>&1 | tail -2 )

step "4/7 agent and controller identities"
python3 scripts/mint_identities.py --uri "$STDB_URI" --db "$STDB_DB"

step "5/7 fixtures"
( cd scripts && [ -d node_modules ] || npm install --silent )
( cd scripts && npx tsx load_fixtures.ts )

step "6/7 worker in replay mode (logs/worker.log)"
pkill -f "worker/src/index.ts" 2>/dev/null || true
pkill -f "tsx src/index.ts" 2>/dev/null || true
pkill -f "vite --host 127.0.0.1 --port 5173" 2>/dev/null || true
pkill -f "agent/agent.py" 2>/dev/null || true
sleep 1
if [ -f worker/package.json ]; then
  ( cd worker && [ -d node_modules ] || npm install --silent )
  ( cd worker && nohup npm start > ../logs/worker.log 2>&1 & )
fi

if [ "${1:-}" != "--no-web" ] && [ -f web/package.json ]; then
  step "7/7 web dashboard (logs/web.log)"
  ( cd web && [ -d node_modules ] || npm install --silent )
  ( cd web && nohup npm run dev -- --host 127.0.0.1 --port 5173 > ../logs/web.log 2>&1 & )
  echo "dashboard: http://127.0.0.1:5173"
fi

if grep -q '^AGENT_SEED=.\+' .env && [ -d agent/.venv ]; then
  step "ASI:One agent (logs/agent.log); open the Agent Inspector link it prints the first time"
  ( nohup agent/.venv/bin/python agent/agent.py > logs/agent.log 2>&1 & )
fi

cat <<EOF

Ready. The clock is paused on day 0.
  scripts/clock.sh run        start the 2 second day tick
  scripts/clock.sh pause      stop on the current day
  scripts/clock.sh step       advance one day
  scripts/clock.sh tick 500000   faster ticks (0.5 s)
  python3 -m agent.cli "what needs me"   the controller's terminal (same code as the ASI:One agent)
  python3 scripts/facts.py    recompute docs/FACTS.json from the ledger
EOF
#!/usr/bin/env bash
# One command from fresh fixtures to a facts table:
#   republish with empty data, mint identities, load fixtures, start the worker in replay mode,
#   advance all 92 days, run the scripted controller pass, recompute docs/FACTS.json.
# Usage: scripts/full_run.sh [--keep-worker]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export PATH="$HOME/.local/bin:$PATH"
export FACTORY_API_KEY= ANTHROPIC_API_KEY= ELASTIC_API_KEY= ASI_ONE_API_KEY=
export WORKER_MODE=replay
mkdir -p logs
T0=$(date +%s)
step() { printf '\n==> %s (%ss)\n' "$*" "$(( $(date +%s) - T0 ))"; }

curl -sf http://127.0.0.1:3100/v1/ping >/dev/null || { echo "local SpacetimeDB is not running on 3100; run scripts/demo_up.sh first"; exit 1; }

step "publish with empty data"
( cd spacetimedb && spacetime publish dispatch-ledger --module-path . --server local3100 --delete-data=always --yes 2>&1 | tail -1 )
step "identities"
python3 scripts/mint_identities.py | tail -1
step "fixtures"
( cd scripts && npx tsx load_fixtures.ts | tail -3 )

step "worker (replay)"
if [ "${1:-}" != "--keep-worker" ]; then
  pkill -f "worker/src/index.ts" 2>/dev/null || true
  pkill -f "tsx src/index.ts" 2>/dev/null || true
  sleep 1
fi
( cd worker && EVIDENCE_DIR="$ROOT/seed/fixtures/evidence" nohup npm start > ../logs/worker.log 2>&1 & )
for i in $(seq 1 30); do grep -q "loop started" logs/worker.log 2>/dev/null && break; sleep 0.5; done
grep -q "loop started" logs/worker.log || { echo "worker did not start; see logs/worker.log"; exit 1; }

step "92 days"
( cd scripts && npx tsx run_days.ts --until 92 | tail -2 )

step "waiting for investigations"
left=1
for i in $(seq 1 180); do
  left=$(curl -s -X POST http://127.0.0.1:3100/v1/database/dispatch-ledger/sql -d "SELECT status FROM agent_task WHERE status = 'open'" | python3 -c 'import sys,json; print(len(json.load(sys.stdin)[0]["rows"]))' || echo 1)
  if [ "$left" = "0" ]; then break; fi
  sleep 1
done
echo "open tasks after wait: $left"

step "controller pass"
python3 scripts/controller_sim.py --rounds 30 --sleep 2 | tail -4

step "facts"
python3 scripts/facts.py | sed -n '5,40p'
printf '\ntotal %ss\n' "$(( $(date +%s) - T0 ))"

 succeeded in 0ms:
// Dispatch Ledger module. One shared room: all state and every permission check live here.
// Three roles (seed, agent, controller). Every action: check, the change, audit.
//
// Two entry points per controller action:
//   - a reducer (`approve_payment`): used by SDK clients; a refusal throws SenderError and the
//     transaction rolls back, so the caller sees the message but nothing is written.
//   - a procedure (`try_approve_payment`): runs the same check in its own committed transaction,
//     so a refusal leaves an `audit_event` row with action 'refused' and returns {ok:false, message}.
//     The ASI:One agent and the demo scripts use these so refusals are visible in the ledger.
import { SenderError, t, type InferSchema, type ReducerCtx } from 'spacetimedb/server';
import { ScheduleAt } from 'spacetimedb';
import spacetimedb, {
  agentTask, businessDay, cardTxn, contract, dayTimer, driver, hold, invoice, matchResult, payment,
  po, rule, terminal, tollTxn, tripPing, truck, vendor,
} from './schema';
import { T, RULE_CONDITIONS } from './thresholds';
import { dateForDay } from './calendar';
import {
  autoPayDecision, evaluateCardTxn, evaluateInvoice, evaluateToll, isEarlierInvoice, isEarlierToll, ruleCovers,
  type PingIn, type RuleIn, type RuleScope, type TollIn, type InvoiceIn, type Verdict,
} from './kernel';

export { default } from './schema';

type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;
type Refusal = string | null;
type Identity = Ctx['sender'];

const TICK_MICROS = 2_000_000n;
const APPROVABLE = ['open', 'awaiting_controller', 'answered'];
const Outcome = t.object('Outcome', { ok: t.bool(), message: t.string() });

// ---------------------------------------------------------------------------
// roles and audit
// ---------------------------------------------------------------------------
function roleOf(ctx: Ctx, who = ctx.sender): string {
  if (who.isEqual(ctx.identity)) return 'database';
  return ctx.db.role.identity.find(who)?.role ?? 'anonymous';
}

function currentDay(ctx: Ctx): number {
  return ctx.db.businessDay.id.find(1)?.day ?? 0;
}

function audit(ctx: Ctx, action: string, ref: string, detail: string) {
  ctx.db.auditEvent.insert({
    id: 0n, at: ctx.timestamp, day: currentDay(ctx), actor: ctx.sender, actorRole: roleOf(ctx), action, ref, detail,
  });
}

function checkRole(ctx: Ctx, ...allowed: string[]): Refusal {
  const r = roleOf(ctx);
  return allowed.includes(r) ? null : `${r} may not do this (needs ${allowed.join(' or ')})`;
}

// Reducer path: audit then throw (the audit row rolls back with the transaction; the message reaches the caller).
function guard(ctx: Ctx, ref: string, refusal: Refusal, perform: () => void) {
  if (refusal) {
    audit(ctx, 'refused', ref, refusal);
    throw new SenderError(refusal);
  }
  perform();
}

function refuse(ctx: Ctx, ref: string, why: string): never {
  audit(ctx, 'refused', ref, why);
  throw new SenderError(why);
}

function requireRole(ctx: Ctx, ref: string, ...allowed: string[]) {
  const r = checkRole(ctx, ...allowed);
  if (r) refuse(ctx, ref, r);
}

// Procedure path: the refusal is written in a committed transaction and returned, never thrown.
type TxRunner = { withTx<R>(body: (tx: Ctx) => R): R };
function attempt(ctx: TxRunner, ref: string, check: (tx: Ctx) => Refusal, perform: (tx: Ctx) => void) {
  const result = ctx.withTx(tx => {
    const r = check(tx);
    if (r) { audit(tx, 'refused', ref, r); return r; }
    perform(tx);
    return null;
  });
  return result ? { ok: false, message: result } : { ok: true, message: 'ok' };
}

// ---------------------------------------------------------------------------
// lifecycle
// ---------------------------------------------------------------------------
export const init = spacetimedb.init(ctx => {
  ctx.db.role.insert({ identity: ctx.sender, role: 'seed' });
  ctx.db.businessDay.insert({ id: 1, day: 0, date: dateForDay(0), paused: true, tickMicros: TICK_MICROS });
  ctx.db.dayTimer.insert({ scheduledId: 0n, scheduledAt: ScheduleAt.interval(TICK_MICROS) });
  ctx.db.auditEvent.insert({
    id: 0n, at: ctx.timestamp, day: 0, actor: ctx.sender, actorRole: 'seed', action: 'init', ref: 'module', detail: 'publisher granted seed',
  });
});

export const grantRole = spacetimedb.reducer({ identity: t.identity(), role: t.string() }, (ctx, { identity, role: r }) => {
  requireRole(ctx, identity.toHexString(), 'seed');
  if (!['seed', 'agent', 'controller'].includes(r)) refuse(ctx, identity.toHexString(), `unknown role ${r}`);
  const existing = ctx.db.role.identity.find(identity);
  if (existing) ctx.db.role.identity.update({ ...existing, role: r });
  else ctx.db.role.insert({ identity, role: r });
  audit(ctx, 'grant_role', identity.toHexString(), r);
});

// ---------------------------------------------------------------------------
// seeding (seed role only). Typed arrays, 500 rows per call is comfortable.
// ---------------------------------------------------------------------------
export const seedTerminals = spacetimedb.reducer({ rows: t.array(terminal.rowType) }, (ctx, { rows }) => {
  requireRole(ctx, 'seed', 'seed');
  for (const r of rows) if (!ctx.db.terminal.id.find(r.id)) ctx.db.terminal.insert(r);
  audit(ctx, 'seed', 'terminal', `${rows.length} rows`);
});
export const seedTrucks = spacetimedb.reducer({ rows: t.array(truck.rowType) }, (ctx, { rows }) => {
  requireRole(ctx, 'seed', 'seed');
  for (const r of rows) if (!ctx.db.truck.id.find(r.id)) ctx.db.truck.insert(r);
  audit(ctx, 'seed', 'truck', `${rows.length} rows`);
});
export const seedDrivers = spacetimedb.reducer({ rows: t.array(driver.rowType) }, (ctx, { rows }) => {
  requireRole(ctx, 'seed', 'seed');
  for (const r of rows) if (!ctx.db.driver.id.find(r.id)) ctx.db.driver.insert(r);
  audit(ctx, 'seed', 'driver', `${rows.length} rows`);
});
export const seedPings = spacetimedb.reducer({ rows: t.array(tripPing.rowType) }, (ctx, { rows }) => {
  requireRole(ctx, 'seed', 'seed');
  for (const r of rows) ctx.db.tripPing.insert({ ...r, id: 0n });
});
export const seedCardTxns = spacetimedb.reducer({ rows: t.array(cardTxn.rowType) }, (ctx, { rows }) => {
  requireRole(ctx, 'seed', 'seed');
  for (const r of rows) if (!ctx.db.cardTxn.id.find(r.id)) ctx.db.cardTxn.insert(r);
});
export const seedTollTxns = spacetimedb.reducer({ rows: t.array(tollTxn.rowType) }, (ctx, { rows }) => {
  requireRole(ctx, 'seed', 'seed');
  for (const r of rows) if (!ctx.db.tollTxn.id.find(r.id)) ctx.db.tollTxn.insert(r);
});
export const seedVendors = spacetimedb.reducer({ rows: t.array(vendor.rowType) }, (ctx, { rows }) => {
  requireRole(ctx, 'seed', 'seed');
  for (const r of rows) if (!ctx.db.vendor.id.find(r.id)) ctx.db.vendor.insert(r);
  audit(ctx, 'seed', 'vendor', `${rows.length} rows`);
});
export const seedContracts = spacetimedb.reducer({ rows: t.array(contract.rowType) }, (ctx, { rows }) => {
  requireRole(ctx, 'seed', 'seed');
  for (const r of rows) if (!ctx.db.contract.id.find(r.id)) ctx.db.contract.insert(r);
  audit(ctx, 'seed', 'contract', `${rows.length} rows`);
});
export const seedPos = spacetimedb.reducer({ rows: t.array(po.rowType) }, (ctx, { rows }) => {
  requireRole(ctx, 'seed', 'seed');
  for (const r of rows) if (!ctx.db.po.id.find(r.id)) ctx.db.po.insert(r);
  audit(ctx, 'seed', 'po', `${rows.length} rows`);
});
export const seedInvoices = spacetimedb.reducer({ rows: t.array(invoice.rowType) }, (ctx, { rows }) => {
  requireRole(ctx, 'seed', 'seed');
  for (const r of rows) if (!ctx.db.invoice.id.find(r.id)) ctx.db.invoice.insert(r);
  audit(ctx, 'seed', 'invoice', `${rows.length} rows`);
});

// A vendor changes its bank details on a given day (seed only; the kernel reads bankChangedDay).
export const vendorBankChange = spacetimedb.reducer({ vendorId: t.u32(), bankLast4: t.string(), day: t.i32() }, (ctx, { vendorId, bankLast4, day }) => {
  requireRole(ctx, String(vendorId), 'seed');
  const v = ctx.db.vendor.id.find(vendorId);
  if (!v) refuse(ctx, String(vendorId), 'no such vendor');
  ctx.db.vendor.id.update({ ...v, bankLast4, bankChangedDay: day });
  audit(ctx, 'vendor_bank_change', String(vendorId), `day ${day}`);
});

// Wipe operational state so the demo can replay from day 0 without republishing. Company data stays.
export const resetSim = spacetimedb.reducer(ctx => {
  requireRole(ctx, 'sim', 'seed');
  ctx.db.matchResult.clear();
  ctx.db.payment.clear();
  ctx.db.dayTotal.clear();
  ctx.db.agentTask.clear();
  ctx.db.hold.clear();
  ctx.db.rule.clear();
  const d = ctx.db.businessDay.id.find(1)!;
  ctx.db.businessDay.id.update({ ...d, day: 0, date: dateForDay(0), paused: true });
  audit(ctx, 'reset_sim', 'day', '0');
});

// ---------------------------------------------------------------------------
// the clock
// ---------------------------------------------------------------------------
function performSetClock(ctx: Ctx, paused: boolean) {
  const d = ctx.db.businessDay.id.find(1)!;
  ctx.db.businessDay.id.update({ ...d, paused });
  audit(ctx, 'set_clock', String(d.day), paused ? 'paused' : 'running');
}
export const setClock = spacetimedb.reducer({ paused: t.bool() }, (ctx, { paused }) =>
  guard(ctx, 'clock', checkRole(ctx, 'seed', 'controller'), () => performSetClock(ctx, paused)));
export const trySetClock = spacetimedb.procedure({ paused: t.bool() }, Outcome, (ctx, { paused }) =>
  attempt(ctx, 'clock', tx => checkRole(tx, 'seed', 'controller'), tx => performSetClock(tx, paused)));

export const setTickMicros = spacetimedb.reducer({ micros: t.u64() }, (ctx, { micros }) => {
  requireRole(ctx, 'clock', 'seed', 'controller');
  if (micros < 100_000n) refuse(ctx, 'clock', 'tick must be at least 100ms');
  const d = ctx.db.businessDay.id.find(1)!;
  ctx.db.businessDay.id.update({ ...d, tickMicros: micros });
  for (const timer of ctx.db.dayTimer.iter()) ctx.db.dayTimer.scheduledId.delete(timer.scheduledId);
  ctx.db.dayTimer.insert({ scheduledId: 0n, scheduledAt: ScheduleAt.interval(micros) });
  audit(ctx, 'set_tick', String(d.day), `${micros} us`);
});

// Advance exactly one business day, paused or not. For tests and the demo "step" control.
export const stepDay = spacetimedb.reducer(ctx =>
  guard(ctx, 'clock', checkRole(ctx, 'seed', 'controller'), () => advance(ctx)));
export const tryStepDay = spacetimedb.procedure(Outcome, ctx =>
  attempt(ctx, 'clock', tx => checkRole(tx, 'seed', 'controller'), tx => advance(tx)));

// Scheduled: only the database itself may call it.
export const advanceDay = spacetimedb.reducer({ onSchedule: dayTimer }, { timer: dayTimer.rowType }, (ctx, _args) => {
  if (!ctx.sender.isEqual(ctx.identity)) throw new SenderError('scheduled only');
  const d = ctx.db.businessDay.id.find(1)!;
  if (d.paused || d.day >= T.TOTAL_DAYS) return;
  advance(ctx);
});

function advance(ctx: Ctx) {
  const d = ctx.db.businessDay.id.find(1)!;
  if (d.day >= T.TOTAL_DAYS) return;
  const next = d.day + 1;
  ctx.db.businessDay.id.update({ ...d, day: next, date: dateForDay(next) });
  expireRules(ctx, next);
  matchDay(ctx, next);
}

function expireRules(ctx: Ctx, day: number) {
  for (const r of ctx.db.rule.status.filter('approved')) {
    if (r.validToDay < day) ctx.db.rule.id.update({ ...r, status: 'expired', reason: `expired on day ${day}` });
  }
}

// ---------------------------------------------------------------------------
// the kernel, applied to one day. Internal: nobody can replay a day from outside.
// ---------------------------------------------------------------------------
function parseScope(json: string): RuleScope {
  try {
    const s = JSON.parse(json) as Record<string, unknown>;
    const out: RuleScope = {};
    if (typeof s.driverId === 'number') out.driverId = s.driverId;
    if (Array.isArray(s.truckIds)) out.truckIds = s.truckIds.filter((x): x is number => typeof x === 'number');
    if (typeof s.cardId === 'string') out.cardId = s.cardId;
    if (typeof s.vendorId === 'number') out.vendorId = s.vendorId;
    return out;
  } catch {
    return {};
  }
}

function approvedRules(ctx: Ctx): RuleIn[] {
  const out: RuleIn[] = [];
  for (const r of ctx.db.rule.status.filter('approved')) {
    out.push({ id: r.id, condition: r.condition, scope: parseScope(r.scopeJson), validFromDay: r.validFromDay, validToDay: r.validToDay });
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function pingsFor(ctx: Ctx, truckId: number, day: number): PingIn[] {
  const out: PingIn[] = [];
  for (const p of ctx.db.tripPing.by_truck_day.filter([truckId, day])) {
    out.push({ atMicros: p.at.microsSinceUnixEpoch, lat: p.lat, lon: p.lon, engineOn: p.engineOn, odometer: p.odometer });
  }
  return out;
}

type CardRow = typeof cardTxn.rowType.type;
type TollRow = typeof tollTxn.rowType.type;
type InvoiceRow = typeof invoice.rowType.type;

function evaluateCard(ctx: Ctx, c: CardRow, rules: RuleIn[]): Verdict {
  const tr = ctx.db.truck.id.find(c.truckId);
  const pings = pingsFor(ctx, c.truckId, c.day);
  const drv = ctx.db.driver.id.find(c.driverId);
  const v = evaluateCardTxn(
    { id: c.id, cardId: c.cardId, truckId: c.truckId, driverId: c.driverId, atMicros: c.at.microsSinceUnixEpoch, day: c.day,
      stationName: c.stationName, stationLat: c.stationLat, stationLon: c.stationLon, gallons: c.gallons, cents: c.cents, merchant: c.merchant },
    tr ? { id: tr.id, plate: tr.plate, tankGal: tr.tankGal, fuelCardId: tr.fuelCardId } : undefined,
    pings,
    rules
  );
  v.evidence = { ...v.evidence, driverName: drv?.name ?? '', plate: tr?.plate ?? '', atMicros: c.at.microsSinceUnixEpoch.toString(), date: dateForDay(c.day) };
  return v;
}

function evaluateTollRow(ctx: Ctx, tl: TollRow): Verdict {
  const me: TollIn = { id: tl.id, plate: tl.plate, truckId: tl.truckId, atMicros: tl.at.microsSinceUnixEpoch, day: tl.day, plazaId: tl.plazaId, plazaName: tl.plazaName, cents: tl.cents };
  const earlier: TollIn[] = [];
  for (const e of ctx.db.tollTxn.plate.filter(tl.plate)) {
    const row: TollIn = { id: e.id, plate: e.plate, truckId: e.truckId, atMicros: e.at.microsSinceUnixEpoch, day: e.day, plazaId: e.plazaId, plazaName: e.plazaName, cents: e.cents };
    if (e.id !== tl.id && isEarlierToll(row, me)) earlier.push(row);
  }
  const v = evaluateToll(me, earlier);
  v.evidence = { ...v.evidence, atMicros: tl.at.microsSinceUnixEpoch.toString(), date: dateForDay(tl.day) };
  return v;
}

function evaluateInvoiceRow(ctx: Ctx, inv: InvoiceRow, rules: RuleIn[]): Verdict {
  const me: InvoiceIn = { id: inv.id, vendorId: inv.vendorId, poId: inv.poId, receivedDay: inv.receivedDay, item: inv.item, qty: inv.qty, unitCents: inv.unitCents, cents: inv.cents, docRef: inv.docRef };
  const p = inv.poId ? ctx.db.po.id.find(inv.poId) : undefined;
  const vend = ctx.db.vendor.id.find(inv.vendorId);
  // The contract valid on the receipt day; the most recently started one wins, lowest id breaks ties.
  let ct: typeof contract.rowType.type | undefined;
  if (p) {
    for (const c of ctx.db.contract.vendorId.filter(inv.vendorId)) {
      if (c.item !== p.item || c.validFromDay > inv.receivedDay || c.validToDay < inv.receivedDay) continue;
      if (!ct || c.validFromDay > ct.validFromDay || (c.validFromDay === ct.validFromDay && c.id < ct.id)) ct = c;
    }
  }
  const earlier: InvoiceIn[] = [];
  for (const e of ctx.db.invoice.vendorId.filter(inv.vendorId)) {
    const row: InvoiceIn = { id: e.id, vendorId: e.vendorId, poId: e.poId, receivedDay: e.receivedDay, item: e.item, qty: e.qty, unitCents: e.unitCents, cents: e.cents, docRef: e.docRef };
    if (e.id !== inv.id && isEarlierInvoice(row, me)) earlier.push(row);
  }
  const v = evaluateInvoice(
    me,
    p ? { id: p.id, vendorId: p.vendorId, truckId: p.truckId, item: p.item, qty: p.qty, unitCents: p.unitCents, receivedQty: p.receivedQty } : undefined,
    ct ? { id: ct.id, vendorId: ct.vendorId, item: ct.item, rateCents: ct.rateCents, validFromDay: ct.validFromDay, validToDay: ct.validToDay } : undefined,
    vend ? { id: vend.id, name: vend.name, bankChangedDay: vend.bankChangedDay } : undefined,
    earlier,
    rules
  );
  v.evidence = { ...v.evidence, date: dateForDay(inv.receivedDay), contractClause: ct?.clause ?? '' };
  return v;
}

type DayTotalRow = { day: number; autoPaidCents: bigint; autoPaidCount: number; holdCount: number; rejectedCount: number; txnCount: number };
function bumpDay(ctx: Ctx, day: number, f: (t: DayTotalRow) => DayTotalRow) {
  const cur = ctx.db.dayTotal.day.find(day);
  const next = f(cur ?? { day, autoPaidCents: 0n, autoPaidCount: 0, holdCount: 0, rejectedCount: 0, txnCount: 0 });
  if (cur) ctx.db.dayTotal.day.update(next); else ctx.db.dayTotal.insert(next);
}

const QUESTION_HINT: Record<string, string> = {
  location_mismatch: 'Was this card used by a different truck or driver that day?',
  rate_variance: 'Is the higher unit price agreed anywhere outside the contract?',
  duplicate_invoice: 'Which PO is the real one?',
  short_received: 'Pay the received quantity only, or wait for the rest?',
  vendor_bank_change: 'Call the vendor on a known number and record who confirmed the new account.',
  po_mismatch: 'Which PO does this invoice belong to?',
  capacity_exceeded: '',
  limit: 'Approve this payment above the auto-pay limit?',
};

// Writes the outcome of one verdict: match_result, then payment or hold (+ task), with audit.
// `requester` is who caused this evaluation (the database for the clock, the caller for an injected row).
function settle(ctx: Ctx, txnRef: string, kind: string, cents: bigint, day: number, v: Verdict, opts: { rematch?: boolean; requester?: Identity } = {}) {
  const existing = ctx.db.matchResult.txnRef.find(txnRef);
  const row = { txnRef, kind, code: v.code, cents, day, evidenceJson: JSON.stringify(v.evidence), ruleId: v.ruleId, decidedAt: ctx.timestamp };
  if (existing) ctx.db.matchResult.txnRef.update(row); else ctx.db.matchResult.insert(row);
  if (!opts.rematch) bumpDay(ctx, day, t => ({ ...t, txnCount: t.txnCount + 1 }));

  if (v.code === 'duplicate_toll') {
    if (existing?.code !== 'duplicate_toll') bumpDay(ctx, day, t => ({ ...t, rejectedCount: t.rejectedCount + 1 }));
    audit(ctx, 'auto_reject', txnRef, `duplicate_toll of ${String(v.evidence.duplicateOf)}`);
    return;
  }

  if (v.code === 'matched') {
    const total = ctx.db.dayTotal.day.find(day)?.autoPaidCents ?? 0n;
    const decision = autoPayDecision(cents, total);
    if (decision === 'pay') {
      if (!ctx.db.payment.txnRef.find(txnRef)) {
        ctx.db.payment.insert({ txnRef, cents, day, releasedBy: ctx.sender, releasedRole: v.ruleId ? 'rule' : 'kernel', at: ctx.timestamp });
        bumpDay(ctx, day, t => ({ ...t, autoPaidCents: t.autoPaidCents + cents, autoPaidCount: t.autoPaidCount + 1 }));
      }
      const h = ctx.db.hold.txnRef.find(txnRef);
      if (h && h.status !== 'released') {
        ctx.db.hold.txnRef.update({ ...h, status: 'cleared_by_rule', ruleId: v.ruleId, actor: ctx.sender, updatedAt: ctx.timestamp });
      }
      if (v.ruleId !== undefined) {
        const r = ctx.db.rule.id.find(v.ruleId);
        if (r && r.uses === 'one_time') ctx.db.rule.id.update({ ...r, status: 'expired', reason: `one_time rule consumed by ${txnRef}` });
      }
      audit(ctx, v.ruleId !== undefined ? 'cleared_by_rule' : 'auto_pay', txnRef, v.ruleId !== undefined ? `rule ${v.ruleId}` : `${cents} cents`);
      return;
    }
    v = { code: 'limit', evidence: { ...v.evidence, limitReason: cents > T.AUTO_PAY_MAX_CENTS ? 'per_transaction' : 'daily_cap' } };
    ctx.db.matchResult.txnRef.update({ ...row, code: 'limit', evidenceJson: JSON.stringify(v.evidence) });
  }

  // a hold, raised by code
  const h = ctx.db.hold.txnRef.find(txnRef);
  if (!h) {
    ctx.db.hold.insert({
      txnRef, kind, code: v.code, cents, day, requestedBy: opts.requester ?? ctx.identity, reason: `kernel: ${v.code}`,
      question: undefined, answer: undefined, callbackNote: undefined, status: 'open', ruleId: undefined, actor: ctx.sender, updatedAt: ctx.timestamp,
    });
    bumpDay(ctx, day, t => ({ ...t, holdCount: t.holdCount + 1 }));
    audit(ctx, 'hold', txnRef, v.code);
  } else if (h.code !== v.code) {
    ctx.db.hold.txnRef.update({ ...h, code: v.code, actor: ctx.sender, updatedAt: ctx.timestamp });
    audit(ctx, 'hold_recoded', txnRef, `${h.code} -> ${v.code}`);
  }
  if (!opts.rematch && v.code !== 'limit') {
    const brief = { txnRef, kind, code: v.code, cents: cents.toString(), day, date: dateForDay(day), evidence: v.evidence, questionHint: QUESTION_HINT[v.code] ?? '' };
    ctx.db.agentTask.insert({
      id: 0n, txnRef, kind: 'investigate', status: 'open', version: 0, claimedBy: undefined, claimedAt: undefined,
      briefJson: JSON.stringify(brief), stepsJson: '[]', findingJson: '', source: 'none', createdDay: day, createdAt: ctx.timestamp, updatedAt: ctx.timestamp,
    });
  }
}

const byTime = <R extends { id: string; at: { microsSinceUnixEpoch: bigint } }>(a: R, b: R) =>
  a.at.microsSinceUnixEpoch < b.at.microsSinceUnixEpoch ? -1 : a.at.microsSinceUnixEpoch > b.at.microsSinceUnixEpoch ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

function matchDay(ctx: Ctx, day: number) {
  const rules = approvedRules(ctx);
  for (const c of [...ctx.db.cardTxn.day.filter(day)].sort(byTime)) {
    if (ctx.db.matchResult.txnRef.find(c.id)) continue; // re-running a day is a no-op
    settle(ctx, c.id, 'card', c.cents, day, evaluateCard(ctx, c, rules));
  }
  for (const tl of [...ctx.db.tollTxn.day.filter(day)].sort(byTime)) {
    if (ctx.db.matchResult.txnRef.find(tl.id)) continue;
    settle(ctx, tl.id, 'toll', tl.cents, day, evaluateTollRow(ctx, tl));
  }
  for (const inv of [...ctx.db.invoice.receivedDay.filter(day)].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    if (ctx.db.matchResult.txnRef.find(inv.id)) continue;
    settle(ctx, inv.id, 'invoice', inv.cents, day, evaluateInvoiceRow(ctx, inv, rules));
  }
}

// Re-evaluate one transaction with the rules approved now (so the demo does not wait for the next tick).
function checkRematch(ctx: Ctx, txnRef: string): Refusal {
  const h = ctx.db.hold.txnRef.find(txnRef);
  if (h && (h.status === 'released' || h.status === 'rejected')) return `hold already ${h.status}`;
  if (!ctx.db.cardTxn.id.find(txnRef) && !ctx.db.tollTxn.id.find(txnRef) && !ctx.db.invoice.id.find(txnRef)) return 'no such transaction';
  return null;
}
function rematchOne(ctx: Ctx, txnRef: string) {
  const rules = approvedRules(ctx);
  const c = ctx.db.cardTxn.id.find(txnRef);
  if (c) { settle(ctx, c.id, 'card', c.cents, c.day, evaluateCard(ctx, c, rules), { rematch: true }); return; }
  const tl = ctx.db.tollTxn.id.find(txnRef);
  if (tl) { settle(ctx, tl.id, 'toll', tl.cents, tl.day, evaluateTollRow(ctx, tl), { rematch: true }); return; }
  const inv = ctx.db.invoice.id.find(txnRef);
  if (inv) { settle(ctx, inv.id, 'invoice', inv.cents, inv.receivedDay, evaluateInvoiceRow(ctx, inv, rules), { rematch: true }); return; }
}
function performRematch(ctx: Ctx, txnRef: string) {
  rematchOne(ctx, txnRef);
  audit(ctx, 'rematch', txnRef, '');
}
export const rematch = spacetimedb.reducer({ txnRef: t.string() }, (ctx, { txnRef }) =>
  guard(ctx, txnRef, checkRole(ctx, 'controller') ?? checkRematch(ctx, txnRef), () => performRematch(ctx, txnRef)));
export const tryRematch = spacetimedb.procedure({ txnRef: t.string() }, Outcome, (ctx, { txnRef }) =>
  attempt(ctx, txnRef, tx => checkRole(tx, 'controller') ?? checkRematch(tx, txnRef), tx => performRematch(tx, txnRef)));

// ---------------------------------------------------------------------------
// agent reducers (the worker). Version-locked claim makes two workers safe.
// ---------------------------------------------------------------------------
export const claimTask = spacetimedb.reducer({ id: t.u64(), version: t.u32() }, (ctx, { id, version }) => {
  requireRole(ctx, String(id), 'agent');
  const row = ctx.db.agentTask.id.find(id);
  if (!row || row.status !== 'open') throw new SenderError('task unavailable or already claimed');
  if (row.version !== version) throw new SenderError('stale claim');
  ctx.db.agentTask.id.update({ ...row, status: 'claimed', version: row.version + 1, claimedBy: ctx.sender, claimedAt: ctx.timestamp, updatedAt: ctx.timestamp });
  audit(ctx, 'claim_task', String(id), row.txnRef);
});

// The worker writes back what Droid did and found. recommendation: clear | hold | hold_and_ask | timeout | done
export const recordInvestigation = spacetimedb.reducer(
  { id: t.u64(), stepsJson: t.string(), findingJson: t.string(), recommendation: t.string(), question: t.option(t.string()), source: t.string() },
  (ctx, { id, stepsJson, findingJson, recommendation, question, source }) => {
    requireRole(ctx, String(id), 'agent');
    const row = ctx.db.agentTask.id.find(id);
    if (!row) refuse(ctx, String(id), 'no such task');
    if (!row.claimedBy || !row.claimedBy.isEqual(ctx.sender)) refuse(ctx, String(id), 'task not claimed by caller');
    if (row.status !== 'claimed') refuse(ctx, String(id), `task is ${row.status}`);
    if (!['clear', 'hold', 'hold_and_ask', 'timeout', 'done'].includes(recommendation)) refuse(ctx, String(id), `bad recommendation ${recommendation}`);
    if (stepsJson.length > 200_000 || findingJson.length > 50_000) refuse(ctx, String(id), 'payload too large');
    const status = recommendation === 'timeout' ? 'timeout' : 'investigated';
    ctx.db.agentTask.id.update({ ...row, status, version: row.version + 1, stepsJson, findingJson, source, updatedAt: ctx.timestamp });

    const h = ctx.db.hold.txnRef.find(row.txnRef);
    if (h && h.status === 'open') {
      if (recommendation === 'hold_and_ask' && question) {
        ctx.db.hold.txnRef.update({ ...h, question, status: 'awaiting_controller', actor: ctx.sender, updatedAt: ctx.timestamp });
      } else if (recommendation === 'clear') {
        // the agent proposes release; it can never approve its own proposal (see approvePayment)
        ctx.db.hold.txnRef.update({ ...h, requestedBy: ctx.sender, reason: 'agent recommends release', question: question ?? 'Agent recommends release. Approve the payment?', status: 'awaiting_controller', actor: ctx.sender, updatedAt: ctx.timestamp });
      } else if (recommendation === 'hold') {
        ctx.db.hold.txnRef.update({ ...h, reason: 'agent confirms hold', question: question ?? h.question, status: question ? 'awaiting_controller' : 'open', actor: ctx.sender, updatedAt: ctx.timestamp });
      }
    }
    audit(ctx, 'record_investigation', String(id), `${row.txnRef} ${recommendation} (${source})`);
  }
);

// The module computes the backtest itself from match_result and hold. The worker's numbers are a preview only.
function backtest(ctx: Ctx, condition: string, scope: RuleScope, fromDay: number, toDay: number) {
  const probe: RuleIn = { id: 0n, condition, scope, validFromDay: fromDay, validToDay: toDay };
  let n = 0, open = 0, confirmed = 0;
  const refs: string[] = [];
  const consider = (txnRef: string, day: number, evidenceJson: string) => {
    let ev: Record<string, unknown> = {};
    try { ev = JSON.parse(evidenceJson); } catch { ev = {}; }
    const facts = {
      day,
      driverId: typeof ev.driverId === 'number' ? ev.driverId : undefined,
      truckId: typeof ev.truckId === 'number' ? ev.truckId : undefined,
      cardId: typeof ev.cardId === 'string' ? ev.cardId : undefined,
      vendorId: typeof ev.vendorId === 'number' ? ev.vendorId : undefined,
    };
    if (!ruleCovers(probe, condition, facts)) return;
    n += 1;
    refs.push(txnRef);
    const h = ctx.db.hold.txnRef.find(txnRef);
    if (h?.status === 'rejected') confirmed += 1;
    else if (h && APPROVABLE.includes(h.status)) open += 1;
  };
  // rows still flagged with this code, plus holds that carry the code (their match_result may have changed)
  const seen = new Set<string>();
  for (const m of ctx.db.matchResult.code.filter(condition)) { seen.add(m.txnRef); consider(m.txnRef, m.day, m.evidenceJson); }
  for (const h of ctx.db.hold.code.filter(condition)) {
    if (seen.has(h.txnRef)) continue;
    const m = ctx.db.matchResult.txnRef.find(h.txnRef);
    if (m) consider(h.txnRef, h.day, m.evidenceJson);
  }
  return { n, wouldClear: n, openHoldsCovered: open, confirmedExceptionsCovered: confirmed, trueExceptionsCleared: confirmed,
    window: { fromDay, toDay }, sampleRefs: refs.slice(0, 12), computedBy: 'module' };
}

export const createRule = spacetimedb.reducer(
  { sourceTxnRef: t.string(), scopeJson: t.string(), condition: t.string(), backtestJson: t.string(), uses: t.string(), validFromDay: t.i32(), validToDay: t.i32(), reason: t.string() },
  (ctx, { sourceTxnRef, scopeJson, condition, backtestJson, uses, validFromDay, validToDay, reason }) => {
    requireRole(ctx, sourceTxnRef, 'agent');
    if (!(RULE_CONDITIONS as readonly string[]).includes(condition)) refuse(ctx, sourceTxnRef, `rules may not target ${condition}`);
    if (!['one_time', 'standing'].includes(uses)) refuse(ctx, sourceTxnRef, 'uses must be one_time or standing');
    if (validToDay < validFromDay) refuse(ctx, sourceTxnRef, 'rule window is empty');
    if (validToDay - validFromDay > 92) refuse(ctx, sourceTxnRef, 'rule window too long');
    const scope = parseScope(scopeJson);
    const scoped = scope.driverId !== undefined || (scope.truckIds && scope.truckIds.length > 0) || scope.cardId !== undefined || scope.vendorId !== undefined;
    if (!scoped) refuse(ctx, sourceTxnRef, 'rule must be scoped to a driver, truck, card or vendor');
    const bt = backtest(ctx, condition, scope, validFromDay, validToDay);
    if (bt.trueExceptionsCleared > 0) refuse(ctx, sourceTxnRef, `rule would clear ${bt.trueExceptionsCleared} confirmed exception(s)`);
    let preview: unknown = null;
    try { preview = JSON.parse(backtestJson); } catch { preview = null; }
    const inserted = ctx.db.rule.insert({
      id: 0n, sourceTxnRef, scopeJson: JSON.stringify(scope), condition, action: 'clear', backtestJson: JSON.stringify({ ...bt, workerPreview: preview }),
      status: 'candidate', uses, validFromDay, validToDay, createdBy: ctx.sender, approvedBy: undefined, reason, createdAt: ctx.timestamp,
    });
    audit(ctx, 'create_rule', String(inserted.id), `${condition} ${JSON.stringify(scope)} days ${validFromDay}-${validToDay}; backtest n=${bt.n} confirmed=${bt.confirmedExceptionsCovered}`);
  }
);

// ---------------------------------------------------------------------------
// controller actions (the ASI:One agent and the demo laptop)
// ---------------------------------------------------------------------------
const MAX_TEXT = 1000;
const MAX_NOTE = 500;
function textLimit(text: string | undefined, max: number, what: string): Refusal {
  if (text === undefined) return null;
  if (text.trim().length === 0) return `${what} is empty`;
  if (text.length > max) return `${what} is longer than ${max} characters`;
  return null;
}
function checkAnswerQuestion(ctx: Ctx, txnRef: string, text?: string): Refusal {
  const r = checkRole(ctx, 'controller'); if (r) return r;
  const h = ctx.db.hold.txnRef.find(txnRef);
  if (!h) return 'no such hold';
  if (h.status === 'released' || h.status === 'rejected' || h.status === 'cleared_by_rule') return `hold already ${h.status}`;
  return textLimit(text, MAX_TEXT, 'answer');
}
function performAnswerQuestion(ctx: Ctx, txnRef: string, text: string) {
  const h = ctx.db.hold.txnRef.find(txnRef)!;
  ctx.db.hold.txnRef.update({ ...h, answer: text, status: 'answered', actor: ctx.sender, updatedAt: ctx.timestamp });
  const mr = ctx.db.matchResult.txnRef.find(txnRef);
  let evidence: unknown = {};
  try { evidence = mr ? JSON.parse(mr.evidenceJson) : {}; } catch { evidence = {}; }
  const brief = { txnRef, kind: h.kind, code: h.code, cents: h.cents.toString(), day: h.day, date: dateForDay(h.day), question: h.question ?? '', answer: text, evidence };
  const day = currentDay(ctx);
  ctx.db.agentTask.insert({
    id: 0n, txnRef, kind: 'draft_rule', status: 'open', version: 0, claimedBy: undefined, claimedAt: undefined,
    briefJson: JSON.stringify(brief), stepsJson: '[]', findingJson: '', source: 'none', createdDay: day, createdAt: ctx.timestamp, updatedAt: ctx.timestamp,
  });
  audit(ctx, 'answer_question', txnRef, text.slice(0, 200));
}
export const answerQuestion = spacetimedb.reducer({ txnRef: t.string(), text: t.string() }, (ctx, { txnRef, text }) =>
  guard(ctx, txnRef, checkAnswerQuestion(ctx, txnRef, text), () => performAnswerQuestion(ctx, txnRef, text)));
export const tryAnswerQuestion = spacetimedb.procedure({ txnRef: t.string(), text: t.string() }, Outcome, (ctx, { txnRef, text }) =>
  attempt(ctx, txnRef, tx => checkAnswerQuestion(tx, txnRef, text), tx => performAnswerQuestion(tx, txnRef, text)));

function checkApproveRule(ctx: Ctx, id: bigint): Refusal {
  const r = checkRole(ctx, 'controller'); if (r) return r;
  const rule_ = ctx.db.rule.id.find(id);
  if (!rule_) return 'no such rule';
  if (rule_.status !== 'candidate') return `rule is ${rule_.status}`;
  if (rule_.createdBy.isEqual(ctx.sender)) return 'author cannot approve own rule';
  return null;
}
function performApproveRule(ctx: Ctx, id: bigint) {
  const r = ctx.db.rule.id.find(id)!;
  ctx.db.rule.id.update({ ...r, status: 'approved', approvedBy: ctx.sender });
  audit(ctx, 'approve_rule', String(id), `${r.condition} ${r.scopeJson}`);
  if (checkRematch(ctx, r.sourceTxnRef) === null) rematchOne(ctx, r.sourceTxnRef);
}
export const approveRule = spacetimedb.reducer({ id: t.u64() }, (ctx, { id }) =>
  guard(ctx, String(id), checkApproveRule(ctx, id), () => performApproveRule(ctx, id)));
export const tryApproveRule = spacetimedb.procedure({ id: t.u64() }, Outcome, (ctx, { id }) =>
  attempt(ctx, String(id), tx => checkApproveRule(tx, id), tx => performApproveRule(tx, id)));

function checkRejectRule(ctx: Ctx, id: bigint): Refusal {
  const r = checkRole(ctx, 'controller'); if (r) return r;
  const rule_ = ctx.db.rule.id.find(id);
  if (!rule_) return 'no such rule';
  if (rule_.status !== 'candidate') return `rule is ${rule_.status}`;
  return null;
}
function performRejectRule(ctx: Ctx, id: bigint, reason: string) {
  const r = ctx.db.rule.id.find(id)!;
  ctx.db.rule.id.update({ ...r, status: 'rejected', reason });
  audit(ctx, 'reject_rule', String(id), reason);
}
export const rejectRule = spacetimedb.reducer({ id: t.u64(), reason: t.string() }, (ctx, { id, reason }) =>
  guard(ctx, String(id), checkRejectRule(ctx, id), () => performRejectRule(ctx, id, reason)));
export const tryRejectRule = spacetimedb.procedure({ id: t.u64(), reason: t.string() }, Outcome, (ctx, { id, reason }) =>
  attempt(ctx, String(id), tx => checkRejectRule(tx, id), tx => performRejectRule(tx, id, reason)));

// A bank change is re-checked at approval time, not only at receipt: a vendor whose account changed
// within the window before today still needs a call-back note on any payment over the threshold.
function bankChangeActive(ctx: Ctx, txnRef: string, cents: bigint): boolean {
  if (cents <= T.BANK_CHANGE_MIN_CENTS) return false;
  const inv = ctx.db.invoice.id.find(txnRef);
  if (!inv) return false;
  const v = ctx.db.vendor.id.find(inv.vendorId);
  if (!v || v.bankChangedDay <= 0) return false;
  const since = currentDay(ctx) - v.bankChangedDay;
  return since >= 0 && since <= T.BANK_CHANGE_DAYS;
}
function checkApprovePayment(ctx: Ctx, txnRef: string, callbackNote: string | undefined): Refusal {
  const r = checkRole(ctx, 'controller'); if (r) return r;
  const h = ctx.db.hold.txnRef.find(txnRef);
  if (!h) return 'no such hold';
  if (!APPROVABLE.includes(h.status)) return `hold is ${h.status}`;
  if (h.requestedBy.isEqual(ctx.sender)) return 'requester cannot approve';
  if (ctx.db.payment.txnRef.find(txnRef)) return 'already paid';
  const needsNote = h.code === 'vendor_bank_change' || bankChangeActive(ctx, txnRef, h.cents);
  if (needsNote && (!callbackNote || callbackNote.trim().length < 8)) return 'call-back note required for a bank change';
  return textLimit(callbackNote, MAX_NOTE, 'call-back note');
}
function performApprovePayment(ctx: Ctx, txnRef: string, callbackNote: string | undefined) {
  const h = ctx.db.hold.txnRef.find(txnRef)!;
  ctx.db.hold.txnRef.update({ ...h, status: 'released', callbackNote, actor: ctx.sender, updatedAt: ctx.timestamp });
  ctx.db.payment.insert({ txnRef, cents: h.cents, day: currentDay(ctx), releasedBy: ctx.sender, releasedRole: 'controller', at: ctx.timestamp });
  audit(ctx, 'approve_payment', txnRef, callbackNote ?? '');
}
export const approvePayment = spacetimedb.reducer({ txnRef: t.string(), callbackNote: t.option(t.string()) }, (ctx, { txnRef, callbackNote }) =>
  guard(ctx, txnRef, checkApprovePayment(ctx, txnRef, callbackNote), () => performApprovePayment(ctx, txnRef, callbackNote)));
export const tryApprovePayment = spacetimedb.procedure({ txnRef: t.string(), callbackNote: t.option(t.string()) }, Outcome, (ctx, { txnRef, callbackNote }) =>
  attempt(ctx, txnRef, tx => checkApprovePayment(tx, txnRef, callbackNote), tx => performApprovePayment(tx, txnRef, callbackNote)));

function checkRejectPayment(ctx: Ctx, txnRef: string, reason?: string): Refusal {
  const r = checkRole(ctx, 'controller'); if (r) return r;
  const h = ctx.db.hold.txnRef.find(txnRef);
  if (!h) return 'no such hold';
  if (!APPROVABLE.includes(h.status)) return `hold is ${h.status}`;
  return textLimit(reason, MAX_NOTE, 'reason');
}
function performRejectPayment(ctx: Ctx, txnRef: string, reason: string) {
  const h = ctx.db.hold.txnRef.find(txnRef)!;
  ctx.db.hold.txnRef.update({ ...h, status: 'rejected', reason, actor: ctx.sender, updatedAt: ctx.timestamp });
  audit(ctx, 'reject_payment', txnRef, reason);
}
export const rejectPayment = spacetimedb.reducer({ txnRef: t.string(), reason: t.string() }, (ctx, { txnRef, reason }) =>
  guard(ctx, txnRef, checkRejectPayment(ctx, txnRef, reason), () => performRejectPayment(ctx, txnRef, reason)));
export const tryRejectPayment = spacetimedb.procedure({ txnRef: t.string(), reason: t.string() }, Outcome, (ctx, { txnRef, reason }) =>
  attempt(ctx, txnRef, tx => checkRejectPayment(tx, txnRef, reason), tx => performRejectPayment(tx, txnRef, reason)));

// A judge scenario: insert one fuel transaction into the current day and run the kernel on it.
// The caller is recorded as the hold's requester, so the same controller cannot approve what it injected.
export const injectCardTxn = spacetimedb.reducer({ row: cardTxn.rowType }, (ctx, { row }) => {
  requireRole(ctx, row.id, 'controller');
  if (ctx.db.cardTxn.id.find(row.id)) refuse(ctx, row.id, 'txn id exists');
  const day = currentDay(ctx);
  const inserted = { ...row, day };
  ctx.db.cardTxn.insert(inserted);
  audit(ctx, 'inject', row.id, `truck ${row.truckId} ${row.gallons} gal`);
  settle(ctx, row.id, 'card', row.cents, day, evaluateCard(ctx, inserted, approvedRules(ctx)), { requester: ctx.sender });
});
// Record and replay. WORKER_MODE=record writes a live finding to seed/fixtures/investigations/<txnRef>.json;
// replay serves it back labelled 'replayed'. With no fixture, a scripted stand-in is returned and says so.
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { nowIso } from './config.js';
import { centsToDollars, type Brief } from './brief.js';
import { FindingSchema, parseFinding, verifyEvidence, type EvidenceRef, type Finding } from './finding.js';

export const STAND_IN_PREFIX = 'Scripted stand-in, not a model.';

export type Step =
  | { type: 'tool_call'; at: string; name: string; toolUseId: string; input: unknown }
  | { type: 'tool_result'; at: string; toolUseId: string; toolName: string; content: string; isError: boolean }
  | { type: 'assistant'; at: string; text: string }
  | { type: 'note'; at: string; text: string }
  | { type: 'result'; at: string; subtype: string; durationMs: number; success: boolean };

export const StepSchema: z.ZodType<Step> = z.discriminatedUnion('type', [
  z.object({ type: z.literal('tool_call'), at: z.string(), name: z.string(), toolUseId: z.string(), input: z.unknown() }),
  z.object({ type: z.literal('tool_result'), at: z.string(), toolUseId: z.string(), toolName: z.string(), content: z.string(), isError: z.boolean() }),
  z.object({ type: z.literal('assistant'), at: z.string(), text: z.string() }),
  z.object({ type: z.literal('note'), at: z.string(), text: z.string() }),
  z.object({ type: z.literal('result'), at: z.string(), subtype: z.string(), durationMs: z.number(), success: z.boolean() }),
]) as z.ZodType<Step>;

export const FixtureSchema = z.object({
  recorded: z.boolean().optional(),
  note: z.string().optional(),
  finding: FindingSchema,
  steps: z.array(StepSchema),
  recordedAt: z.string(),
});
export type Fixture = z.infer<typeof FixtureSchema>;

export interface InvestigationOutcome {
  finding: Finding;
  steps: Step[];
  source: 'live' | 'replayed' | 'none';
}

const SAFE_REF = /^[A-Za-z0-9_-]{1,40}$/;

export function fixturePath(fixturesDir: string, txnRef: string): string | undefined {
  if (!SAFE_REF.test(txnRef)) return undefined;
  return path.join(fixturesDir, `${txnRef}.json`);
}

export function recordFixture(fixturesDir: string, txnRef: string, finding: Finding, steps: Step[]): string | undefined {
  const file = fixturePath(fixturesDir, txnRef);
  if (!file) return undefined;
  fs.mkdirSync(fixturesDir, { recursive: true });
  const body: Fixture = {
    recorded: true,
    note: `Recorded from a live Droid run in WORKER_MODE=record. Replayed verbatim when the worker runs offline.`,
    finding,
    steps,
    recordedAt: nowIso(),
  };
  fs.writeFileSync(file, JSON.stringify(body, null, 2) + '\n');
  return file;
}

export function loadFixture(fixturesDir: string, txnRef: string): Fixture | undefined {
  const file = fixturePath(fixturesDir, txnRef);
  if (!file || !fs.existsSync(file)) return undefined;
  const parsed = FixtureSchema.safeParse(JSON.parse(fs.readFileSync(file, 'utf8')));
  if (!parsed.success) {
    throw new Error(`fixture ${path.basename(file)} is malformed: ${parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  }
  return parsed.data;
}

// Replay a recorded fixture. Every evidence item is checked against its source (file text, the fixture's own
// tool results, the brief's kernel evidence) and dropped with a note when it does not hold up. When EVIDENCE_DIR
// is absent the check fails closed: file-sourced items are dropped as unverifiable.
export function replayFixture(fixture: Fixture, brief: Pick<Brief, 'txnRef' | 'evidence'>, evidenceDir: string): InvestigationOutcome {
  const requireFiles = fs.existsSync(evidenceDir);
  const checked = parseFinding(fixture.finding, evidenceDir, { requireFiles });
  const verified = verifyEvidence(checked, { evidenceDir, brief, steps: fixture.steps });
  const finding: Finding = { ...verified.finding, status: 'replayed' };
  const steps: Step[] = [
    ...fixture.steps,
    ...verified.notes.map((text): Step => ({ type: 'note', at: nowIso(), text })),
    { type: 'note', at: nowIso(), text: `replayed from fixtures/investigations/${brief.txnRef}.json` },
  ];
  return { finding, steps, source: 'replayed' };
}

// The deterministic stand-in: states the kernel code and the key numbers, recommends by code, never invents.
export function standInFinding(brief: Brief): Finding {
  const ev = brief.evidence;
  const evidence: EvidenceRef[] = [];
  const push = (ref: string, quote: string) => evidence.push({ source: 'kernel', ref, quote: quote.slice(0, 400) });
  push('match_result.code', `${brief.code} on ${brief.kind} ${brief.txnRef}, day ${brief.day}, ${centsToDollars(brief.cents)}`);
  if (ev.distanceMiles !== undefined) push('evidence.distanceMiles', `${ev.distanceMiles} miles from the nearest ping, threshold ${ev.thresholdMiles ?? '?'} miles`);
  if (ev.nearestPing) push('evidence.nearestPing', `lat ${ev.nearestPing.lat}, lon ${ev.nearestPing.lon}, ${ev.nearestPing.deltaMin ?? '?'} min from the transaction`);
  if (ev.nearestPing === null && ev.reason) push('evidence.reason', ev.reason);
  if (ev.gallons !== undefined && ev.tankGal !== undefined) push('evidence.gallons', `${ev.gallons} gal against a ${ev.tankGal} gal tank (limit ${ev.capacityLimitGal})`);
  if (ev.stationName) push('evidence.stationName', ev.stationName);
  if (ev.truckId !== undefined) push('evidence.truckId', `truck ${ev.truckId}${ev.plate ? ` plate ${ev.plate}` : ''}${ev.cardId ? ` card ${ev.cardId}` : ''}`);
  if (ev.driverId !== undefined) push('evidence.driverId', `driver ${ev.driverId}${ev.driverName ? ` ${ev.driverName}` : ''}`);
  for (const k of ['vendorId', 'contractRateCents', 'invoiceUnitCents', 'varianceRatio', 'duplicateOf', 'orderedQty', 'receivedQty', 'bankChangedDay'] as const) {
    const v = (ev as Record<string, unknown>)[k];
    if (v !== undefined && v !== null && typeof v !== 'object') push(`evidence.${k}`, `${k} ${String(v)}`);
  }

  const numbers: string[] = [];
  if (ev.distanceMiles !== undefined) numbers.push(`${ev.distanceMiles} miles from the nearest ping (threshold ${ev.thresholdMiles ?? '?'})`);
  if (ev.gallons !== undefined) numbers.push(`${ev.gallons} gallons${ev.tankGal !== undefined ? ` into a ${ev.tankGal} gallon tank` : ''}`);
  if (ev.truckId !== undefined) numbers.push(`truck ${ev.truckId}`);
  if (ev.driverId !== undefined) numbers.push(`driver ${ev.driverId}`);
  if (ev.vendorId !== undefined) numbers.push(`vendor ${ev.vendorId}`);
  const text = `${STAND_IN_PREFIX} The kernel raised ${brief.code} on ${brief.kind} ${brief.txnRef} for ${centsToDollars(brief.cents)} on day ${brief.day}${numbers.length ? `: ${numbers.join(', ')}` : ''}. No model ran; the hold stands until a person decides.`;

  let recommendation: Finding['recommendation'];
  let question: string | undefined;
  switch (brief.code) {
    case 'capacity_exceeded':
      recommendation = 'hold';
      break;
    case 'vendor_bank_change':
      recommendation = 'hold';
      question = 'Call the vendor on a known number; who confirmed the new account?';
      break;
    case 'location_mismatch':
    case 'rate_variance':
    case 'duplicate_invoice':
    case 'short_received':
      recommendation = 'hold_and_ask';
      question = brief.questionHint || 'Can you explain this transaction?';
      break;
    default:
      recommendation = 'hold';
  }
  return {
    finding: text.slice(0, 1000),
    evidence,
    recommendation,
    ...(question ? { question_for_controller: question } : {}),
    confidence: 0.5,
    status: 'no_fixture',
    model: 'stand-in',
  };
}

export function standIn(brief: Brief): InvestigationOutcome {
  return {
    finding: standInFinding(brief),
    steps: [{ type: 'note', at: nowIso(), text: `scripted stand-in, not a model: no fixture at fixtures/investigations/${brief.txnRef}.json` }],
    source: 'none',
  };
}

// Replay when a fixture exists, otherwise the stand-in. Used in replay mode and as the live fallback.
export function replayOrStandIn(brief: Brief, fixturesDir: string, evidenceDir: string, log: (msg: string) => void = () => {}): InvestigationOutcome {
  let fixture: Fixture | undefined;
  try {
    fixture = loadFixture(fixturesDir, brief.txnRef);
  } catch (err) {
    log(`fixture for ${brief.txnRef} unreadable: ${(err as Error).message}`);
  }
  if (fixture) {
    try {
      if (!fs.existsSync(evidenceDir)) log(`evidence dir ${evidenceDir} is absent; file-sourced evidence in the fixture is dropped as unverifiable`);
      return replayFixture(fixture, brief, evidenceDir);
    } catch (err) {
      log(`fixture for ${brief.txnRef} rejected: ${(err as Error).message}`);
    }
  }
  return standIn(brief);
}
"""`handle(sender_id, text) -> str`: the one entry point the uAgent and the CLI share.

Every controller action goes through the module's `try_*` procedures, so a refusal comes back as
`[false, message]` and is kept in audit_event; the reply shows that message verbatim after "Refused: ".

Per sender it remembers the last transaction discussed, so a bare free-text line with no model key
still lands as the answer to the right hold. A line that looks like a mistyped command never does.

Controller text is bounded here, before any network call, with the same limits the module enforces
(docs/CONTRACT.md): answers up to 1000 characters, call-back notes and reasons up to 500, none blank.
"""

from __future__ import annotations

import os
import unicodedata

from . import formatting as fmt
from . import intents, ledger
from .ledger import BadReference, LedgerError, LedgerRefused

LAST_REF: dict[str, str] = {}   # sender -> last txnRef discussed
TOTAL_DAYS = 92

MAX_ANSWER = 1000
MAX_NOTE = 500      # call-back notes, payment rejection reasons, rule rejection reasons


class TextRefused(ValueError):
    """Controller text the module would refuse; reported as "Refused: ..." without calling it."""


def _js_length(text: str) -> int:
    """Length as the module counts it (JavaScript string length, UTF-16 code units)."""
    return len(text.encode("utf-16-le")) // 2


def bound_text(text: str | None, max_len: int, what: str) -> str:
    """Drop control characters other than newline, strip, refuse blank or over-long text."""
    cleaned = "".join(ch for ch in (text or "") if ch == "\n" or unicodedata.category(ch) != "Cc").strip()
    if not cleaned:
        raise TextRefused(f"{what} is empty")
    if _js_length(cleaned) > max_len:
        raise TextRefused(f"{what} is longer than {max_len} characters")
    return cleaned


def handle(sender_id: str, text: str) -> str:
    text = (text or "").strip()
    intent = intents.parse(text)
    try:
        if intent is None:
            intent = _free_text(sender_id, text)
        return _dispatch(sender_id, intent)
    except BadReference as e:
        return str(e)
    except (LedgerRefused, TextRefused) as e:
        return fmt.refused(str(e))
    except LedgerError as e:
        return f"Ledger error: {e}"


# ---- free text ----

def _awaiting() -> list[dict]:
    return ledger.sql("SELECT * FROM hold WHERE status = 'awaiting_controller'")


def _free_text(sender_id: str, text: str) -> intents.Intent:
    if intents.looks_like_command(text):
        return intents.Intent("help")
    awaiting = _awaiting() if os.getenv("ASI_ONE_API_KEY") else []
    intent = intents.classify(text, awaiting)
    if intent is not None:
        if intent.name == "answer" and not intent.ref:
            intent.ref = LAST_REF.get(sender_id) or (awaiting[0]["txn_ref"] if len(awaiting) == 1 else None)
        if intent.name == "answer" and not intent.ref:
            return intents.Intent("help")
        return intent
    last = LAST_REF.get(sender_id)
    if last:
        return intents.Intent("answer", ref=last, text=text, via="fallback")
    return intents.Intent("help")


# ---- dispatch ----

def _dispatch(sender_id: str, it: intents.Intent) -> str:
    name = it.name
    if name == "help":
        return fmt.HELP
    if name == "holds":
        return _holds(sender_id)
    if name == "status":
        return _status()
    if name == "rules":
        return fmt.format_rules(ledger.sql("SELECT * FROM rule"))
    if name == "pause":
        ledger.call_try("try_set_clock", True)
        return _confirm("set_clock", None, "clock paused")
    if name == "resume":
        ledger.call_try("try_set_clock", False)
        return _confirm("set_clock", None, "clock running")
    if name == "step":
        ledger.call_try("try_step_day")
        return _status(prefix="Stepped one day. ")
    if name == "approve_rule":
        rid = ledger.check_rule_id(it.ref or "")
        ledger.call_try("try_approve_rule", rid)
        return _confirm("approve_rule", str(rid))
    if name == "reject_rule":
        rid = ledger.check_rule_id(it.ref or "")
        if not it.text:
            return f"reject rule {rid} needs a reason: reject rule {rid} <reason>"
        ledger.call_try("try_reject_rule", rid, bound_text(it.text, MAX_NOTE, "reason"))
        return _confirm("reject_rule", str(rid))

    ref = ledger.check_txn_ref(it.ref or "")
    LAST_REF[sender_id] = ref
    if name == "why":
        return _why(ref)
    if name == "answer":
        if not it.text:
            return f"answer {ref} needs the text of your answer."
        ledger.call_try("try_answer_question", ref, bound_text(it.text, MAX_ANSWER, "answer"))
        return _confirm("answer_question", ref) + "\nThe worker will draft a rule from this answer; check `rules` shortly."
    if name == "approve":
        note = bound_text(it.text, MAX_NOTE, "call-back note") if it.text else None
        ledger.call_try("try_approve_payment", ref, ledger.opt(note))
        return _confirm("approve_payment", ref)
    if name == "reject":
        if not it.text:
            return f"reject {ref} needs a reason: reject {ref} <reason>"
        ledger.call_try("try_reject_payment", ref, bound_text(it.text, MAX_NOTE, "reason"))
        return _confirm("reject_payment", ref)
    return fmt.HELP


# ---- reads ----

def _holds(sender_id: str) -> str:
    rows = ledger.sql("SELECT * FROM hold WHERE status = 'awaiting_controller' OR status = 'open'")
    awaiting = [h for h in rows if h.get("status") == "awaiting_controller"]
    if len(awaiting) == 1:
        LAST_REF[sender_id] = str(awaiting[0]["txn_ref"])
    return fmt.format_holds(rows)


def _why(ref: str) -> str:
    holds = ledger.sql(f"SELECT * FROM hold WHERE txn_ref = {ledger.quote(ref)}")
    if not holds:
        return f"No hold for {ref}."
    tasks = ledger.sql(f"SELECT * FROM agent_task WHERE txn_ref = {ledger.quote(ref)}")
    investigate = [t for t in tasks if t.get("kind") == "investigate"]
    task = max(investigate, key=lambda t: int(t.get("id") or 0)) if investigate else None
    return fmt.format_why(holds[0], task)


def _status(prefix: str = "") -> str:
    days = ledger.sql("SELECT * FROM business_day WHERE id = 1")
    day = days[0] if days else None
    total = None
    if day is not None:
        n = int(day.get("day") or 0)
        totals = ledger.sql(f"SELECT * FROM day_total WHERE day = {n}")
        total = totals[0] if totals else None
    return prefix + fmt.format_status(day, total, TOTAL_DAYS)


def _confirm(action: str, ref: str | None, note: str | None = None) -> str:
    """Echo the audit row the reducer just wrote. Reads only; a failed read still confirms the call."""
    audit = None
    try:
        where = f"action = '{action}'" + (f" AND ref = {ledger.quote(ref)}" if ref else "")
        rows = ledger.sql(f"SELECT * FROM audit_event WHERE {where}")
        if rows:
            audit = max(rows, key=lambda r: int(r.get("id") or 0))
    except (LedgerError, BadReference):
        audit = None
    label = ref if ref else (audit or {}).get("ref") or "clock"
    out = fmt.confirmation(action, label, audit)
    return f"{out}. {note}" if note else out

codex
The results file reports 47 offline investigations, with 45 marked as scripted stand-ins, and zero refusals recorded in that run. I’m checking which public sentences imply broader coverage, and whether the startup script preserves the precomputed facts shown to judges.
exec
/bin/zsh -lc 'nl -ba scripts/controller_sim.py' in /Users/anudeepbonagiri/dev/hackathons/dispatch-ledger
exec
/bin/zsh -lc 'nl -ba scripts/demo_up.sh' in /Users/anudeepbonagiri/dev/hackathons/dispatch-ledger
exec
/bin/zsh -lc 'nl -ba scripts/full_run.sh' in /Users/anudeepbonagiri/dev/hackathons/dispatch-ledger
exec
/bin/zsh -lc "nl -ba context/CLAIMS_AUDIT.md | sed -n '1,110p'" in /Users/anudeepbonagiri/dev/hackathons/dispatch-ledger
exec
/bin/zsh -lc "nl -ba docs/RUNBOOK.md | sed -n '1,75p;185,215p'" in /Users/anudeepbonagiri/dev/hackathons/dispatch-ledger
 succeeded in 0ms:
     1	#!/usr/bin/env bash
     2	# Build and serve the demo month with no model calls and no network.
     3	#   scripts/demo_up.sh            start everything (server, module, identities, fixtures, worker in replay, web)
     4	#   scripts/demo_up.sh --no-web   skip the web dev server
     5	# Every model key is exported empty on purpose: a variable that is set, even to nothing, wins over .env,
     6	# so the offline run cannot make a paid call by accident.
     7	set -euo pipefail
     8	ROOT="$(cd "$(dirname "$0")/.." && pwd)"
     9	cd "$ROOT"
    10	export PATH="$HOME/.local/bin:$PATH"
    11	export FACTORY_API_KEY= ANTHROPIC_API_KEY= ELASTIC_API_KEY= ELASTICSEARCH_URL= KIBANA_URL= ASI_ONE_API_KEY=
    12	export WORKER_MODE=replay
    13	export STDB_URI=http://127.0.0.1:3100 STDB_DB=dispatch-ledger
    14	mkdir -p .spacetime logs
    15	
    16	step() { printf '\n==> %s\n' "$*"; }
    17	
    18	step "1/7 local SpacetimeDB on 127.0.0.1:3100"
    19	if ! curl -sf "$STDB_URI/v1/ping" >/dev/null 2>&1; then
    20	  nohup spacetime start --listen-addr 127.0.0.1:3100 --data-dir "$ROOT/.spacetime/data" > logs/spacetimedb.log 2>&1 &
    21	  for i in $(seq 1 40); do curl -sf "$STDB_URI/v1/ping" >/dev/null 2>&1 && break; sleep 0.5; done
    22	fi
    23	curl -sf "$STDB_URI/v1/ping" >/dev/null || { echo "server did not start; see logs/spacetimedb.log"; exit 1; }
    24	spacetime server add local3100 --url "$STDB_URI" >/dev/null 2>&1 || true
    25	
    26	step "2/7 seed identity (the publisher becomes the seed role)"
    27	touch .env
    28	if ! grep -q '^STDB_SEED_TOKEN=.\+' .env; then
    29	  SEED=$(curl -s -X POST "$STDB_URI/v1/identity")
    30	  TOKEN=$(printf '%s' "$SEED" | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
    31	  IDENT=$(printf '%s' "$SEED" | python3 -c 'import sys,json;print(json.load(sys.stdin)["identity"])')
    32	  printf 'STDB_URI=%s\nSTDB_DB=%s\nSTDB_SEED_IDENTITY=%s\nSTDB_SEED_TOKEN=%s\n' "$STDB_URI" "$STDB_DB" "$IDENT" "$TOKEN" >> .env
    33	fi
    34	SEED_TOKEN=$(grep '^STDB_SEED_TOKEN=' .env | cut -d= -f2-)
    35	spacetime login --token "$SEED_TOKEN" >/dev/null 2>&1
    36	
    37	step "3/7 publish the module (fresh data)"
    38	( cd spacetimedb && [ -d node_modules ] || npm install --silent )
    39	( cd spacetimedb && spacetime publish dispatch-ledger --module-path . --server local3100 --delete-data=always --yes 2>&1 | tail -2 )
    40	
    41	step "4/7 agent and controller identities"
    42	python3 scripts/mint_identities.py --uri "$STDB_URI" --db "$STDB_DB"
    43	
    44	step "5/7 fixtures"
    45	( cd scripts && [ -d node_modules ] || npm install --silent )
    46	( cd scripts && npx tsx load_fixtures.ts )
    47	
    48	step "6/7 worker in replay mode (logs/worker.log)"
    49	pkill -f "worker/src/index.ts" 2>/dev/null || true
    50	pkill -f "tsx src/index.ts" 2>/dev/null || true
    51	pkill -f "vite --host 127.0.0.1 --port 5173" 2>/dev/null || true
    52	pkill -f "agent/agent.py" 2>/dev/null || true
    53	sleep 1
    54	if [ -f worker/package.json ]; then
    55	  ( cd worker && [ -d node_modules ] || npm install --silent )
    56	  ( cd worker && nohup npm start > ../logs/worker.log 2>&1 & )
    57	fi
    58	
    59	if [ "${1:-}" != "--no-web" ] && [ -f web/package.json ]; then
    60	  step "7/7 web dashboard (logs/web.log)"
    61	  ( cd web && [ -d node_modules ] || npm install --silent )
    62	  ( cd web && nohup npm run dev -- --host 127.0.0.1 --port 5173 > ../logs/web.log 2>&1 & )
    63	  echo "dashboard: http://127.0.0.1:5173"
    64	fi
    65	
    66	if grep -q '^AGENT_SEED=.\+' .env && [ -d agent/.venv ]; then
    67	  step "ASI:One agent (logs/agent.log); open the Agent Inspector link it prints the first time"
    68	  ( nohup agent/.venv/bin/python agent/agent.py > logs/agent.log 2>&1 & )
    69	fi
    70	
    71	cat <<EOF
    72	
    73	Ready. The clock is paused on day 0.
    74	  scripts/clock.sh run        start the 2 second day tick
    75	  scripts/clock.sh pause      stop on the current day
    76	  scripts/clock.sh step       advance one day
    77	  scripts/clock.sh tick 500000   faster ticks (0.5 s)
    78	  python3 -m agent.cli "what needs me"   the controller's terminal (same code as the ASI:One agent)
    79	  python3 scripts/facts.py    recompute docs/FACTS.json from the ledger
    80	EOF

 succeeded in 0ms:
     1	#!/usr/bin/env python3
     2	"""A scripted fleet controller for the offline run.
     3	
     4	It does what the human controller does at the table, using only what a controller would have:
     5	the public tables and the dispatcher's swap log in the evidence folder. It never reads the answer key.
     6	
     7	For every hold waiting on the controller it decides from the swap log whether a location mismatch was a
     8	legitimate unit swap (answer yes, which lets the worker draft a scoped rule) or card misuse (reject).
     9	Other exception codes are rejected with a reason. Bank-change holds are released with a call-back note.
    10	Policy holds (`limit`) are released. Candidate rules are approved. It loops until nothing is pending.
    11	
    12	Usage: python scripts/controller_sim.py [--rounds 30] [--sleep 3] [--dry-run]
    13	"""
    14	import argparse
    15	import json
    16	import os
    17	import re
    18	import sys
    19	import time
    20	import urllib.request
    21	from datetime import date, timedelta
    22	from pathlib import Path
    23	
    24	ROOT = Path(__file__).resolve().parent.parent
    25	SWAP_LOG = ROOT / "seed/fixtures/evidence/swap_log.txt"
    26	START = date(2026, 7, 1)
    27	
    28	
    29	def load_env():
    30	    env = dict(os.environ)
    31	    p = ROOT / ".env"
    32	    if p.exists():
    33	        for line in p.read_text().splitlines():
    34	            if "=" in line and not line.strip().startswith("#"):
    35	                k, v = line.split("=", 1)
    36	                env.setdefault(k.strip(), v.strip())
    37	    return env
    38	
    39	
    40	ENV = load_env()
    41	URI, DB = ENV.get("STDB_URI", "http://127.0.0.1:3100"), ENV.get("STDB_DB", "dispatch-ledger")
    42	TOKEN = ENV.get("STDB_CONTROLLER_TOKEN", "")
    43	
    44	
    45	def day_for_date(d: date) -> int:
    46	    n, cur = 0, START
    47	    while cur <= d:
    48	        if cur.weekday() < 5:
    49	            n += 1
    50	        cur += timedelta(days=1)
    51	    return n
    52	
    53	
    54	def sql(query: str) -> list[dict]:
    55	    req = urllib.request.Request(f"{URI}/v1/database/{DB}/sql", data=query.encode(), method="POST")
    56	    with urllib.request.urlopen(req, timeout=60) as r:
    57	        res = json.loads(r.read().decode())[0]
    58	    names = [e["name"]["some"] for e in res["schema"]["elements"]]
    59	    out = []
    60	    for raw in res["rows"]:
    61	        row = {}
    62	        for k, v in zip(names, raw):
    63	            if isinstance(v, list) and len(v) == 2 and v[0] in (0, 1) and (v[0] == 1 and v[1] == [] or v[0] == 0):
    64	                v = None if v[0] == 1 else v[1]
    65	            row[k] = v
    66	        out.append(row)
    67	    return out
    68	
    69	
    70	def call_try(name: str, *args):
    71	    req = urllib.request.Request(f"{URI}/v1/database/{DB}/call/{name}", data=json.dumps(list(args)).encode(), method="POST")
    72	    req.add_header("Authorization", f"Bearer {TOKEN}")
    73	    req.add_header("Content-Type", "application/json")
    74	    try:
    75	        with urllib.request.urlopen(req, timeout=30) as r:
    76	            body = json.loads(r.read().decode())
    77	    except urllib.error.HTTPError as e:
    78	        return False, f"http {e.code}: {e.read().decode()[:200]}"
    79	    if isinstance(body, list) and len(body) == 2:
    80	        return bool(body[0]), str(body[1])
    81	    return True, str(body)
    82	
    83	
    84	SWAP_RE = re.compile(r"^(\d{4}-\d{2}-\d{2})\s+(.+?)\s+\(drv (\d+)\)\s+(\d+)\s+(\d+)\s+(.*)$")
    85	THROUGH_RE = re.compile(r"through (\d{4}-\d{2}-\d{2})")
    86	
    87	
    88	def load_swaps():
    89	    """Returns a list of {driverId, name, ownUnit, reliefUnit, fromDay, toDay, date}."""
    90	    swaps = []
    91	    if not SWAP_LOG.exists():
    92	        return swaps
    93	    for line in SWAP_LOG.read_text().splitlines():
    94	        m = SWAP_RE.match(line.strip())
    95	        if not m:
    96	            continue
    97	        d, name, drv, frm, to, reason = m.groups()
    98	        t = THROUGH_RE.search(reason)
    99	        if "moved to unit" not in reason or not t:
   100	            continue
   101	        swaps.append({
   102	            "driverId": int(drv), "name": name.strip(), "ownUnit": int(frm), "reliefUnit": int(to),
   103	            "fromDay": day_for_date(date.fromisoformat(d)), "toDay": day_for_date(date.fromisoformat(t.group(1))), "date": d,
   104	        })
   105	    return swaps
   106	
   107	
   108	def swap_for(swaps, driver_id: int, day: int):
   109	    for s in swaps:
   110	        if s["driverId"] == driver_id and s["fromDay"] <= day <= s["toDay"]:
   111	            return s
   112	    return None
   113	
   114	
   115	def dollars(cents) -> str:
   116	    return f"${int(cents) / 100:,.2f}"
   117	
   118	
   119	def main() -> int:
   120	    ap = argparse.ArgumentParser()
   121	    ap.add_argument("--rounds", type=int, default=30)
   122	    ap.add_argument("--sleep", type=float, default=3.0)
   123	    ap.add_argument("--dry-run", action="store_true")
   124	    args = ap.parse_args()
   125	    if not TOKEN:
   126	        print("STDB_CONTROLLER_TOKEN missing", file=sys.stderr)
   127	        return 2
   128	    swaps = load_swaps()
   129	    print(f"swap log: {len(swaps)} swaps on record")
   130	    acted = {"answered": 0, "rejected": 0, "released": 0, "rules_approved": 0, "refused": 0}
   131	    decided = set()
   132	
   133	    def act(name, *a):
   134	        if args.dry_run:
   135	            print(f"  dry-run {name} {a}")
   136	            return True, "dry"
   137	        ok, msg = call_try(name, *a)
   138	        if not ok:
   139	            acted["refused"] += 1
   140	            print(f"  refused {name} {a[0]}: {msg}")
   141	        return ok, msg
   142	
   143	    for rnd in range(1, args.rounds + 1):
   144	        holds = sql("SELECT * FROM hold")
   145	        mr = {m["txn_ref"]: m for m in sql("SELECT * FROM match_result")}
   146	        pending_tasks = [t for t in sql("SELECT * FROM agent_task") if t["status"] in ("open", "claimed")]
   147	        did = 0
   148	
   149	        for h in holds:
   150	            ref = h["txn_ref"]
   151	            if ref in decided:
   152	                continue
   153	            code, status = h["code"], h["status"]
   154	            ev = json.loads(mr[ref]["evidence_json"]) if ref in mr else {}
   155	            if status == "awaiting_controller":
   156	                if code == "location_mismatch":
   157	                    s = swap_for(swaps, int(ev.get("driverId", -1)), int(h["day"]))
   158	                    if s:
   159	                        text = (f"Yes. {s['name']} drove relief unit {s['reliefUnit']} that week while unit {s['ownUnit']} "
   160	                                f"was in the shop, per the swap log entry of {s['date']}. He kept his own fuel card.")
   161	                        ok, _ = act("try_answer_question", ref, text)
   162	                        if ok: acted["answered"] += 1; decided.add(ref); did += 1
   163	                    else:
   164	                        ok, _ = act("try_reject_payment", ref, "Card misuse: the truck was not at the station and the swap log shows no reassignment for this driver.")
   165	                        if ok: acted["rejected"] += 1; decided.add(ref); did += 1
   166	                elif code == "rate_variance":
   167	                    ok, _ = act("try_reject_payment", ref, f"Unit price above the contract rate ({ev.get('variancePct', '?')} percent); vendor to reissue at contract.")
   168	                    if ok: acted["rejected"] += 1; decided.add(ref); did += 1
   169	                elif code == "duplicate_invoice":
   170	                    ok, _ = act("try_reject_payment", ref, f"Duplicate of {ev.get('duplicateOf', 'an earlier invoice')} under another PO.")
   171	                    if ok: acted["rejected"] += 1; decided.add(ref); did += 1
   172	                elif code == "short_received":
   173	                    ok, _ = act("try_reject_payment", ref, f"Billed {ev.get('qty')} but received {ev.get('receivedQty')}; pay on credit memo for the received quantity only.")
   174	                    if ok: acted["rejected"] += 1; decided.add(ref); did += 1
   175	                elif code == "po_mismatch":
   176	                    ok, _ = act("try_reject_payment", ref, f"PO reference does not match: {ev.get('reason', '')}.")
   177	                    if ok: acted["rejected"] += 1; decided.add(ref); did += 1
   178	                elif code == "vendor_bank_change":
   179	                    ok, _ = act("try_approve_payment", ref, {"some": f"Called {ev.get('vendorName', 'the vendor')} on the number on file; new account confirmed by the AR desk."})
   180	                    if ok: acted["released"] += 1; decided.add(ref); did += 1
   181	                elif code == "capacity_exceeded":
   182	                    ok, _ = act("try_reject_payment", ref, f"{ev.get('gallons')} gal exceeds the tank limit of {ev.get('capacityLimitGal')} gal.")
   183	                    if ok: acted["rejected"] += 1; decided.add(ref); did += 1
   184	            elif status == "open" and code == "capacity_exceeded":
   185	                ok, _ = act("try_reject_payment", ref, f"{ev.get('gallons')} gal exceeds the tank limit of {ev.get('capacityLimitGal')} gal; no question to ask.")
   186	                if ok: acted["rejected"] += 1; decided.add(ref); did += 1
   187	            elif status == "open" and code == "vendor_bank_change" and not any(t["txn_ref"] == ref for t in pending_tasks):
   188	                ok, _ = act("try_approve_payment", ref, {"some": f"Called {ev.get('vendorName', 'the vendor')} on the number on file; new account confirmed by the AR desk."})
   189	                if ok: acted["released"] += 1; decided.add(ref); did += 1
   190	            elif status == "open" and code == "limit":
   191	                ok, msg = act("try_approve_payment", ref, {"none": []})
   192	                if not ok and "call-back" in msg:
   193	                    ok, _ = act("try_approve_payment", ref, {"some": "Called the vendor on the number on file; account confirmed by the AR desk."})
   194	                if ok: acted["released"] += 1; decided.add(ref); did += 1
   195	
   196	        for r in sql("SELECT * FROM rule"):
   197	            if r["status"] == "candidate":
   198	                ok, _ = act("try_approve_rule", int(r["id"]))
   199	                if ok: acted["rules_approved"] += 1; did += 1
   200	
   201	        waiting = [h for h in sql("SELECT * FROM hold") if h["status"] in ("open", "awaiting_controller", "answered") and h["txn_ref"] not in decided]
   202	        pending_tasks = [t for t in sql("SELECT * FROM agent_task") if t["status"] in ("open", "claimed")]
   203	        print(f"round {rnd}: acted {did}, holds still pending {len(waiting)}, tasks in flight {len(pending_tasks)}")
   204	        if did == 0 and not pending_tasks and not [h for h in waiting if h["status"] in ("awaiting_controller",)]:
   205	            break
   206	        if args.dry_run:
   207	            break
   208	        time.sleep(args.sleep)
   209	
   210	    print(json.dumps(acted))
   211	    left = [h for h in sql("SELECT * FROM hold") if h["status"] in ("open", "awaiting_controller", "answered")]
   212	    if left:
   213	        print(f"{len(left)} holds left pending:")
   214	        for h in left[:20]:
   215	            print(f"  {h['txn_ref']:10} {h['code']:20} {h['status']:20} {dollars(h['cents'])}")
   216	    return 0
   217	
   218	
   219	if __name__ == "__main__":
   220	    sys.exit(main())

 succeeded in 0ms:
     1	#!/usr/bin/env bash
     2	# One command from fresh fixtures to a facts table:
     3	#   republish with empty data, mint identities, load fixtures, start the worker in replay mode,
     4	#   advance all 92 days, run the scripted controller pass, recompute docs/FACTS.json.
     5	# Usage: scripts/full_run.sh [--keep-worker]
     6	set -euo pipefail
     7	ROOT="$(cd "$(dirname "$0")/.." && pwd)"
     8	cd "$ROOT"
     9	export PATH="$HOME/.local/bin:$PATH"
    10	export FACTORY_API_KEY= ANTHROPIC_API_KEY= ELASTIC_API_KEY= ASI_ONE_API_KEY=
    11	export WORKER_MODE=replay
    12	mkdir -p logs
    13	T0=$(date +%s)
    14	step() { printf '\n==> %s (%ss)\n' "$*" "$(( $(date +%s) - T0 ))"; }
    15	
    16	curl -sf http://127.0.0.1:3100/v1/ping >/dev/null || { echo "local SpacetimeDB is not running on 3100; run scripts/demo_up.sh first"; exit 1; }
    17	
    18	step "publish with empty data"
    19	( cd spacetimedb && spacetime publish dispatch-ledger --module-path . --server local3100 --delete-data=always --yes 2>&1 | tail -1 )
    20	step "identities"
    21	python3 scripts/mint_identities.py | tail -1
    22	step "fixtures"
    23	( cd scripts && npx tsx load_fixtures.ts | tail -3 )
    24	
    25	step "worker (replay)"
    26	if [ "${1:-}" != "--keep-worker" ]; then
    27	  pkill -f "worker/src/index.ts" 2>/dev/null || true
    28	  pkill -f "tsx src/index.ts" 2>/dev/null || true
    29	  sleep 1
    30	fi
    31	( cd worker && EVIDENCE_DIR="$ROOT/seed/fixtures/evidence" nohup npm start > ../logs/worker.log 2>&1 & )
    32	for i in $(seq 1 30); do grep -q "loop started" logs/worker.log 2>/dev/null && break; sleep 0.5; done
    33	grep -q "loop started" logs/worker.log || { echo "worker did not start; see logs/worker.log"; exit 1; }
    34	
    35	step "92 days"
    36	( cd scripts && npx tsx run_days.ts --until 92 | tail -2 )
    37	
    38	step "waiting for investigations"
    39	left=1
    40	for i in $(seq 1 180); do
    41	  left=$(curl -s -X POST http://127.0.0.1:3100/v1/database/dispatch-ledger/sql -d "SELECT status FROM agent_task WHERE status = 'open'" | python3 -c 'import sys,json; print(len(json.load(sys.stdin)[0]["rows"]))' || echo 1)
    42	  if [ "$left" = "0" ]; then break; fi
    43	  sleep 1
    44	done
    45	echo "open tasks after wait: $left"
    46	
    47	step "controller pass"
    48	python3 scripts/controller_sim.py --rounds 30 --sleep 2 | tail -4
    49	
    50	step "facts"
    51	python3 scripts/facts.py | sed -n '5,40p'
    52	printf '\ntotal %ss\n' "$(( $(date +%s) - T0 ))"

 succeeded in 0ms:
     1	# Claims audit
     2	
     3	Every claim in the README, the Devpost text and the video, with where it is made, what backs it, and a verdict: backed, softened, removed, or not verifiable. Run Sunday after the offline run. Backing must be a named test, a dated status entry, or a command run for the audit.
     4	
     5	| # | Claim | Where | Backing | Verdict |
     6	| --- | --- | --- | --- | --- |
     7	| 1 | The kernel never calls a model | README Principles | `spacetimedb/src/kernel.ts` imports only `./thresholds`; grep for `fetch`, `http`, `anthropic` returns nothing | backed |
     8	| 2 | Money is integer cents everywhere | README Principles | `t.i64()` on every cents column in `schema.ts`; kernel tests use bigint | backed |
     9	| 3 | The agent identity cannot approve a payment | README Principles, video | `module.test.ts` roles scenario; live `try_approve_payment` with the agent token returns `[false, "agent may not do this"]` and writes an audit row | backed |
    10	| 4 | The requester of a release cannot approve it | README Principles | `checkApprovePayment` in `index.ts`; module test SoD scenario | backed |
    11	| 5 | Rules are backtested by the database before they are stored | README Principles | `backtest()` in `index.ts`, called inside `create_rule`; module test rules scenario | backed |
    12	| 6 | A rule that would clear a confirmed exception is refused | README Principles | `create_rule` refusal `would clear`; module test | backed |
    13	| 7 | Every refusal is in the audit trail with the caller's role | README Principles | `try_*` procedures; live audit rows dated 2026-10-24 | backed |
    14	| 8 | Recall 1.0 on 52 planted exceptions | README What is measured | `docs/FACTS.json` `overall.recall` from the final run | backed (1.0) |
    15	| 9 | Precision at or above 0.95 | README What is measured | `docs/FACTS.json` `overall.precision` | backed (1.0) |
    16	| 10 | 6 decoys cleared with exactly one controller answer each | README What is measured | `docs/FACTS.json` `decoysClearedWithOneAnswer` | backed (6 of 6) |
    17	| 11 | Zero planted exceptions cleared by a rule | README What is measured | `docs/FACTS.json` `plantedClearedByRule` is empty | backed (0) |
    18	| 12 | 92 days replay in under 4 minutes | Tasks target | `scripts/run_days.ts` timing line from the final run | backed (under 1 s of module time; 10 s cycle) |
    19	| 13 | The dashboard updates without refresh on a second laptop | Tasks target | observed at the table | softened: dashboard and database listen on 127.0.0.1, so the second laptop runs ASI:One, not the dashboard |
    20	| 14 | Droid runs with autonomy Off and only MCP tool calls allowed | README Where Droid runs | `worker/src/droid.ts` options block; SDK type names confirmed in `worker/README.md` | backed by types; live run not performed |
    21	| 15 | Live Droid investigated hold 2231 and named truck 22 | video (only if live keys were used) | `seed/fixtures/investigations/2231.json` is hand-written unless `WORKER_MODE=record` ran; say "recorded" or "scripted" accordingly | removed from the video: the recordings are hand-written, labelled as such |
    22	| 16 | The Elastic tools work through the MCP endpoint | README Elastic | `elastic/smoke.py` output, only with a real project | not verifiable without a Serverless project |
    23	| 17 | The agent is discoverable on ASI:One | README Agent addresses | Agentverse profile URL and address after registration | pending registration |
    24	| 18 | The company is simulated and the key is published | README disclaimer | `seed/fixtures/answer_key.json` in the repo | backed |

 succeeded in 0ms:
     1	# Judging-table runbook
     2	
     3	Written 2026-10-24 from the scripts on disk. Nothing below was run for this document, because other processes were using the database. Every expected line is read from the code that prints it. Fill in the measured times the night before.
     4	
     5	Say it in the first ten seconds: simulated carrier, sandbox money, a published answer key.
     6	
     7	**The one rule: if a live step hangs for five seconds, move to Terminal B and keep talking. Never debug live.**
     8	
     9	## 1. Night before
    10	
    11	- [ ] Both laptops charged, both chargers in the bag, a phone hotspot tested with the demo laptop. Only ASI:One needs the internet; the database, worker, dashboard and CLI all run on 127.0.0.1.
    12	- [ ] WiFi off test on the demo laptop: boot, both moments, the refusal and one inject, all from Terminal B. Everything except ASI:One must work.
    13	- [ ] `.env` exists on the demo laptop only. The second laptop holds no clone with a `.env`. Check the keys without printing them; expect `4`:
    14	
    15	```
    16	grep -c -E '^(STDB_SEED_TOKEN|STDB_AGENT_TOKEN|STDB_CONTROLLER_TOKEN|AGENT_SEED)=.+' .env
    17	```
    18	
    19	- [ ] `AGENT_SEED` was missing from `.env` on 2026-10-24. Add it once (`openssl rand -hex 32`) and never change it: it fixes the agent's address.
    20	- [ ] Agentverse mailbox connected: start the uAgent (section 2), open the Inspector link it logs, Connect, Mailbox, Finish. Agentverse shows the mailbox as connected. Paste `agent/README.md` into the profile and put the real address in the README table.
    21	- [ ] Second laptop logged into ASI:One with a chat to `@dispatch-ledger-controller` open. Send `status` and get a reply.
    22	- [ ] Notability: dated page screenshots in `docs/notability/` with `captions.md`; the same images and captions in the Devpost gallery.
    23	- [ ] One full 92-day run, then `python3 scripts/facts.py` once, then open `docs/FACTS.md`. Those are the only numbers you may say. Never run `facts.py` at the table: it overwrites `docs/FACTS.json` and `web/public/FACTS.json` with whatever day the clock is on.
    24	- [ ] Screen recordings of moment one and moment two on the desktop, played once with sound off. Last fallback.
    25	- [ ] Measured times: `demo_up.sh` ____ s, `run_days.ts --until 40` ____ s, uAgent mailbox ready ____ s.
    26	
    27	## 2. Boot at the table
    28	
    29	Run from the repo root on the demo laptop, in this order.
    30	
    31	```
    32	scripts/demo_up.sh
    33	```
    34	
    35	Expected lines, in order: `==> 1/7 local SpacetimeDB on 127.0.0.1:3100`, `==> 2/7 seed identity`, `==> 3/7 publish the module (fresh data)`, `==> 4/7 agent and controller identities` then `agent: <hex>`, `controller: <hex>`, `wrote .../.env`, `==> 5/7 fixtures` then `connected to http://127.0.0.1:3100 dispatch-ledger`, one `<table>: N rows` line per table and `done in N s`, `==> 6/7 worker in replay mode (logs/worker.log)`, `==> 7/7 web dashboard (logs/web.log)`, `dashboard: http://127.0.0.1:5173`, `Ready. The clock is paused on day 0.` Budget two to three minutes; the fixture load is the long step. It wipes the data and writes new agent and controller tokens into `.env`, so anything started before it must be restarted after it.
    36	
    37	```
    38	scripts/clock.sh status
    39	```
    40	
    41	Expect `{'id': 1, 'day': 0, 'date': '2026-07-01', 'paused': True, 'tick_micros': 2000000}`. Under a second.
    42	
    43	```
    44	agent/.venv/bin/python agent/agent.py
    45	```
    46	
    47	Start it after `demo_up.sh`, never before. Expect `dispatch-ledger-controller address agent1q...`, `Agent Inspector: ...` and `ledger http://127.0.0.1:3100 db dispatch-ledger model on` (or `model off (regex + last-hold fallback)` without `ASI_ONE_API_KEY`). Give the mailbox fifteen seconds, then send `status` from the second laptop.
    48	
    49	Open http://127.0.0.1:5173. The top bar pill reads `connected` and eight hex characters. Then stage the clock one day before the moment:
    50	
    51	```
    52	(cd scripts && npx tsx run_days.ts --until 40)
    53	scripts/clock.sh status
    54	```
    55	
    56	Expect `day 0 -> 40`, a line every tenth day, `done: 40 days in N s`, then status shows day 40 and `'paused': True`.
    57	
    58	## 3. Two terminals
    59	
    60	Terminal A is live. Terminal B is code and fallback. Both sit in the repo root.
    61	
    62	| Window | What runs | Pre-typed |
    63	| --- | --- | --- |
    64	| A1 | `agent/.venv/bin/python agent/agent.py` (do not type here) | nothing |
    65	| A2 | `tail -f logs/worker.log` | nothing |
    66	| A3 | commands | `scripts/clock.sh step`, `scripts/as_agent.sh approve INV-1077`, the three inject lines from section 6 |
    67	| B1 | the CLI twin, keys blanked first: `export ASI_ONE_API_KEY= FACTORY_API_KEY= ANTHROPIC_API_KEY= ELASTIC_API_KEY=` | the `python3 -m agent.cli` lines from section 4, in order |
    68	| B2 | editor | `spacetimedb/src/index.ts` at `checkApprovePayment`, `spacetimedb/src/kernel.ts` at `evaluateCardTxn`, `worker/src/droid.ts` at the options block, `agent/handlers.py`, `spacetimedb/src/thresholds.ts` |
    69	
    70	The dashboard is full screen on the demo laptop. The second laptop shows ASI:One only: the dashboard and the database listen on 127.0.0.1 and cannot be reached from it.
    71	
    72	Each one-shot `python3 -m agent.cli "..."` is a new process and forgets the last hold discussed, so the fallback always names the hold (`answer 2231 ...`). Interactive `python3 -m agent.cli` remembers it.
    73	
    74	If a live step hangs for five seconds, move to Terminal B and keep talking. Say "same handler, other front door" and run the B1 line.
    75	
   185	scripts/clock.sh tick 2000000   # back to normal
   186	scripts/clock.sh status
   187	```
   188	
   189	Between judges, without republishing:
   190	
   191	```
   192	scripts/clock.sh reset
   193	scripts/clock.sh tick 2000000
   194	(cd scripts && npx tsx run_days.ts --until 40)
   195	```
   196	
   197	For the month from zero, use `scripts/clock.sh run` after the reset instead and pause a few days before 41, then step. `reset` clears holds, matches, payments, day totals, tasks and rules and leaves day 0 paused. It keeps the audit trail (refusals pile up across judges), the tick setting, the rule id counter, injected rows and all company data. The worker, the uAgent and the dashboard need no restart; tokens do not change.
   198	
   199	## 8. Failure modes
   200	
   201	| What you see | Do | Say |
   202	| --- | --- | --- |
   203	| ASI:One slow or down | After five seconds, run the same line in B1 with `python3 -m agent.cli`. Try the hotspot later. | "Same handler, other front door. The database does not care which." |
   204	| ASI:One replies `Ledger error` or a role refusal it should not | `demo_up.sh` ran after the uAgent started; it holds an old token. Restart A1. Use B1 meanwhile. | "Restarting the chat seat; the ledger is fine." |
   205	| A2 stops moving; cards read `Task is open. Waiting for the worker to claim it.` | Check `ls worker/PAUSE` and remove it if present. Otherwise restart the worker (below). It claims the open tasks. | "Holds are raised by the kernel inside the database, so nothing slipped through. The investigator is catching up." |
   206	| Pill reads `reconnecting` or `database unreachable` | Reload the page; the anonymous token is cached in the browser. | "The page is a read-only subscriber." |
   207	| `clock.sh status` fails, CLI says `ledger unreachable` | Server died. Stop the old worker and web, run `scripts/demo_up.sh` (two minutes), restart A1, re-stage to day 40. Play the recording meanwhile. | "Fresh publish; every number on screen will come back from the ledger." |
   208	
   209	```
   210	(cd worker && WORKER_MODE=replay FACTORY_API_KEY= ANTHROPIC_API_KEY= nohup npm start > ../logs/worker.log 2>&1 &)
   211	pkill -f 'tsx src/index.ts'; lsof -ti :5173 | xargs kill     # before re-running demo_up.sh
   212	```
   213	
   214	## 9. Honest answers by table
   215	

exec
/bin/zsh -lc "nl -ba scripts/facts.py | sed -n '1,235p'" in /Users/anudeepbonagiri/dev/hackathons/dispatch-ledger
 succeeded in 0ms:
     1	#!/usr/bin/env python3
     2	"""Recompute every published number from the ledger and the answer key.
     3	
     4	Nothing in the README, the Devpost text or the video is typed by hand: it is read from docs/FACTS.json,
     5	which this script writes. It is the only program in the repository that reads seed/fixtures/answer_key.json.
     6	
     7	Usage: python scripts/facts.py [--uri http://127.0.0.1:3100] [--db dispatch-ledger] [--key seed/fixtures/answer_key.json]
     8	Reads public tables anonymously over the SQL endpoint.
     9	"""
    10	import argparse
    11	import json
    12	import os
    13	import sys
    14	import urllib.request
    15	from collections import Counter, defaultdict
    16	from datetime import datetime, timezone
    17	from pathlib import Path
    18	
    19	ROOT = Path(__file__).resolve().parent.parent
    20	OPTION_COLS = {"rule_id", "question", "answer", "callback_note", "approved_by", "claimed_by", "claimed_at", "po_id"}
    21	EXCEPTION_CODES = ["location_mismatch", "capacity_exceeded", "rate_variance", "duplicate_toll",
    22	                   "duplicate_invoice", "vendor_bank_change", "short_received"]
    23	
    24	
    25	def sql(uri: str, db: str, query: str) -> list[dict]:
    26	    req = urllib.request.Request(f"{uri}/v1/database/{db}/sql", data=query.encode(), method="POST")
    27	    with urllib.request.urlopen(req, timeout=60) as r:
    28	        res = json.loads(r.read().decode())[0]
    29	    names = [e["name"]["some"] for e in res["schema"]["elements"]]
    30	    rows = []
    31	    for raw in res["rows"]:
    32	        row = {}
    33	        for k, v in zip(names, raw):
    34	            if isinstance(v, dict) and "some" in v:
    35	                v = v["some"]
    36	            elif isinstance(v, dict) and "none" in v:
    37	                v = None
    38	            elif isinstance(v, list) and len(v) == 2 and v[0] == 1 and v[1] == [] and k in OPTION_COLS:
    39	                v = None
    40	            elif isinstance(v, list) and len(v) == 2 and v[0] == 0 and k in OPTION_COLS:
    41	                v = v[1]
    42	            elif isinstance(v, list) and len(v) == 1 and k in ("at", "decided_at", "updated_at", "created_at", "claimed_at", "actor", "requested_by", "released_by", "created_by", "approved_by", "claimed_by"):
    43	                v = v[0]
    44	            row[k] = v
    45	        rows.append(row)
    46	    return rows
    47	
    48	
    49	def main() -> int:
    50	    ap = argparse.ArgumentParser()
    51	    ap.add_argument("--uri", default=os.environ.get("STDB_URI", "http://127.0.0.1:3100"))
    52	    ap.add_argument("--db", default=os.environ.get("STDB_DB", "dispatch-ledger"))
    53	    ap.add_argument("--key", default=str(ROOT / "seed/fixtures/answer_key.json"))
    54	    ap.add_argument("--out", default=str(ROOT / "docs"))
    55	    args = ap.parse_args()
    56	
    57	    key = json.loads(Path(args.key).read_text())
    58	    key_by_ref = {k["txnRef"]: k for k in key}
    59	    planted = [k for k in key if k["expected"] in ("hold", "auto_reject")]
    60	    decoys = [k for k in key if k["expected"] == "clear_after_question"]
    61	
    62	    mr = sql(args.uri, args.db, "SELECT * FROM match_result")
    63	    holds = sql(args.uri, args.db, "SELECT * FROM hold")
    64	    payments = sql(args.uri, args.db, "SELECT * FROM payment")
    65	    rules = sql(args.uri, args.db, "SELECT * FROM rule")
    66	    tasks = sql(args.uri, args.db, "SELECT * FROM agent_task")
    67	    totals = sql(args.uri, args.db, "SELECT * FROM day_total")
    68	    clock = sql(args.uri, args.db, "SELECT * FROM business_day")
    69	    audit = sql(args.uri, args.db, "SELECT action, actor_role, ref FROM audit_event")
    70	
    71	    hold_by_ref = {h["txn_ref"]: h for h in holds}
    72	    mr_by_ref = {m["txn_ref"]: m for m in mr}
    73	
    74	    # Raised exceptions: every hold with an exception code (a hold row survives release or clearing),
    75	    # plus duplicate tolls, which are auto-rejected without a hold.
    76	    raised: dict[str, str] = {}
    77	    for h in holds:
    78	        if h["code"] in EXCEPTION_CODES:
    79	            raised[h["txn_ref"]] = h["code"]
    80	    for m in mr:
    81	        if m["code"] == "duplicate_toll":
    82	            raised[m["txn_ref"]] = "duplicate_toll"
    83	
    84	    by_code = []
    85	    tp_total = fp_total = planted_total = 0
    86	    for code in EXCEPTION_CODES:
    87	        planted_refs = {k["txnRef"] for k in key if k["code"] == code}
    88	        raised_refs = {r for r, c in raised.items() if c == code}
    89	        tp = len(planted_refs & raised_refs)
    90	        fp = len(raised_refs - planted_refs)
    91	        fn = len(planted_refs - raised_refs)
    92	        by_code.append({
    93	            "code": code, "planted": len(planted_refs), "raised": len(raised_refs), "truePositives": tp,
    94	            "falsePositives": fp, "missed": sorted(planted_refs - raised_refs),
    95	            "precision": round(tp / len(raised_refs), 4) if raised_refs else None,
    96	            "recall": round(tp / len(planted_refs), 4) if planted_refs else None,
    97	        })
    98	        tp_total += tp; fp_total += fp; planted_total += len(planted_refs)
    99	    overall_precision = round(tp_total / (tp_total + fp_total), 4) if tp_total + fp_total else None
   100	    overall_recall = round(tp_total / planted_total, 4) if planted_total else None
   101	
   102	    # Decoys: cleared through an approved rule after exactly one controller answer.
   103	    decoy_rows = []
   104	    for d in decoys:
   105	        h = hold_by_ref.get(d["txnRef"])
   106	        drafts = [t for t in tasks if t["txn_ref"] == d["txnRef"] and t["kind"] == "draft_rule"]
   107	        rule = next((r for r in rules if r["source_txn_ref"] == d["txnRef"] and r["status"] in ("approved", "expired")), None)
   108	        decoy_rows.append({
   109	            "txnRef": d["txnRef"], "raised": h is not None, "status": h["status"] if h else None,
   110	            "questions": 1 if (h and h.get("question")) else 0, "answers": 1 if (h and h.get("answer")) else 0,
   111	            "draftTasks": len(drafts), "clearedByRule": bool(h and h["status"] == "cleared_by_rule"),
   112	            "ruleId": rule["id"] if rule else None,
   113	            "backtest": json.loads(rule["backtest_json"]) if rule else None,
   114	        })
   115	    decoys_cleared = sum(1 for r in decoy_rows if r["clearedByRule"])
   116	    decoys_one_answer = sum(1 for r in decoy_rows if r["clearedByRule"] and r["answers"] == 1 and r["draftTasks"] == 1)
   117	
   118	    # The claim that matters: no planted exception was ever cleared by a rule.
   119	    planted_cleared_by_rule = [k["txnRef"] for k in planted
   120	                               if (hold_by_ref.get(k["txnRef"], {}).get("status") == "cleared_by_rule")
   121	                               or (mr_by_ref.get(k["txnRef"], {}).get("rule_id") not in (None, 0))]
   122	
   123	    limit_holds = [h for h in holds if h["code"] == "limit"]
   124	    auto_paid = [p for p in payments if p["released_role"] in ("kernel", "rule")]
   125	    controller_paid = [p for p in payments if p["released_role"] == "controller"]
   126	    refused = [a for a in audit if a["action"] == "refused"]
   127	    refused_by_role = dict(Counter(a["actor_role"] for a in refused))
   128	    task_sources = dict(Counter(t["source"] for t in tasks if t["kind"] == "investigate"))
   129	    task_status = dict(Counter(t["status"] for t in tasks if t["kind"] == "investigate"))
   130	
   131	    by_day = []
   132	    holds_per_day = Counter(h["day"] for h in holds if h["code"] in EXCEPTION_CODES)
   133	    dups_per_day = Counter(m["day"] for m in mr if m["code"] == "duplicate_toll")
   134	    for t in sorted(totals, key=lambda x: x["day"]):
   135	        by_day.append({"day": t["day"], "exceptions": holds_per_day.get(t["day"], 0) + dups_per_day.get(t["day"], 0),
   136	                       "autoPaid": t["auto_paid_count"], "autoPaidCents": int(t["auto_paid_cents"]),
   137	                       "holds": t["hold_count"], "autoRejected": t["rejected_count"], "txns": t["txn_count"]})
   138	
   139	    unreviewed = [k["txnRef"] for k in planted if k["txnRef"] not in raised]
   140	    cost = {"tasks": 0, "inputTokens": 0, "outputTokens": 0, "durationMs": 0}
   141	    cost_log = ROOT / "worker/cost_log.jsonl"
   142	    if cost_log.exists():
   143	        for line in cost_log.read_text().splitlines():
   144	            try:
   145	                e = json.loads(line)
   146	            except json.JSONDecodeError:
   147	                continue
   148	            cost["tasks"] += 1
   149	            cost["inputTokens"] += int(e.get("inputTokens", 0))
   150	            cost["outputTokens"] += int(e.get("outputTokens", 0))
   151	            cost["durationMs"] += int(e.get("durationMs", 0))
   152	
   153	    facts = {
   154	        "asOf": datetime.now(timezone.utc).isoformat(timespec="seconds"),
   155	        "dayReached": clock[0]["day"] if clock else 0,
   156	        "transactionsMatched": len(mr),
   157	        "plantedExceptions": planted_total,
   158	        "decoys": len(decoys),
   159	        "overall": {"precision": overall_precision, "recall": overall_recall, "truePositives": tp_total, "falsePositives": fp_total},
   160	        "byCode": by_code,
   161	        "decoyRows": decoy_rows,
   162	        "decoysCleared": decoys_cleared,
   163	        "decoysClearedWithOneAnswer": decoys_one_answer,
   164	        "plantedClearedByRule": planted_cleared_by_rule,
   165	        "limitHolds": {"count": len(limit_holds), "cents": sum(int(h["cents"]) for h in limit_holds)},
   166	        "autoPaid": {"count": len(auto_paid), "cents": sum(int(p["cents"]) for p in auto_paid)},
   167	        "controllerReleased": {"count": len(controller_paid), "cents": sum(int(p["cents"]) for p in controller_paid)},
   168	        "refusals": {"count": len(refused), "byRole": refused_by_role},
   169	        "investigations": {"bySource": task_sources, "byStatus": task_status},
   170	        "rules": dict(Counter(r["status"] for r in rules)),
   171	        "byDay": by_day,
   172	        "worker_cost": cost,
   173	        "unreviewedPlanted": unreviewed,
   174	        "complete": not unreviewed and clock and clock[0]["day"] >= 92,
   175	    }
   176	    out = Path(args.out)
   177	    out.mkdir(parents=True, exist_ok=True)
   178	    (out / "FACTS.json").write_text(json.dumps(facts, indent=2, sort_keys=True) + "\n")
   179	    web_public = ROOT / "web/public"
   180	    if web_public.exists():
   181	        (web_public / "FACTS.json").write_text(json.dumps(facts, indent=2, sort_keys=True) + "\n")
   182	
   183	    md = ["# Facts", "", f"Written by scripts/facts.py at {facts['asOf']}. Nothing in it is typed by hand.", "",
   184	          f"Day reached: {facts['dayReached']} of 92. Transactions matched: {len(mr)}.", "",
   185	          "| Code | Planted | Raised | True positives | False positives | Precision | Recall |", "| --- | --- | --- | --- | --- | --- | --- |"]
   186	    for b in by_code:
   187	        md.append(f"| {b['code']} | {b['planted']} | {b['raised']} | {b['truePositives']} | {b['falsePositives']} | {b['precision']} | {b['recall']} |")
   188	    md += ["", f"Overall precision {overall_precision}, recall {overall_recall}.",
   189	           f"Decoys cleared through an approved rule: {decoys_cleared} of {len(decoys)} ({decoys_one_answer} with exactly one controller answer).",
   190	           f"Planted exceptions cleared by a rule: {len(planted_cleared_by_rule)} (must be 0).",
   191	           f"Policy holds (auto-pay limit, not exceptions): {len(limit_holds)}.",
   192	           f"Auto-paid by the kernel or a rule: {facts['autoPaid']['count']} payments, ${facts['autoPaid']['cents']/100:,.2f}.",
   193	           f"Released by the controller: {facts['controllerReleased']['count']} payments, ${facts['controllerReleased']['cents']/100:,.2f}.",
   194	           f"Refusals recorded in the audit trail: {len(refused)} ({refused_by_role}).",
   195	           f"Investigations by source: {task_sources}; by status: {task_status}.", ""]
   196	    if unreviewed:
   197	        md.append(f"Unreviewed planted rows (the run is not complete): {unreviewed}")
   198	    (out / "FACTS.md").write_text("\n".join(md) + "\n")
   199	
   200	    # Evals in the winners' format: run date, rerun command, metric/result/target, hard negatives, history, caveat.
   201	    results = [
   202	        "# Results", "",
   203	        f"Run date: {facts['asOf']}. Rerun: `scripts/full_run.sh` (fresh publish, fixtures, worker in replay, 92 days, scripted controller pass, then this file).",
   204	        "", "| Metric | Result | Target |", "| --- | --- | --- |",
   205	        f"| Recall on planted exceptions ({planted_total}) | {overall_recall} | 1.0 |",
   206	        f"| Precision on raised exceptions | {overall_precision} | at or above 0.95 |",
   207	        f"| Decoys cleared through an approved rule | {decoys_cleared} of {len(decoys)} | 6 of 6 |",
   208	        f"| Decoys cleared with exactly one controller answer | {decoys_one_answer} of {len(decoys)} | 6 of 6 |",
   209	        f"| Planted exceptions cleared by a rule | {len(planted_cleared_by_rule)} | 0 |",
   210	        f"| Duplicate tolls auto-rejected without a task | {sum(1 for m in mr if m['code'] == 'duplicate_toll')} | 11 |",
   211	        f"| Days replayed | {facts['dayReached']} | 92 |",
   212	        f"| Policy holds (auto-pay limit) | {len(limit_holds)} | reported, not scored |",
   213	        "", "## Hard negatives", "",
   214	        "The six decoys are legitimate unit swaps recorded in the dispatcher's swap log. Under the kernel they are indistinguishable from card misuse until the controller answers.", "",
   215	        "| Decoy | Raised | Question asked | Answers | Rule | Backtest n | Confirmed exceptions covered | Cleared |", "| --- | --- | --- | --- | --- | --- | --- | --- |",
   216	    ]
   217	    for r in decoy_rows:
   218	        bt = r["backtest"] or {}
   219	        results.append(f"| {r['txnRef']} | {r['raised']} | {bool(r['questions'])} | {r['answers']} | {r['ruleId']} | {bt.get('n')} | {bt.get('confirmedExceptionsCovered')} | {r['clearedByRule']} |")
   220	    results += ["", "## History", "",
   221	        "- First full run (fixtures from 11:18): duplicate_invoice precision 0.5 because recurring same-amount invoices under alternating POs collided with the planted duplicates. Fixed in the generator, not the kernel.",
   222	        "- A facts bug counted every option-typed `rule_id` as set (SQL encodes none as `[1, []]`); fixed before the second run.",
   223	        "- Second run on the final fixtures: every target met.",
   224	        "", "## Caveat", "",
   225	        "The company, the money and the vendors are synthetic, generated by seed/generate.py with seed 42, and the planted errors come from the same generator that made the clean rows. "
   226	        "Recall and precision therefore measure whether the kernel finds what we planted, not how it would behave on a real carrier's statements. "
   227	        "Investigations in this run are scripted stand-ins or hand-written recordings, labelled as such; no live model produced a finding.", ""]
   228	    (out / "RESULTS.md").write_text("\n".join(results) + "\n")
   229	    print("\n".join(md))
   230	    return 0 if not planted_cleared_by_rule else 1
   231	
   232	
   233	if __name__ == "__main__":
   234	    sys.exit(main())

exec
/bin/zsh -lc "nl -ba agent/agent.py | sed -n '1,180p'" in /Users/anudeepbonagiri/dev/hackathons/dispatch-ledger
exec
/bin/zsh -lc "nl -ba seed/mirror.py | sed -n '1,230p'" in /Users/anudeepbonagiri/dev/hackathons/dispatch-ledger
 succeeded in 0ms:
     1	"""The controller seat on ASI:One: a Fetch.ai uAgent (mailbox) that runs the shared handler.
     2	
     3	Run from the repo root or this folder:  python agent/agent.py
     4	Open the Agent Inspector link it prints, Connect, Mailbox, Finish. Then paste agent/README.md
     5	into the Agentverse profile. AGENT_SEED fixes the address; never change it after registering.
     6	"""
     7	
     8	from __future__ import annotations
     9	
    10	import asyncio
    11	import inspect
    12	import os
    13	import sys
    14	from datetime import datetime, timezone
    15	from pathlib import Path
    16	from urllib.parse import quote
    17	from uuid import uuid4
    18	
    19	ROOT = Path(__file__).resolve().parent.parent
    20	if str(ROOT) not in sys.path:
    21	    sys.path.insert(0, str(ROOT))
    22	
    23	from dotenv import load_dotenv  # noqa: E402
    24	from uagents import Agent, Context, Protocol  # noqa: E402
    25	from uagents_core.contrib.protocols.chat import (  # noqa: E402
    26	    ChatAcknowledgement,
    27	    ChatMessage,
    28	    EndSessionContent,
    29	    TextContent,
    30	    chat_protocol_spec,
    31	)
    32	
    33	from agent.handlers import handle  # noqa: E402
    34	
    35	load_dotenv(ROOT / ".env")
    36	
    37	AGENT_NAME = "dispatch-ledger-controller"
    38	README = str(Path(__file__).resolve().parent / "README.md")
    39	TAGS = ["innovationlab", "hackathon"]
    40	
    41	
    42	def build_agent() -> Agent:
    43	    seed = os.getenv("AGENT_SEED")
    44	    if not seed:
    45	        sys.exit("AGENT_SEED is not set. Run `openssl rand -hex 32` once, put it in .env, and never change it.")
    46	    kwargs = dict(
    47	        name=AGENT_NAME,
    48	        seed=seed,
    49	        port=int(os.getenv("AGENT_PORT", "8000")),
    50	        mailbox=True,
    51	        publish_agent_details=True,
    52	        readme_path=README,
    53	    )
    54	    params = inspect.signature(Agent.__init__).parameters
    55	    if "metadata" in params:
    56	        kwargs["metadata"] = {"is_public": "True", "tags": TAGS}
    57	    if "description" in params:
    58	        kwargs["description"] = (
    59	            "The fleet controller's seat for Dispatch Ledger, an autonomous accounts-payable clerk for a "
    60	            "simulated trucking carrier. Lists holds, explains findings, takes answers and approvals."
    61	        )
    62	    return Agent(**kwargs)
    63	
    64	
    65	agent = build_agent()
    66	chat = Protocol(spec=chat_protocol_spec)
    67	
    68	
    69	def reply(text: str) -> ChatMessage:
    70	    # Text-only replies must end the session or ASI:One does not display them.
    71	    return ChatMessage(
    72	        timestamp=datetime.now(timezone.utc),
    73	        msg_id=uuid4(),
    74	        content=[TextContent(type="text", text=text), EndSessionContent(type="end-session")],
    75	    )
    76	
    77	
    78	@agent.on_event("startup")
    79	async def on_start(ctx: Context):
    80	    port = os.getenv("AGENT_PORT", "8000")
    81	    inspector = f"https://agentverse.ai/inspect/?uri={quote(f'http://127.0.0.1:{port}', safe='')}&address={agent.address}"
    82	    ctx.logger.info(f"{AGENT_NAME} address {agent.address}")
    83	    ctx.logger.info(f"Agent Inspector: {inspector}")
    84	    ctx.logger.info(f"ledger {os.getenv('STDB_URI')} db {os.getenv('STDB_DB')} model {'on' if os.getenv('ASI_ONE_API_KEY') else 'off (regex + last-hold fallback)'}")
    85	
    86	
    87	@chat.on_message(ChatMessage)
    88	async def on_chat(ctx: Context, sender: str, msg: ChatMessage):
    89	    await ctx.send(sender, ChatAcknowledgement(timestamp=datetime.now(timezone.utc), acknowledged_msg_id=msg.msg_id))
    90	    text = " ".join(c.text for c in msg.content if isinstance(c, TextContent)).strip()
    91	    if not text:
    92	        return  # bare start-session or end-session marker
    93	    ctx.logger.info(f"{sender[:16]}: {text[:120]}")
    94	    try:
    95	        answer = await asyncio.to_thread(handle, sender, text)
    96	    except Exception as e:  # the handler already maps ledger errors; this is a last net
    97	        ctx.logger.error(f"handler failed: {e}")
    98	        answer = f"Refused: {str(e)[:200]}"
    99	    await ctx.send(sender, reply(answer))
   100	
   101	
   102	@chat.on_message(ChatAcknowledgement)
   103	async def on_ack(ctx: Context, sender: str, msg: ChatAcknowledgement):
   104	    pass
   105	
   106	
   107	agent.include(chat, publish_manifest=True)
   108	
   109	if __name__ == "__main__":
   110	    agent.run()

 succeeded in 0ms:
     1	"""Python mirror of spacetimedb/src/kernel.ts. Reads the fixture directory and re-derives every verdict.
     2	
     3	Used by generate.py to prove the planted set is exactly what the kernel flags, and by the tests.
     4	Rules are copied, not simplified: thresholds, integer arithmetic and tie-breaks match the TypeScript.
     5	"""
     6	from __future__ import annotations
     7	
     8	import json
     9	import sys
    10	from pathlib import Path
    11	
    12	import simcal as cal
    13	from geo import haversine
    14	
    15	T = {"LOCATION_MILES": 25, "PING_WINDOW_MIN": 30, "TANK_FACTOR": 1.1, "TOLL_DUP_MIN": 10, "RATE_VARIANCE": 0.05,
    16	     "INVOICE_DUP_DAYS": 30, "BANK_CHANGE_DAYS": 7, "BANK_CHANGE_MIN_CENTS": 500_000,
    17	     "AUTO_PAY_MAX_CENTS": 250_000, "AUTO_PAY_DAY_MAX_CENTS": 4_000_000}
    18	
    19	
    20	def load_rows(path: Path) -> list[dict]:
    21	    if path.suffix == ".jsonl":
    22	        with path.open() as f:
    23	            return [json.loads(line) for line in f if line.strip()]
    24	    return json.loads(path.read_text())
    25	
    26	
    27	def load_table(fixtures: Path, name: str) -> list[dict]:
    28	    for ext in (".json", ".jsonl"):
    29	        p = fixtures / f"{name}{ext}"
    30	        if p.exists():
    31	            return load_rows(p)
    32	    raise FileNotFoundError(name)
    33	
    34	
    35	def nearest_ping(pings: list[tuple[int, dict]], at_micros: int, window_min: int):
    36	    window = window_min * 60_000_000
    37	    best = None
    38	    for micros, p in pings:
    39	        delta = abs(micros - at_micros)
    40	        if delta > window:
    41	            continue
    42	        delta_min = delta // 60_000_000
    43	        if best is None or delta_min < best[1]:
    44	            best = (p, delta_min)
    45	    return best
    46	
    47	
    48	def evaluate_card(txn: dict, truck: dict | None, pings: list[tuple[int, dict]]) -> tuple[str, dict]:
    49	    if truck is None:
    50	        return "location_mismatch", {"reason": "card not assigned to a truck"}
    51	    capacity_limit = truck["tankGal"] * T["TANK_FACTOR"]
    52	    if txn["gallons"] > capacity_limit:
    53	        return "capacity_exceeded", {"tankGal": truck["tankGal"], "capacityLimitGal": round(capacity_limit, 1)}
    54	    near = nearest_ping(pings, cal.iso_to_micros(txn["at"]), T["PING_WINDOW_MIN"])
    55	    if near is None:
    56	        return "location_mismatch", {"nearestPing": None, "reason": "no ping within 30 minutes"}
    57	    p, delta_min = near
    58	    miles = haversine(p["lat"], p["lon"], txn["stationLat"], txn["stationLon"])
    59	    ev = {"distanceMiles": round(miles, 1), "deltaMin": delta_min, "engineOn": p["engineOn"]}
    60	    if miles > T["LOCATION_MILES"]:
    61	        return "location_mismatch", ev
    62	    return "matched", ev
    63	
    64	
    65	def evaluate_toll(txn: dict, at_micros: int, earlier: list[tuple[int, dict]]) -> tuple[str, dict]:
    66	    window = T["TOLL_DUP_MIN"] * 60_000_000
    67	    for e_micros, e in earlier:
    68	        if e["id"] == txn["id"] or e["plazaId"] != txn["plazaId"]:
    69	            continue
    70	        delta = at_micros - e_micros
    71	        if 0 <= delta <= window:
    72	            return "duplicate_toll", {"duplicateOf": e["id"], "minutesApart": delta // 60_000_000}
    73	    return "matched", {}
    74	
    75	
    76	def evaluate_invoice(inv: dict, po: dict | None, contract: dict | None, vendor: dict | None, earlier: list[dict]) -> tuple[str, dict]:
    77	    if inv.get("poId") is not None:
    78	        if po is None or po["vendorId"] != inv["vendorId"] or po["item"] != inv["item"]:
    79	            return "po_mismatch", {"poId": inv["poId"]}
    80	    if vendor is not None and inv["cents"] > T["BANK_CHANGE_MIN_CENTS"]:
    81	        since = inv["receivedDay"] - vendor["bankChangedDay"]
    82	        if vendor["bankChangedDay"] > 0 and 0 <= since <= T["BANK_CHANGE_DAYS"]:
    83	            return "vendor_bank_change", {"bankChangedDay": vendor["bankChangedDay"], "daysSinceChange": since}
    84	    for e in earlier:
    85	        if e["id"] == inv["id"]:
    86	            continue
    87	        apart = inv["receivedDay"] - e["receivedDay"]
    88	        if e["cents"] == inv["cents"] and (e.get("poId") or "") != (inv.get("poId") or "") and 0 <= apart <= T["INVOICE_DUP_DAYS"]:
    89	            return "duplicate_invoice", {"duplicateOf": e["id"], "daysApart": apart}
    90	    if po is not None:
    91	        if contract is not None:
    92	            limit = (contract["rateCents"] * round((1 + T["RATE_VARIANCE"]) * 10_000)) // 10_000
    93	            if inv["unitCents"] > limit:
    94	                return "rate_variance", {"contractId": contract["id"], "contractRateCents": contract["rateCents"], "allowedUnitCents": limit}
    95	        if inv["qty"] > po["receivedQty"]:
    96	            return "short_received", {"poQty": po["qty"], "receivedQty": po["receivedQty"],
    97	                                      "proposedPartialCents": round(po["receivedQty"]) * inv["unitCents"]}
    98	    return "matched", {}
    99	
   100	
   101	def auto_pay_decision(cents: int, day_auto_paid: int) -> str:
   102	    if cents > T["AUTO_PAY_MAX_CENTS"]:
   103	        return "limit"
   104	    if day_auto_paid + cents > T["AUTO_PAY_DAY_MAX_CENTS"]:
   105	        return "limit"
   106	    return "pay"
   107	
   108	
   109	def run(fixtures: Path) -> dict:
   110	    trucks = {t["id"]: t for t in load_table(fixtures, "trucks")}
   111	    trucks_by_card = {t["fuelCardId"]: t for t in trucks.values()}
   112	    pings_by_truck: dict[int, list[tuple[int, dict]]] = {}
   113	    for p in load_table(fixtures, "trip_pings"):
   114	        pings_by_truck.setdefault(p["truckId"], []).append((cal.iso_to_micros(p["at"]), p))
   115	    verdicts: dict[str, tuple[str, dict, int, int]] = {}  # txnRef -> (code, evidence, day, cents)
   116	
   117	    for txn in load_table(fixtures, "card_txns"):
   118	        truck = trucks_by_card.get(txn["cardId"])
   119	        assert truck is not None and truck["id"] == txn["truckId"], txn["id"]
   120	        code, ev = evaluate_card(txn, truck, pings_by_truck.get(txn["truckId"], []))
   121	        verdicts[txn["id"]] = (code, ev, txn["day"], txn["cents"])
   122	
   123	    tolls = load_table(fixtures, "toll_txns")
   124	    tolls_sorted = sorted(((cal.iso_to_micros(t["at"]), t) for t in tolls), key=lambda x: (x[0], x[1]["id"]))
   125	    seen_by_plate: dict[str, list[tuple[int, dict]]] = {}
   126	    for micros, t in tolls_sorted:
   127	        earlier = seen_by_plate.setdefault(t["plate"], [])
   128	        code, ev = evaluate_toll(t, micros, earlier)
   129	        verdicts[t["id"]] = (code, ev, t["day"], t["cents"])
   130	        earlier.append((micros, t))
   131	
   132	    vendors = {v["id"]: v for v in load_table(fixtures, "vendors")}
   133	    contracts = load_table(fixtures, "contracts")
   134	    pos = {p["id"]: p for p in load_table(fixtures, "pos")}
   135	    invoices = sorted(load_table(fixtures, "invoices"), key=lambda i: (i["receivedDay"], i["id"]))
   136	    seen_by_vendor: dict[int, list[dict]] = {}
   137	    for inv in invoices:
   138	        po = pos.get(inv["poId"]) if inv.get("poId") is not None else None
   139	        contract = next((c for c in contracts if c["vendorId"] == inv["vendorId"] and c["item"] == inv["item"]
   140	                         and c["validFromDay"] <= inv["receivedDay"] <= c["validToDay"]), None)
   141	        earlier = seen_by_vendor.setdefault(inv["vendorId"], [])
   142	        code, ev = evaluate_invoice(inv, po, contract, vendors.get(inv["vendorId"]), earlier)
   143	        verdicts[inv["id"]] = (code, ev, inv["receivedDay"], inv["cents"])
   144	        earlier.append(inv)
   145	
   146	    # auto-pay limits over clean rows, in id order within each day
   147	    day_paid: dict[int, int] = {}
   148	    day_total: dict[int, int] = {}
   149	    limits: list[str] = []
   150	    for ref in sorted(verdicts, key=lambda r: (verdicts[r][2], r)):
   151	        code, _, day, cents = verdicts[ref]
   152	        if code != "matched":
   153	            continue
   154	        day_total[day] = day_total.get(day, 0) + cents
   155	        if auto_pay_decision(cents, day_paid.get(day, 0)) == "limit":
   156	            limits.append(ref)
   157	        else:
   158	            day_paid[day] = day_paid.get(day, 0) + cents
   159	    flagged = {ref: v[0] for ref, v in verdicts.items() if v[0] != "matched"}
   160	    return {"flagged": flagged, "limits": limits, "day_auto_paid": day_paid, "day_clean_total": day_total, "n": len(verdicts)}
   161	
   162	
   163	def compare_with_key(result: dict, key_rows: list[dict]) -> None:
   164	    expected = {r["txnRef"]: r["code"] for r in key_rows}
   165	    flagged = result["flagged"]
   166	    extra = sorted(set(flagged) - set(expected))
   167	    missing = sorted(set(expected) - set(flagged))
   168	    wrong = sorted(r for r in expected if r in flagged and flagged[r] != expected[r])
   169	    if extra or missing or wrong:
   170	        raise AssertionError(f"mirror disagrees with answer key: extra={extra[:20]} missing={missing[:20]} wrong={wrong[:20]}")
   171	
   172	
   173	if __name__ == "__main__":
   174	    fx = Path(sys.argv[1] if len(sys.argv) > 1 else "fixtures")
   175	    res = run(fx)
   176	    key = json.loads((fx / "answer_key.json").read_text())
   177	    compare_with_key(res, key)
   178	    by_code: dict[str, int] = {}
   179	    for code in res["flagged"].values():
   180	        by_code[code] = by_code.get(code, 0) + 1
   181	    decoys = sum(1 for r in key if r["expected"] == "clear_after_question")
   182	    print(f"rows evaluated: {res['n']}")
   183	    print(f"flagged: {len(res['flagged'])} = {len(key) - decoys} planted + {decoys} decoys; by code {dict(sorted(by_code.items()))}")
   184	    print(f"limit policy holds: {len(res['limits'])} {res['limits']}")
   185	    print(f"max auto-paid cents in a day: {max(res['day_auto_paid'].values())}")

exec
/bin/zsh -lc "nl -ba README.md | sed -n '1,155p'; nl -ba docs/DEVPOST.md | sed -n '1,100p'" in /Users/anudeepbonagiri/dev/hackathons/dispatch-ledger
 succeeded in 0ms:
     1	# Dispatch Ledger
     2	
     3	**The money does not move until the code has matched the line, and the agent can never approve what it proposed.**
     4	
     5	An autonomous accounts-payable clerk for a 40-truck carrier. It matches every fuel, toll and maintenance charge against telematics and contracts in plain code, pays clean lines, holds the rest, investigates each hold with Factory's Droid over Elastic Agent Builder tools, asks the fleet controller one question through ASI:One when it cannot decide, and turns the answer into a scoped, backtested rule. All state and every permission check live in one SpacetimeDB module.
     6	
     7	Links: dashboard (local, see Run it), video (to come), Agentverse profile (to come).
     8	
     9	> Simulated carrier. Sandbox money. Every figure on screen and in this file is read from the ledger or from `docs/FACTS.json`. Not for operational use.
    10	
    11	![tag:innovationlab](https://img.shields.io/badge/innovationlab-3D8BD3)
    12	![tag:hackathon](https://img.shields.io/badge/hackathon-5F43F1)
    13	
    14	## Principles
    15	
    16	- **Code first.** The kernel (`spacetimedb/src/kernel.ts`) is pure TypeScript with integer cents. It never calls a model.
    17	- **Agents for judgment.** Droid investigates and recommends. Its output type has no `pay`.
    18	- **No agent is trusted.** Three identities (seed, agent, controller) in a `role` table; every reducer checks the caller first; the agent cannot approve, and the requester of a release cannot approve it either.
    19	- **Ask once.** A controller answer becomes a rule with a scope and an expiry. The database backtests it before it is stored and refuses any rule that would clear a confirmed exception.
    20	- **Audit-ready.** Every action, and every refusal, is an `audit_event` row with the actor's role.
    21	
    22	## Seats it fills
    23	
    24	The AP clerk who matches and codes bills. It asks the fleet controller, who approves payments, and never sits in that seat.
    25	
    26	## Hold 2231, the worked case
    27	
    28	| | |
    29	| --- | --- |
    30	| Transaction | Fuel, 120.0 gal, $412.00, Love's 412, Schulenburg TX, business day 41 |
    31	| Card | FC-1017, assigned to truck 17 |
    32	| Telematics | Truck 17 parked at the San Antonio terminal, engine off, 96 miles away |
    33	| Kernel | `location_mismatch` (threshold 25 miles). Hold raised, task opened |
    34	| Investigator | `find_trips_near` over MCP: truck 22 at the pump within the window. `swap_log.txt`: Ortiz moved to unit 22, unit 17 in the shop |
    35	| Question to the controller | Did Ramon Ortiz drive truck 22 that day while truck 17 was in the shop? |
    36	| Answer | Yes, swapped trucks that week |
    37	| Rule | `location_mismatch`, scope driver 23, days 41 to 46, one-time. Backtest by the module: would clear 1 past row, 0 confirmed exceptions |
    38	| Verdict | Controller approves the rule in ASI:One; the kernel re-runs and clears 2231; the payment row is written with role `rule` |
    39	
    40	## What is measured
    41	
    42	All numbers below are written by `scripts/facts.py` into `docs/FACTS.json` and `docs/RESULTS.md`; nothing is typed by hand. Last run 2026-10-24T18:38:38+00:00, 7944 transactions over 92 business days.
    43	
    44	| Code | Planted | Raised | Precision | Recall |
    45	| --- | --- | --- | --- | --- |
    46	| location_mismatch | 20 | 20 | 1.0 | 1.0 |
    47	| capacity_exceeded | 6 | 6 | 1.0 | 1.0 |
    48	| rate_variance | 9 | 9 | 1.0 | 1.0 |
    49	| duplicate_toll | 11 | 11 | 1.0 | 1.0 |
    50	| duplicate_invoice | 4 | 4 | 1.0 | 1.0 |
    51	| vendor_bank_change | 3 | 3 | 1.0 | 1.0 |
    52	| short_received | 5 | 5 | 1.0 | 1.0 |
    53	
    54	| Metric | Result |
    55	| --- | --- |
    56	| Overall precision and recall on the 58 answer-key rows (52 planted exceptions and 6 decoys) | 1.0 and 1.0 |
    57	| Decoys (legitimate unit swaps) cleared through an approved rule after exactly one controller answer | 6 of 6 |
    58	| Planted exceptions cleared by a rule | 0 |
    59	| Policy holds from the auto-pay limit (correct behaviour, not exceptions) | 6 |
    60	| Auto-paid by the kernel or a rule | 7886 payments, $1,083,630.52 |
    61	| Released by the controller | 9 payments, $37,547.00 |
    62	| Investigations by source in the offline run | {'none': 45, 'replayed': 2} |
    63	
    64	The whole cycle (publish with empty data, load fixtures, 92 days, scripted controller pass, facts) runs in about ten seconds with `scripts/full_run.sh`.
    65	
    66	## How it works
    67	
    68	1. `seed/generate.py` renders the company and plants 52 exceptions and 6 decoys, writing `seed/fixtures/answer_key.json`. Only `scripts/facts.py` reads the key.
    69	2. `scripts/load_fixtures.ts` loads the rows through `seed_*` reducers as the seed identity (SpacetimeDB).
    70	3. `advance_day`, a scheduled reducer, ticks every 2 seconds and runs `matchDay`: the kernel evaluates every row dated that day and writes `match_result`, then a `payment` or a `hold` plus an `agent_task` (SpacetimeDB).
    71	4. `worker/` holds the agent identity, claims tasks with a version-locked `claim_task`, and runs Droid with scoped tools over the evidence folder and the Elastic MCP endpoint, or replays recorded findings offline (Factory, Elastic).
    72	5. The controller talks to a uAgent on ASI:One: list holds, ask why, answer, approve a rule, approve a payment. Each is a `try_*` procedure call with the controller token (Fetch.ai).
    73	6. `create_rule` backtests inside the database; `approve_rule` re-runs the kernel on the source transaction; the dashboard, subscribed anonymously to the public tables, shows all of it live (SpacetimeDB).
    74	
    75	## Where Droid runs
    76	
    77	See `worker/README.md` for the `createSession` options block quoted from the code and the tool ids confirmed from the SDK types. In short: `cwd` is the read-only evidence folder, `autonomyLevel: Off`, `disabledToolIds` for Execute, Edit, Create and ApplyPatch, a `permissionHandler` that allows only MCP tool calls, `mcpServers` pointing at `{KIBANA_URL}/api/agent_builder/mcp`, a 90 second `AbortController`, and a JSON schema output whose `recommendation` is one of `clear`, `hold`, `hold_and_ask`.
    78	
    79	## Agent addresses
    80	
    81	| Name | Handle | Address | Role | Code |
    82	| --- | --- | --- | --- | --- |
    83	| dispatch-ledger-controller | to come | `agent1q...` (filled after first run) | the controller's seat on ASI:One | `agent/` |
    84	
    85	## Elastic
    86	
    87	Indices `telematics_log` (geo_point), `receipts`, `contracts`, `invoices` on a Serverless project; two Agent Builder ES|QL tools, `find_trips_near` and `contract_rate_for_vendor`, exposed to Droid over MCP. Setup and smoke tests in `elastic/`.
    88	
    89	## SpacetimeDB
    90	
    91	Module in `spacetimedb/src/`. Tables and access in `schema.ts`; reducers, procedures and the kernel driver in `index.ts`; thresholds in `thresholds.ts`. Three identities are minted with `POST /v1/identity` and granted by `grant_role`. The segregation-of-duties check is `checkApprovePayment` in `index.ts`.
    92	
    93	## Run it
    94	
    95	Tests first:
    96	
    97	```
    98	cd spacetimedb && npm install && npx vitest run
    99	cd ../worker && npm install && npm test
   100	cd ../seed && python3 -m pytest
   101	cd ../agent && python3 -m pytest
   102	```
   103	
   104	Then the demo month, no model calls, no network:
   105	
   106	```
   107	scripts/demo_up.sh
   108	scripts/clock.sh run
   109	python3 -m agent.cli "what needs me"
   110	python3 scripts/facts.py
   111	```
   112	
   113	## Environment variables
   114	
   115	| Variable | Required | Purpose |
   116	| --- | --- | --- |
   117	| `STDB_URI`, `STDB_DB` | yes | local server and database name |
   118	| `STDB_SEED_TOKEN` | yes | the publisher; loads fixtures |
   119	| `STDB_AGENT_TOKEN` | yes | the worker; can never approve |
   120	| `STDB_CONTROLLER_TOKEN` | yes | the ASI:One agent and the terminal CLI |
   121	| `WORKER_MODE` | yes | `replay` for the offline demo, `record` or `live` with keys |
   122	| `FACTORY_API_KEY` | live only | Droid SDK |
   123	| `ELASTICSEARCH_URL`, `ELASTIC_API_KEY`, `KIBANA_URL` | live only | Serverless project and Agent Builder MCP |
   124	| `ANTHROPIC_API_KEY` | optional | rule drafting and explanations; templates otherwise |
   125	| `ASI_ONE_API_KEY`, `AGENT_SEED`, `AGENT_PORT` | agent | ASI:One free-text classification and the agent's address |
   126	
   127	`scripts/demo_up.sh` exports every model key as empty on purpose so the offline run cannot make a paid call.
   128	
   129	## Repo map
   130	
   131	| Path | What |
   132	| --- | --- |
   133	| `spacetimedb/` | the module: schema, kernel, reducers, procedures, tests |
   134	| `module_bindings/` | generated client bindings, committed |
   135	| `worker/` | Droid investigator, replay, rule drafting |
   136	| `agent/` | uAgent for ASI:One and its terminal twin |
   137	| `web/` | read-only live dashboard |
   138	| `elastic/` | mappings, ingest, Agent Builder tools and agent |
   139	| `seed/` | generator, planted errors, answer key, evidence |
   140	| `scripts/` | demo_up, clock, inject, facts, load_fixtures, mint_identities |
   141	| `docs/` | CONTRACT.md, FACTS.json, not-built.md, notability/ |
   142	| `context/` | PROJECT_STATUS.md, JUDGE_QA.md, CLAIMS_AUDIT.md |
   143	
   144	## Status and honesty
   145	
   146	What is live: the module, the kernel, the clock, the roles and refusals, the dashboard subscriptions, the controller agent against the local database, the rule backtest. What is simulated: the company, the money, the vendors. What is replayed or scripted in the offline demo: the investigator's findings, labelled on every card. Not built: `docs/not-built.md`. Everything fails toward no money moving.
   147	
   148	## Team
   149	
   150	Anudeep Bonagiri (UTSA, founder of Cruze) with review by Shrithik.
     1	# Devpost draft
     2	
     3	Title: Dispatch Ledger
     4	
     5	Tagline: An AP clerk for a trucking fleet that pays what the code can prove and asks a human about the rest.
     6	
     7	Tracks to tag: Hyphenate, SpacetimeDB, Fetch.ai, Factory, Elastic, Notability, Microsoft. (CRS only if built.)
     8	
     9	## Inspiration
    10	
    11	I run a fleet software company. The back office of every carrier we talk to has one person matching fuel-card statements against trucks that may not have been where the card was. We built the clerk that does that match in code and knows when to ask.
    12	
    13	## What it does
    14	
    15	Matches every fuel, toll and maintenance charge for a simulated 40-truck Texas carrier against telematics, tank sizes, prior tolls, POs, contract rates, receiving and vendor bank changes. Clean lines pay under auto-pay limits. Holds get an investigator (Factory Droid) with scoped tools over Elastic, a question to the controller on ASI:One, and the answer becomes a scoped, backtested, expiring rule enforced by the kernel.
    16	
    17	## How we built it
    18	
    19	One SpacetimeDB TypeScript module holds all state and every permission check: three identities in a role table, a scheduled reducer that advances the business day, procedures that commit refusals to the audit trail. A pure kernel in integer cents. A Node worker running the Droid SDK with autonomy Off and only MCP tool calls allowed. A Python uAgent on Agentverse as the controller's seat. A read-only React dashboard subscribed anonymously to public tables.
    20	
    21	## Challenges
    22	
    23	The CLI installed 2.13 the morning of, not the 2.10 we had verified against. A thrown refusal rolls back its own audit row, so we added procedures that commit the refusal first. The backtest had to move into the database because agent code may never read the answer key.
    24	
    25	## Accomplishments
    26	
    27	From docs/FACTS.json: recall 1.0 and precision 1.0 on 58 answer-key rows (52 planted exceptions and 6 decoys) across seven classes over 7944 transactions; 6 of 6 legitimate truck swaps cleared through a backtested rule after exactly one controller answer; zero planted exceptions cleared by a rule; every refusal, including the agent identity trying to approve a payment, is a row in the audit trail with its role.
    28	
    29	## What we learned
    30	
    31	Controls belong in the database, not in prompts. A model that cannot pay is easy to trust.
    32	
    33	## What is next
    34	
    35	Real fuel-card and telematics connectors for the pilot fleet; the rule memory as the product.
    36	
    37	## Built with
    38	
    39	spacetimedb, typescript, node, react, vite, python, uagents, asi-one, factory-droid-sdk, elasticsearch, agent-builder, zod, vitest, pytest
    40	
    41	## Video
    42	
    43	To come: 3:30, opens on hold 2231.

exec
/bin/zsh -lc "rg -n 'answer_key|seed\\.mirror|mirror\\.py|load_swaps|swap_log|AGENT_SEED|AGENT_PORT|port=' scripts seed agent worker spacetimedb --glob '"'!**/node_modules/**'"' --glob '"'!**/__pycache__/**'"'" in /Users/anudeepbonagiri/dev/hackathons/dispatch-ledger
 succeeded in 115ms:
agent/agent.py:5:into the Agentverse profile. AGENT_SEED fixes the address; never change it after registering.
agent/agent.py:43:    seed = os.getenv("AGENT_SEED")
agent/agent.py:45:        sys.exit("AGENT_SEED is not set. Run `openssl rand -hex 32` once, put it in .env, and never change it.")
agent/agent.py:49:        port=int(os.getenv("AGENT_PORT", "8000")),
agent/agent.py:80:    port = os.getenv("AGENT_PORT", "8000")
scripts/controller_sim.py:25:SWAP_LOG = ROOT / "seed/fixtures/evidence/swap_log.txt"
scripts/controller_sim.py:88:def load_swaps():
scripts/controller_sim.py:128:    swaps = load_swaps()
agent/README.md:37:Environment (repo root `.env`): `STDB_URI`, `STDB_DB`, `STDB_CONTROLLER_TOKEN`, `AGENT_SEED`, `AGENT_PORT`, and optionally `ASI_ONE_API_KEY` for free-text routing through `asi1-mini`. Without the key, free text is taken as the answer to the hold you last discussed. A line that starts like a command but does not parse (`aprove 2231`, a bare `answer`) gets the help text, never stored as an answer. Text is bounded before any call, matching the module: answers up to 1000 characters, call-back notes and reasons up to 500, control characters other than newline dropped; at most 2000 characters go to the classifier.
seed/render_docs.py:86:def write_swap_log(out: Path, swaps, company: Company, po_hint: dict) -> None:
seed/render_docs.py:101:    (out / "swap_log.txt").write_text("\n".join(lines) + "\n")
seed/render_docs.py:143:    write_swap_log(out, swaps, company, po_hint)
worker/src/brief.ts:75:    ['swap_log.txt', 'the dispatcher log of drivers moved between units (truck swaps, shop days)'],
scripts/demo_up.sh:66:if grep -q '^AGENT_SEED=.\+' .env && [ -d agent/.venv ]; then
agent/ledger.py:95:        with httpx.Client(timeout=TIMEOUT, transport=_transport) as client:
worker/src/rules.ts:3:// The answer key (seed/fixtures/answer_key.json) is never read here. Only public tables are used.
scripts/facts.py:5:which this script writes. It is the only program in the repository that reads seed/fixtures/answer_key.json.
scripts/facts.py:7:Usage: python scripts/facts.py [--uri http://127.0.0.1:3100] [--db dispatch-ledger] [--key seed/fixtures/answer_key.json]
scripts/facts.py:53:    ap.add_argument("--key", default=str(ROOT / "seed/fixtures/answer_key.json"))
seed/fixtures/answer_key.json:137:    "note": "legitimate swap: Clayton Burks drove relief unit 9 days 8-9 while unit 15 was in the shop (ac_service); he kept using card FC-1015; see swap_log.txt",
seed/fixtures/answer_key.json:161:    "note": "legitimate swap: Jerome Watkins drove relief unit 14 days 19-22 while unit 30 was in the shop (oil_service); he kept using card FC-1030; see swap_log.txt",
seed/fixtures/answer_key.json:167:    "note": "legitimate swap: Ramon Ortiz drove relief unit 22 days 41-44 while unit 17 was in the shop (brake job); he kept using card FC-1017; see swap_log.txt",
seed/fixtures/answer_key.json:197:    "note": "legitimate swap: Carl Whitaker drove relief unit 27 days 51-54 while unit 35 was in the shop (ac_service); he kept using card FC-1035; see swap_log.txt",
seed/fixtures/answer_key.json:221:    "note": "legitimate swap: Alejandro Garza drove relief unit 13 days 74-75 while unit 6 was in the shop (alignment); he kept using card FC-1006; see swap_log.txt",
seed/fixtures/answer_key.json:233:    "note": "legitimate swap: Derrick Osborne drove relief unit 31 days 83-85 while unit 16 was in the shop (tire_replacement); he kept using card FC-1016; see swap_log.txt",
agent/tests/test_intents.py:83:                        {"source": "swap_log.txt", "ref": "line 14", "quote": "08/27 Ortiz R. -> unit 22 (17 in shop)"},
agent/tests/test_intents.py:129:        'Evidence: "08/27 Ortiz R. -> unit 22 (17 in shop)" (swap_log.txt, line 14)',
worker/README.md:21:- Read `seed/fixtures/answer_key.json`. The backtest uses `match_result` and `hold` only.
seed/README.md:4:(2026-07-01 to 2026-11-05, weekdays only), plus the evidence folder and `answer_key.json`.
seed/README.md:11:    .venv/bin/python mirror.py fixtures        # re-derive every verdict with the kernel rules
seed/README.md:21:invoices and the invoice plants), `render_docs.py` (evidence), `mirror.py` (Python copy of the kernel).
seed/README.md:25:5 short_received, plus 6 decoys (legitimate truck swaps in `evidence/swap_log.txt`; card transaction 2231 on day 41
seed/README.md:30:about 35 percent. Local time is UTC-5 for all 92 days. No code outside `scripts/facts.py` may read `answer_key.json`.
seed/mirror.py:176:    key = json.loads((fx / "answer_key.json").read_text())
seed/plant.py:144:    """Add planted card and toll rows, assign ids, return (card_txns, tolls, answer_key_rows)."""
seed/plant.py:240:                    f"{s.own_truck} was in the shop ({s.reason}); he kept using card {x['cardId']}; see swap_log.txt")
seed/maintenance.py:106:    """Returns (contracts, pos, invoices, answer_key_rows, info). Ids are assigned here."""
worker/test/finding.test.ts:13:    { source: 'swap_log.txt', ref: 'line 14', quote: '08/27 Ortiz R. -> unit 22 (17 in shop)' },
worker/test/finding.test.ts:22:  fs.writeFileSync(path.join(evidenceDir, 'swap_log.txt'), '08/27 Ortiz R. -> unit 22 (17 in shop)\n');
worker/test/finding.test.ts:80:    const v = verifyEvidence(finding([{ source: 'swap_log.txt', ref: 'line 1', quote: '08/27  Ortiz R.\n-> unit 22' }]), { evidenceDir, brief, steps: [] });
worker/test/finding.test.ts:88:        { source: 'swap_log.txt', ref: 'line 1', quote: '08/26 Ortiz R. -> unit 22' },
worker/test/finding.test.ts:94:    expect(v.notes).toContain('evidence dropped: quote not found in swap_log.txt');
worker/test/finding.test.ts:140:    const raw = parseFinding({ ...good(), evidence: [{ source: 'swap_log.txt', ref: 'line 1', quote: '08/27 Ortiz R.' }] }, missing, { requireFiles: false });
worker/test/finding.test.ts:143:    expect(v.notes[0]).toMatch(/^evidence dropped: swap_log.txt unverifiable/);
seed/tests/test_seed.py:38:    data["answer_key"] = json.loads((FIXTURES / "answer_key.json").read_text())
seed/tests/test_seed.py:124:    capacity_refs = {r["txnRef"] for r in fx["answer_key"] if r["code"] == "capacity_exceeded"}
seed/tests/test_seed.py:145:def test_answer_key_counts(fx):
seed/tests/test_seed.py:146:    key = fx["answer_key"]
seed/tests/test_seed.py:170:    row = next(r for r in fx["answer_key"] if r["txnRef"] == "2231")
seed/tests/test_seed.py:172:    log = (FIXTURES / "evidence" / "swap_log.txt").read_text()
seed/tests/test_seed.py:182:    row = next(r for r in fx["answer_key"] if r["txnRef"] == "INV-1077")
seed/tests/test_seed.py:188:    lm = [cards[r["txnRef"]] for r in fx["answer_key"] if r["code"] == "location_mismatch" and r["expected"] == "hold"]
seed/tests/test_seed.py:189:    decoys = [cards[r["txnRef"]] for r in fx["answer_key"] if r["expected"] == "clear_after_question"]
seed/tests/test_seed.py:199:    for r in fx["answer_key"]:
seed/tests/test_seed.py:216:    mirror.compare_with_key(res, fx["answer_key"])
seed/tests/test_seed.py:243:    planted = {r["txnRef"] for r in fx["answer_key"] if r["code"] == "duplicate_invoice"}
seed/tests/test_seed.py:255:    planted = {r["txnRef"] for r in fx["answer_key"] if r["code"] == "duplicate_toll"}
worker/test/replay.test.ts:14:  // the 2231 fixture cites swap_log.txt; the file check runs when the evidence dir exists
worker/test/replay.test.ts:15:  fs.writeFileSync(path.join(tmp, 'swap_log.txt'), '08/27 Ortiz R. -> unit 22 (17 in shop)\n');
worker/test/replay.test.ts:71:    // swap_log.txt cannot be verified without the evidence tree; the kernel ref exists in the brief
worker/test/replay.test.ts:72:    expect(out.finding.evidence.some(e => e.source === 'swap_log.txt')).toBe(false);
worker/test/replay.test.ts:75:    expect(notes.some(t => t.startsWith('evidence dropped: swap_log.txt unverifiable'))).toBe(true);
worker/test/replay.test.ts:80:    expect(loadFixture(FIXTURES, '../answer_key')).toBeUndefined();
seed/fixtures/summary.json:8:    "answer_key_rows": 58,
seed/fixtures/investigations/2231.json:13:        "source": "swap_log.txt",
seed/fixtures/investigations/2231.json:74:      "toolUseId": "toolu_02_grep_swap_log_2231",
seed/fixtures/investigations/2231.json:77:        "path": "swap_log.txt"
seed/fixtures/investigations/2231.json:83:      "toolUseId": "toolu_02_grep_swap_log_2231",
seed/generate.py:77:    dump(out / "answer_key.json", key)
seed/generate.py:108:                   "answer_key_rows": len(key)},

exec
/bin/zsh -lc "nl -ba scripts/facts.py | sed -n '45,90p;130,211p'" in /Users/anudeepbonagiri/dev/hackathons/dispatch-ledger
exec
/bin/zsh -lc "rg -n 'refuse\\(|audit\\(|guard\\(|attempt\\(|createRule|approveRule|advanceDay|seed_|matchDay' spacetimedb/src/index.ts" in /Users/anudeepbonagiri/dev/hackathons/dispatch-ledger
exec
/bin/zsh -lc "rg -n 'FACTS|copy|source' scripts/facts.py web/src worker/src/index.ts worker/src/rules.ts" in /Users/anudeepbonagiri/dev/hackathons/dispatch-ledger
exec
/bin/zsh -lc "nl -ba seed/generate.py | sed -n '55,115p'; nl -ba seed/render_docs.py | sed -n '80,108p'" in /Users/anudeepbonagiri/dev/hackathons/dispatch-ledger
 succeeded in 0ms:
    45	        rows.append(row)
    46	    return rows
    47	
    48	
    49	def main() -> int:
    50	    ap = argparse.ArgumentParser()
    51	    ap.add_argument("--uri", default=os.environ.get("STDB_URI", "http://127.0.0.1:3100"))
    52	    ap.add_argument("--db", default=os.environ.get("STDB_DB", "dispatch-ledger"))
    53	    ap.add_argument("--key", default=str(ROOT / "seed/fixtures/answer_key.json"))
    54	    ap.add_argument("--out", default=str(ROOT / "docs"))
    55	    args = ap.parse_args()
    56	
    57	    key = json.loads(Path(args.key).read_text())
    58	    key_by_ref = {k["txnRef"]: k for k in key}
    59	    planted = [k for k in key if k["expected"] in ("hold", "auto_reject")]
    60	    decoys = [k for k in key if k["expected"] == "clear_after_question"]
    61	
    62	    mr = sql(args.uri, args.db, "SELECT * FROM match_result")
    63	    holds = sql(args.uri, args.db, "SELECT * FROM hold")
    64	    payments = sql(args.uri, args.db, "SELECT * FROM payment")
    65	    rules = sql(args.uri, args.db, "SELECT * FROM rule")
    66	    tasks = sql(args.uri, args.db, "SELECT * FROM agent_task")
    67	    totals = sql(args.uri, args.db, "SELECT * FROM day_total")
    68	    clock = sql(args.uri, args.db, "SELECT * FROM business_day")
    69	    audit = sql(args.uri, args.db, "SELECT action, actor_role, ref FROM audit_event")
    70	
    71	    hold_by_ref = {h["txn_ref"]: h for h in holds}
    72	    mr_by_ref = {m["txn_ref"]: m for m in mr}
    73	
    74	    # Raised exceptions: every hold with an exception code (a hold row survives release or clearing),
    75	    # plus duplicate tolls, which are auto-rejected without a hold.
    76	    raised: dict[str, str] = {}
    77	    for h in holds:
    78	        if h["code"] in EXCEPTION_CODES:
    79	            raised[h["txn_ref"]] = h["code"]
    80	    for m in mr:
    81	        if m["code"] == "duplicate_toll":
    82	            raised[m["txn_ref"]] = "duplicate_toll"
    83	
    84	    by_code = []
    85	    tp_total = fp_total = planted_total = 0
    86	    for code in EXCEPTION_CODES:
    87	        planted_refs = {k["txnRef"] for k in key if k["code"] == code}
    88	        raised_refs = {r for r, c in raised.items() if c == code}
    89	        tp = len(planted_refs & raised_refs)
    90	        fp = len(raised_refs - planted_refs)
   130	
   131	    by_day = []
   132	    holds_per_day = Counter(h["day"] for h in holds if h["code"] in EXCEPTION_CODES)
   133	    dups_per_day = Counter(m["day"] for m in mr if m["code"] == "duplicate_toll")
   134	    for t in sorted(totals, key=lambda x: x["day"]):
   135	        by_day.append({"day": t["day"], "exceptions": holds_per_day.get(t["day"], 0) + dups_per_day.get(t["day"], 0),
   136	                       "autoPaid": t["auto_paid_count"], "autoPaidCents": int(t["auto_paid_cents"]),
   137	                       "holds": t["hold_count"], "autoRejected": t["rejected_count"], "txns": t["txn_count"]})
   138	
   139	    unreviewed = [k["txnRef"] for k in planted if k["txnRef"] not in raised]
   140	    cost = {"tasks": 0, "inputTokens": 0, "outputTokens": 0, "durationMs": 0}
   141	    cost_log = ROOT / "worker/cost_log.jsonl"
   142	    if cost_log.exists():
   143	        for line in cost_log.read_text().splitlines():
   144	            try:
   145	                e = json.loads(line)
   146	            except json.JSONDecodeError:
   147	                continue
   148	            cost["tasks"] += 1
   149	            cost["inputTokens"] += int(e.get("inputTokens", 0))
   150	            cost["outputTokens"] += int(e.get("outputTokens", 0))
   151	            cost["durationMs"] += int(e.get("durationMs", 0))
   152	
   153	    facts = {
   154	        "asOf": datetime.now(timezone.utc).isoformat(timespec="seconds"),
   155	        "dayReached": clock[0]["day"] if clock else 0,
   156	        "transactionsMatched": len(mr),
   157	        "plantedExceptions": planted_total,
   158	        "decoys": len(decoys),
   159	        "overall": {"precision": overall_precision, "recall": overall_recall, "truePositives": tp_total, "falsePositives": fp_total},
   160	        "byCode": by_code,
   161	        "decoyRows": decoy_rows,
   162	        "decoysCleared": decoys_cleared,
   163	        "decoysClearedWithOneAnswer": decoys_one_answer,
   164	        "plantedClearedByRule": planted_cleared_by_rule,
   165	        "limitHolds": {"count": len(limit_holds), "cents": sum(int(h["cents"]) for h in limit_holds)},
   166	        "autoPaid": {"count": len(auto_paid), "cents": sum(int(p["cents"]) for p in auto_paid)},
   167	        "controllerReleased": {"count": len(controller_paid), "cents": sum(int(p["cents"]) for p in controller_paid)},
   168	        "refusals": {"count": len(refused), "byRole": refused_by_role},
   169	        "investigations": {"bySource": task_sources, "byStatus": task_status},
   170	        "rules": dict(Counter(r["status"] for r in rules)),
   171	        "byDay": by_day,
   172	        "worker_cost": cost,
   173	        "unreviewedPlanted": unreviewed,
   174	        "complete": not unreviewed and clock and clock[0]["day"] >= 92,
   175	    }
   176	    out = Path(args.out)
   177	    out.mkdir(parents=True, exist_ok=True)
   178	    (out / "FACTS.json").write_text(json.dumps(facts, indent=2, sort_keys=True) + "\n")
   179	    web_public = ROOT / "web/public"
   180	    if web_public.exists():
   181	        (web_public / "FACTS.json").write_text(json.dumps(facts, indent=2, sort_keys=True) + "\n")
   182	
   183	    md = ["# Facts", "", f"Written by scripts/facts.py at {facts['asOf']}. Nothing in it is typed by hand.", "",
   184	          f"Day reached: {facts['dayReached']} of 92. Transactions matched: {len(mr)}.", "",
   185	          "| Code | Planted | Raised | True positives | False positives | Precision | Recall |", "| --- | --- | --- | --- | --- | --- | --- |"]
   186	    for b in by_code:
   187	        md.append(f"| {b['code']} | {b['planted']} | {b['raised']} | {b['truePositives']} | {b['falsePositives']} | {b['precision']} | {b['recall']} |")
   188	    md += ["", f"Overall precision {overall_precision}, recall {overall_recall}.",
   189	           f"Decoys cleared through an approved rule: {decoys_cleared} of {len(decoys)} ({decoys_one_answer} with exactly one controller answer).",
   190	           f"Planted exceptions cleared by a rule: {len(planted_cleared_by_rule)} (must be 0).",
   191	           f"Policy holds (auto-pay limit, not exceptions): {len(limit_holds)}.",
   192	           f"Auto-paid by the kernel or a rule: {facts['autoPaid']['count']} payments, ${facts['autoPaid']['cents']/100:,.2f}.",
   193	           f"Released by the controller: {facts['controllerReleased']['count']} payments, ${facts['controllerReleased']['cents']/100:,.2f}.",
   194	           f"Refusals recorded in the audit trail: {len(refused)} ({refused_by_role}).",
   195	           f"Investigations by source: {task_sources}; by status: {task_status}.", ""]
   196	    if unreviewed:
   197	        md.append(f"Unreviewed planted rows (the run is not complete): {unreviewed}")
   198	    (out / "FACTS.md").write_text("\n".join(md) + "\n")
   199	
   200	    # Evals in the winners' format: run date, rerun command, metric/result/target, hard negatives, history, caveat.
   201	    results = [
   202	        "# Results", "",
   203	        f"Run date: {facts['asOf']}. Rerun: `scripts/full_run.sh` (fresh publish, fixtures, worker in replay, 92 days, scripted controller pass, then this file).",
   204	        "", "| Metric | Result | Target |", "| --- | --- | --- |",
   205	        f"| Recall on planted exceptions ({planted_total}) | {overall_recall} | 1.0 |",
   206	        f"| Precision on raised exceptions | {overall_precision} | at or above 0.95 |",
   207	        f"| Decoys cleared through an approved rule | {decoys_cleared} of {len(decoys)} | 6 of 6 |",
   208	        f"| Decoys cleared with exactly one controller answer | {decoys_one_answer} of {len(decoys)} | 6 of 6 |",
   209	        f"| Planted exceptions cleared by a rule | {len(planted_cleared_by_rule)} | 0 |",
   210	        f"| Duplicate tolls auto-rejected without a task | {sum(1 for m in mr if m['code'] == 'duplicate_toll')} | 11 |",
   211	        f"| Days replayed | {facts['dayReached']} | 92 |",

 succeeded in 0ms:
45:function audit(ctx: Ctx, action: string, ref: string, detail: string) {
57:function guard(ctx: Ctx, ref: string, refusal: Refusal, perform: () => void) {
59:    audit(ctx, 'refused', ref, refusal);
65:function refuse(ctx: Ctx, ref: string, why: string): never {
66:  audit(ctx, 'refused', ref, why);
72:  if (r) refuse(ctx, ref, r);
77:function attempt(ctx: TxRunner, ref: string, check: (tx: Ctx) => Refusal, perform: (tx: Ctx) => void) {
80:    if (r) { audit(tx, 'refused', ref, r); return r; }
101:  if (!['seed', 'agent', 'controller'].includes(r)) refuse(ctx, identity.toHexString(), `unknown role ${r}`);
105:  audit(ctx, 'grant_role', identity.toHexString(), r);
114:  audit(ctx, 'seed', 'terminal', `${rows.length} rows`);
119:  audit(ctx, 'seed', 'truck', `${rows.length} rows`);
124:  audit(ctx, 'seed', 'driver', `${rows.length} rows`);
141:  audit(ctx, 'seed', 'vendor', `${rows.length} rows`);
146:  audit(ctx, 'seed', 'contract', `${rows.length} rows`);
151:  audit(ctx, 'seed', 'po', `${rows.length} rows`);
156:  audit(ctx, 'seed', 'invoice', `${rows.length} rows`);
163:  if (!v) refuse(ctx, String(vendorId), 'no such vendor');
165:  audit(ctx, 'vendor_bank_change', String(vendorId), `day ${day}`);
179:  audit(ctx, 'reset_sim', 'day', '0');
188:  audit(ctx, 'set_clock', String(d.day), paused ? 'paused' : 'running');
191:  guard(ctx, 'clock', checkRole(ctx, 'seed', 'controller'), () => performSetClock(ctx, paused)));
193:  attempt(ctx, 'clock', tx => checkRole(tx, 'seed', 'controller'), tx => performSetClock(tx, paused)));
197:  if (micros < 100_000n) refuse(ctx, 'clock', 'tick must be at least 100ms');
202:  audit(ctx, 'set_tick', String(d.day), `${micros} us`);
207:  guard(ctx, 'clock', checkRole(ctx, 'seed', 'controller'), () => advance(ctx)));
209:  attempt(ctx, 'clock', tx => checkRole(tx, 'seed', 'controller'), tx => advance(tx)));
212:export const advanceDay = spacetimedb.reducer({ onSchedule: dayTimer }, { timer: dayTimer.rowType }, (ctx, _args) => {
225:  matchDay(ctx, next);
355:    audit(ctx, 'auto_reject', txnRef, `duplicate_toll of ${String(v.evidence.duplicateOf)}`);
375:      audit(ctx, v.ruleId !== undefined ? 'cleared_by_rule' : 'auto_pay', txnRef, v.ruleId !== undefined ? `rule ${v.ruleId}` : `${cents} cents`);
390:    audit(ctx, 'hold', txnRef, v.code);
393:    audit(ctx, 'hold_recoded', txnRef, `${h.code} -> ${v.code}`);
407:function matchDay(ctx: Ctx, day: number) {
441:  audit(ctx, 'rematch', txnRef, '');
444:  guard(ctx, txnRef, checkRole(ctx, 'controller') ?? checkRematch(ctx, txnRef), () => performRematch(ctx, txnRef)));
446:  attempt(ctx, txnRef, tx => checkRole(tx, 'controller') ?? checkRematch(tx, txnRef), tx => performRematch(tx, txnRef)));
457:  audit(ctx, 'claim_task', String(id), row.txnRef);
466:    if (!row) refuse(ctx, String(id), 'no such task');
467:    if (!row.claimedBy || !row.claimedBy.isEqual(ctx.sender)) refuse(ctx, String(id), 'task not claimed by caller');
468:    if (row.status !== 'claimed') refuse(ctx, String(id), `task is ${row.status}`);
469:    if (!['clear', 'hold', 'hold_and_ask', 'timeout', 'done'].includes(recommendation)) refuse(ctx, String(id), `bad recommendation ${recommendation}`);
470:    if (stepsJson.length > 200_000 || findingJson.length > 50_000) refuse(ctx, String(id), 'payload too large');
485:    audit(ctx, 'record_investigation', String(id), `${row.txnRef} ${recommendation} (${source})`);
523:export const createRule = spacetimedb.reducer(
527:    if (!(RULE_CONDITIONS as readonly string[]).includes(condition)) refuse(ctx, sourceTxnRef, `rules may not target ${condition}`);
528:    if (!['one_time', 'standing'].includes(uses)) refuse(ctx, sourceTxnRef, 'uses must be one_time or standing');
529:    if (validToDay < validFromDay) refuse(ctx, sourceTxnRef, 'rule window is empty');
530:    if (validToDay - validFromDay > 92) refuse(ctx, sourceTxnRef, 'rule window too long');
533:    if (!scoped) refuse(ctx, sourceTxnRef, 'rule must be scoped to a driver, truck, card or vendor');
535:    if (bt.trueExceptionsCleared > 0) refuse(ctx, sourceTxnRef, `rule would clear ${bt.trueExceptionsCleared} confirmed exception(s)`);
542:    audit(ctx, 'create_rule', String(inserted.id), `${condition} ${JSON.stringify(scope)} days ${validFromDay}-${validToDay}; backtest n=${bt.n} confirmed=${bt.confirmedExceptionsCovered}`);
576:  audit(ctx, 'answer_question', txnRef, text.slice(0, 200));
579:  guard(ctx, txnRef, checkAnswerQuestion(ctx, txnRef, text), () => performAnswerQuestion(ctx, txnRef, text)));
581:  attempt(ctx, txnRef, tx => checkAnswerQuestion(tx, txnRef, text), tx => performAnswerQuestion(tx, txnRef, text)));
594:  audit(ctx, 'approve_rule', String(id), `${r.condition} ${r.scopeJson}`);
597:export const approveRule = spacetimedb.reducer({ id: t.u64() }, (ctx, { id }) =>
598:  guard(ctx, String(id), checkApproveRule(ctx, id), () => performApproveRule(ctx, id)));
600:  attempt(ctx, String(id), tx => checkApproveRule(tx, id), tx => performApproveRule(tx, id)));
612:  audit(ctx, 'reject_rule', String(id), reason);
615:  guard(ctx, String(id), checkRejectRule(ctx, id), () => performRejectRule(ctx, id, reason)));
617:  attempt(ctx, String(id), tx => checkRejectRule(tx, id), tx => performRejectRule(tx, id, reason)));
645:  audit(ctx, 'approve_payment', txnRef, callbackNote ?? '');
648:  guard(ctx, txnRef, checkApprovePayment(ctx, txnRef, callbackNote), () => performApprovePayment(ctx, txnRef, callbackNote)));
650:  attempt(ctx, txnRef, tx => checkApprovePayment(tx, txnRef, callbackNote), tx => performApprovePayment(tx, txnRef, callbackNote)));
662:  audit(ctx, 'reject_payment', txnRef, reason);
665:  guard(ctx, txnRef, checkRejectPayment(ctx, txnRef, reason), () => performRejectPayment(ctx, txnRef, reason)));
667:  attempt(ctx, txnRef, tx => checkRejectPayment(tx, txnRef, reason), tx => performRejectPayment(tx, txnRef, reason)));
673:  if (ctx.db.cardTxn.id.find(row.id)) refuse(ctx, row.id, 'txn id exists');
677:  audit(ctx, 'inject', row.id, `truck ${row.truckId} ${row.gallons} gal`);

 succeeded in 0ms:
worker/src/rules.ts:174:  createRule: (args: { sourceTxnRef: string; scopeJson: string; condition: string; backtestJson: string; uses: string; validFromDay: number; validToDay: number; reason: string }) => Promise<void>;
worker/src/rules.ts:185:  source: 'none';
worker/src/rules.ts:194:  const out: EvidenceRef[] = [{ source: 'kernel', ref: 'match_result.code', quote: `${brief.code} on ${brief.kind} ${brief.txnRef}, day ${brief.day}` }];
worker/src/rules.ts:195:  if (brief.question) out.push({ source: 'kernel', ref: 'hold.question', quote: brief.question.slice(0, 400) });
worker/src/rules.ts:196:  if (brief.answer) out.push({ source: 'kernel', ref: 'hold.answer', quote: brief.answer.slice(0, 400) });
worker/src/rules.ts:219:    source: 'none',
worker/src/rules.ts:258:      sourceTxnRef: brief.txnRef,
scripts/facts.py:4:Nothing in the README, the Devpost text or the video is typed by hand: it is read from docs/FACTS.json,
scripts/facts.py:107:        rule = next((r for r in rules if r["source_txn_ref"] == d["txnRef"] and r["status"] in ("approved", "expired")), None)
scripts/facts.py:128:    task_sources = dict(Counter(t["source"] for t in tasks if t["kind"] == "investigate"))
scripts/facts.py:169:        "investigations": {"bySource": task_sources, "byStatus": task_status},
scripts/facts.py:178:    (out / "FACTS.json").write_text(json.dumps(facts, indent=2, sort_keys=True) + "\n")
scripts/facts.py:181:        (web_public / "FACTS.json").write_text(json.dumps(facts, indent=2, sort_keys=True) + "\n")
scripts/facts.py:195:           f"Investigations by source: {task_sources}; by status: {task_status}.", ""]
scripts/facts.py:198:    (out / "FACTS.md").write_text("\n".join(md) + "\n")
web/src/lib/types.ts:63:export type FindingEvidence = { source?: string; ref?: string; quote?: string };
web/src/components/ui.tsx:49:/** Wraps a figure with its source row id (guardrail G17). */
web/src/components/Investigation.tsx:12:  if (task.source === 'none' || st === 'timeout' || st === 'no_fixture') {
web/src/components/Investigation.tsx:13:    return { label: 'scripted stand-in, not a model', tone: 'refused', title: `agent_task ${task.id}.source = ${task.source}, finding.status = ${st ?? 'none'}` };
web/src/components/Investigation.tsx:15:  if (task.source === 'replayed' || st === 'replayed') {
web/src/components/Investigation.tsx:16:    return { label: 'replayed', tone: 'candidate', title: `Recorded execution. agent_task ${task.id}.source = ${task.source}` };
web/src/components/Investigation.tsx:18:  if (task.source === 'live') return { label: 'live', tone: 'release', title: `agent_task ${task.id}.source = live` };
web/src/components/Investigation.tsx:184:                <span>source {draft.source}</span>
web/src/components/Investigation.tsx:366:                <span className="text-faint">source</span> {e.source}
web/src/components/LedgerOfTrust.tsx:59:    const copy = [...events];
web/src/components/LedgerOfTrust.tsx:60:    copy.sort((a, b) => (a.id === b.id ? 0 : a.id > b.id ? -1 : 1));
web/src/components/LedgerOfTrust.tsx:61:    return copy.slice(0, FEED_LIMIT);
web/src/components/Charts.tsx:32:        const res = await fetch('/FACTS.json', { cache: 'no-store' });
web/src/components/Charts.tsx:65:  const label = 'from docs/FACTS.json, written by scripts/facts.py';
web/src/components/Charts.tsx:90:      <Empty>Loading /FACTS.json.</Empty>
web/src/components/Charts.tsx:93:        docs/FACTS.json is not served at /FACTS.json. Run scripts/facts.py and copy the file into web/public/ to see exceptions by code and precision and recall.
web/src/components/Charts.tsx:96:      <Empty>Could not read /FACTS.json: {state.message}</Empty>
web/src/components/Charts.tsx:102:            <span className="text-faint">(FACTS.byDay, {byDay.length} days)</span>
web/src/components/Charts.tsx:147:            Precision and recall by code <span className="text-faint">(FACTS.byCode, against seed/fixtures/answer_key.json)</span>
web/src/components/Charts.tsx:191:                      <td><Src id={`FACTS.byCode[${r.code}].planted`}>{r.planted}</Src></td>
web/src/components/Charts.tsx:192:                      <td><Src id={`FACTS.byCode[${r.code}].raised`}>{r.raised}</Src></td>
web/src/components/Charts.tsx:193:                      <td><Src id={`FACTS.byCode[${r.code}].truePositives`}>{r.truePositives}</Src></td>
web/src/components/Charts.tsx:194:                      <td><Src id={`FACTS.byCode[${r.code}].precision`}>{Math.round(r.precision * 100)}%</Src></td>
web/src/components/Charts.tsx:195:                      <td><Src id={`FACTS.byCode[${r.code}].recall`}>{Math.round(r.recall * 100)}%</Src></td>
web/src/components/TopBar.tsx:52:          <Pill tone="refused" title="The most recent investigated agent_task has source = none. Findings are scripted stand-ins until a model is back.">
web/src/components/Rules.tsx:26:    const copy = [...rules];
web/src/components/Rules.tsx:27:    copy.sort((a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9) || Number(b.id - a.id));
web/src/components/Rules.tsx:28:    return copy;
web/src/components/Rules.tsx:107:          from <Src id={`${id}.source_txn_ref, hold ${r.sourceTxnRef}`}>{r.sourceTxnRef}</Src>
web/src/index.css:55:/* Every number carries its source row id; the dotted rule hints at the hover. */
web/src/App.tsx:71:    return latest?.source === 'none';

 succeeded in 0ms:
    55	
    56	    # ---- fixture tables
    57	    dump(out / "terminals.json", [{"id": t[0], "name": t[2], "lat": t[3], "lon": t[4]} for t in company.terminals])
    58	    dump(out / "trucks.json", [{"id": t.id, "plate": t.plate, "tankGal": t.tankGal, "fuelCardId": t.fuelCardId, "terminalId": t.terminalId} for t in company.trucks])
    59	    dump(out / "drivers.json", [{"id": d.id, "name": d.name, "homeTerminal": d.homeTerminal, "truckId": d.truckId} for d in company.drivers])
    60	    ping_rows = [public(p, ["truckId", "day", "at", "lat", "lon", "odometer", "engineOn"]) for p in sim.pings]
    61	    ping_body = "[\n" + ",\n".join(json.dumps(r, sort_keys=True, separators=(",", ":")) for r in ping_rows) + "\n]\n"
    62	    for stale in ("trip_pings.json", "trip_pings.jsonl"):
    63	        (out / stale).unlink(missing_ok=True)
    64	    if len(ping_body) > PINGS_JSONL_THRESHOLD_BYTES:
    65	        (out / "trip_pings.jsonl").write_text("".join(json.dumps(r, sort_keys=True, separators=(",", ":")) + "\n" for r in ping_rows))
    66	    else:
    67	        (out / "trip_pings.json").write_text(ping_body)
    68	    card_keys = ["id", "cardId", "truckId", "driverId", "at", "day", "stationName", "stationLat", "stationLon", "gallons", "cents", "merchant"]
    69	    card_rows = [public(x, card_keys) for x in cards]
    70	    dump(out / "card_txns.json", card_rows, compact_rows=True)
    71	    toll_rows = [public(t, ["id", "plate", "truckId", "at", "day", "plazaId", "plazaName", "cents"]) for t in tolls]
    72	    dump(out / "toll_txns.json", toll_rows, compact_rows=True)
    73	    dump(out / "vendors.json", [{"id": v.id, "name": v.name, "bankLast4": v.bankLast4, "bankChangedDay": v.bankChangedDay} for v in company.vendors])
    74	    dump(out / "contracts.json", [{"id": c.id, "vendorId": c.vendorId, "item": c.item, "rateCents": c.rateCents, "validFromDay": c.validFromDay, "validToDay": c.validToDay, "clause": c.clause} for c in contracts])
    75	    dump(out / "pos.json", [{k: p[k] for k in ["id", "vendorId", "truckId", "item", "qty", "unitCents", "receivedQty", "issuedDay"]} for p in pos])
    76	    dump(out / "invoices.json", [{k: i[k] for k in ["id", "vendorId", "poId", "receivedDay", "item", "qty", "unitCents", "cents", "docRef"]} for i in invoices])
    77	    dump(out / "answer_key.json", key)
    78	
    79	    # ---- evidence
    80	    receipt_rows = [dict(r, _price=x["_price"]) for r, x in zip(card_rows, cards)]
    81	    po_hint = {}
    82	    for s in plan.swaps:
    83	        if s.own_truck == plant.DECOY1["card_truck"]:
    84	            po_hint[s.own_truck] = info["fixed_bank_po"]
    85	    render_all(out, company, receipt_rows, toll_rows, ping_rows, contracts, pos, invoices, plan.swaps, po_hint)
    86	
    87	    # ---- mirror: the kernel must flag exactly the key, nothing else
    88	    res = mirror.run(out)
    89	    mirror.compare_with_key(res, key)
    90	    max_day = max(res["day_auto_paid"].values())
    91	    assert max_day < MAX_DAY_AUTO_PAID_CENTS, f"heaviest day auto-pays {max_day} cents"
    92	    assert len(res["limits"]) < 15, res["limits"]
    93	
    94	    by_code: dict[str, int] = {}
    95	    for r in key:
    96	        by_code[r["code"]] = by_code.get(r["code"], 0) + (0 if r["expected"] == "clear_after_question" else 1)
    97	    day_total: dict[int, int] = {}
    98	    for rows in (card_rows, toll_rows):
    99	        for r in rows:
   100	            day_total[r["day"]] = day_total.get(r["day"], 0) + r["cents"]
   101	    for i in invoices:
   102	        day_total[i["receivedDay"]] = day_total.get(i["receivedDay"], 0) + i["cents"]
   103	    summary = {
   104	        "seed": seed,
   105	        "counts": {"terminals": len(company.terminals), "trucks": len(company.trucks), "drivers": len(company.drivers),
   106	                   "trip_pings": len(ping_rows), "card_txns": len(card_rows), "toll_txns": len(toll_rows),
   107	                   "vendors": len(company.vendors), "contracts": len(contracts), "pos": len(pos), "invoices": len(invoices),
   108	                   "answer_key_rows": len(key)},
   109	        "planted": dict(sorted(by_code.items())),
   110	        "decoys": sum(1 for r in key if r["expected"] == "clear_after_question"),
   111	        "limit_holds": len(res["limits"]),
   112	        "limit_hold_refs": res["limits"],
   113	        "dollars_per_day": {"posted_min": round(min(day_total.values()) / 100, 2), "posted_max": round(max(day_total.values()) / 100, 2),
   114	                            "auto_paid_min": round(min(res["day_auto_paid"].values()) / 100, 2),
   115	                            "auto_paid_max": round(max_day / 100, 2), "auto_pay_day_cap": 40000.0},
    80	        lines += ["", f"TOTAL DUE {_money(i['cents'])}", f"Remit to account ending {bank}", "Terms: net 15"]
    81	        if v.bankChangedDay and i["receivedDay"] >= v.bankChangedDay:
    82	            lines.append(f"NOTE: remit-to account updated on {cal.iso_date(v.bankChangedDay)}. Please update your records.")
    83	        (d / f"{i['id']}.txt").write_text("\n".join(lines) + "\n")
    84	
    85	
    86	def write_swap_log(out: Path, swaps, company: Company, po_hint: dict) -> None:
    87	    lines = ["DISPATCH LOG - UNIT SWAPS (San Antonio desk, all terminals)", f"{'date':<12}{'driver':<30}{'from':<6}{'to':<6}reason", ""]
    88	    rows = []
    89	    for s in swaps:
    90	        drv = company.driver(s.driver_id)
    91	        last, first = drv.name.split()[-1], drv.name.split()[0]
    92	        who = f"{last}, {first} (drv {s.driver_id})"
    93	        reason = s.reason.replace("_", " ")
    94	        po = po_hint.get(s.own_truck)
    95	        reason_txt = f"unit {s.own_truck} in shop: {reason}" + (f" ({po})" if po else "")
    96	        rows.append((s.d0, f"{cal.iso_date(s.d0):<12}{who:<30}{s.own_truck:<6}{s.relief_truck:<6}{reason_txt}; moved to unit {s.relief_truck} through {cal.iso_date(s.d1)}"))
    97	        back = min(cal.TOTAL_DAYS, s.d1 + 1)
    98	        rows.append((back, f"{cal.iso_date(back):<12}{who:<30}{s.relief_truck:<6}{s.own_truck:<6}unit {s.own_truck} back from shop; driver returns to own unit"))
    99	    rows.sort(key=lambda r: (r[0], r[1]))
   100	    lines += [r[1] for r in rows]
   101	    (out / "swap_log.txt").write_text("\n".join(lines) + "\n")
   102	
   103	
   104	def write_tolls(out: Path, tolls: list[dict]) -> None:
   105	    """One notice per toll charge, the way an authority statement line reads. Not in the contract's list,
   106	    but it gives the auto-rejected duplicates something a human can open."""
   107	    d = out / "tolls"
   108	    d.mkdir(parents=True, exist_ok=True)

exec
/bin/zsh -lc "nl -ba docs/RUNBOOK.md | sed -n '78,175p'" in /Users/anudeepbonagiri/dev/hackathons/dispatch-ledger
exec
/bin/zsh -lc "nl -ba spacetimedb/src/index.ts | sed -n '36,86p;505,545p;630,651p'" in /Users/anudeepbonagiri/dev/hackathons/dispatch-ledger
exec
/bin/zsh -lc "nl -ba worker/src/rules.ts | sed -n '205,265p'" in /Users/anudeepbonagiri/dev/hackathons/dispatch-ledger
 succeeded in 0ms:
    36	function roleOf(ctx: Ctx, who = ctx.sender): string {
    37	  if (who.isEqual(ctx.identity)) return 'database';
    38	  return ctx.db.role.identity.find(who)?.role ?? 'anonymous';
    39	}
    40	
    41	function currentDay(ctx: Ctx): number {
    42	  return ctx.db.businessDay.id.find(1)?.day ?? 0;
    43	}
    44	
    45	function audit(ctx: Ctx, action: string, ref: string, detail: string) {
    46	  ctx.db.auditEvent.insert({
    47	    id: 0n, at: ctx.timestamp, day: currentDay(ctx), actor: ctx.sender, actorRole: roleOf(ctx), action, ref, detail,
    48	  });
    49	}
    50	
    51	function checkRole(ctx: Ctx, ...allowed: string[]): Refusal {
    52	  const r = roleOf(ctx);
    53	  return allowed.includes(r) ? null : `${r} may not do this (needs ${allowed.join(' or ')})`;
    54	}
    55	
    56	// Reducer path: audit then throw (the audit row rolls back with the transaction; the message reaches the caller).
    57	function guard(ctx: Ctx, ref: string, refusal: Refusal, perform: () => void) {
    58	  if (refusal) {
    59	    audit(ctx, 'refused', ref, refusal);
    60	    throw new SenderError(refusal);
    61	  }
    62	  perform();
    63	}
    64	
    65	function refuse(ctx: Ctx, ref: string, why: string): never {
    66	  audit(ctx, 'refused', ref, why);
    67	  throw new SenderError(why);
    68	}
    69	
    70	function requireRole(ctx: Ctx, ref: string, ...allowed: string[]) {
    71	  const r = checkRole(ctx, ...allowed);
    72	  if (r) refuse(ctx, ref, r);
    73	}
    74	
    75	// Procedure path: the refusal is written in a committed transaction and returned, never thrown.
    76	type TxRunner = { withTx<R>(body: (tx: Ctx) => R): R };
    77	function attempt(ctx: TxRunner, ref: string, check: (tx: Ctx) => Refusal, perform: (tx: Ctx) => void) {
    78	  const result = ctx.withTx(tx => {
    79	    const r = check(tx);
    80	    if (r) { audit(tx, 'refused', ref, r); return r; }
    81	    perform(tx);
    82	    return null;
    83	  });
    84	  return result ? { ok: false, message: result } : { ok: true, message: 'ok' };
    85	}
    86	
   505	    n += 1;
   506	    refs.push(txnRef);
   507	    const h = ctx.db.hold.txnRef.find(txnRef);
   508	    if (h?.status === 'rejected') confirmed += 1;
   509	    else if (h && APPROVABLE.includes(h.status)) open += 1;
   510	  };
   511	  // rows still flagged with this code, plus holds that carry the code (their match_result may have changed)
   512	  const seen = new Set<string>();
   513	  for (const m of ctx.db.matchResult.code.filter(condition)) { seen.add(m.txnRef); consider(m.txnRef, m.day, m.evidenceJson); }
   514	  for (const h of ctx.db.hold.code.filter(condition)) {
   515	    if (seen.has(h.txnRef)) continue;
   516	    const m = ctx.db.matchResult.txnRef.find(h.txnRef);
   517	    if (m) consider(h.txnRef, h.day, m.evidenceJson);
   518	  }
   519	  return { n, wouldClear: n, openHoldsCovered: open, confirmedExceptionsCovered: confirmed, trueExceptionsCleared: confirmed,
   520	    window: { fromDay, toDay }, sampleRefs: refs.slice(0, 12), computedBy: 'module' };
   521	}
   522	
   523	export const createRule = spacetimedb.reducer(
   524	  { sourceTxnRef: t.string(), scopeJson: t.string(), condition: t.string(), backtestJson: t.string(), uses: t.string(), validFromDay: t.i32(), validToDay: t.i32(), reason: t.string() },
   525	  (ctx, { sourceTxnRef, scopeJson, condition, backtestJson, uses, validFromDay, validToDay, reason }) => {
   526	    requireRole(ctx, sourceTxnRef, 'agent');
   527	    if (!(RULE_CONDITIONS as readonly string[]).includes(condition)) refuse(ctx, sourceTxnRef, `rules may not target ${condition}`);
   528	    if (!['one_time', 'standing'].includes(uses)) refuse(ctx, sourceTxnRef, 'uses must be one_time or standing');
   529	    if (validToDay < validFromDay) refuse(ctx, sourceTxnRef, 'rule window is empty');
   530	    if (validToDay - validFromDay > 92) refuse(ctx, sourceTxnRef, 'rule window too long');
   531	    const scope = parseScope(scopeJson);
   532	    const scoped = scope.driverId !== undefined || (scope.truckIds && scope.truckIds.length > 0) || scope.cardId !== undefined || scope.vendorId !== undefined;
   533	    if (!scoped) refuse(ctx, sourceTxnRef, 'rule must be scoped to a driver, truck, card or vendor');
   534	    const bt = backtest(ctx, condition, scope, validFromDay, validToDay);
   535	    if (bt.trueExceptionsCleared > 0) refuse(ctx, sourceTxnRef, `rule would clear ${bt.trueExceptionsCleared} confirmed exception(s)`);
   536	    let preview: unknown = null;
   537	    try { preview = JSON.parse(backtestJson); } catch { preview = null; }
   538	    const inserted = ctx.db.rule.insert({
   539	      id: 0n, sourceTxnRef, scopeJson: JSON.stringify(scope), condition, action: 'clear', backtestJson: JSON.stringify({ ...bt, workerPreview: preview }),
   540	      status: 'candidate', uses, validFromDay, validToDay, createdBy: ctx.sender, approvedBy: undefined, reason, createdAt: ctx.timestamp,
   541	    });
   542	    audit(ctx, 'create_rule', String(inserted.id), `${condition} ${JSON.stringify(scope)} days ${validFromDay}-${validToDay}; backtest n=${bt.n} confirmed=${bt.confirmedExceptionsCovered}`);
   543	  }
   544	);
   545	
   630	function checkApprovePayment(ctx: Ctx, txnRef: string, callbackNote: string | undefined): Refusal {
   631	  const r = checkRole(ctx, 'controller'); if (r) return r;
   632	  const h = ctx.db.hold.txnRef.find(txnRef);
   633	  if (!h) return 'no such hold';
   634	  if (!APPROVABLE.includes(h.status)) return `hold is ${h.status}`;
   635	  if (h.requestedBy.isEqual(ctx.sender)) return 'requester cannot approve';
   636	  if (ctx.db.payment.txnRef.find(txnRef)) return 'already paid';
   637	  const needsNote = h.code === 'vendor_bank_change' || bankChangeActive(ctx, txnRef, h.cents);
   638	  if (needsNote && (!callbackNote || callbackNote.trim().length < 8)) return 'call-back note required for a bank change';
   639	  return textLimit(callbackNote, MAX_NOTE, 'call-back note');
   640	}
   641	function performApprovePayment(ctx: Ctx, txnRef: string, callbackNote: string | undefined) {
   642	  const h = ctx.db.hold.txnRef.find(txnRef)!;
   643	  ctx.db.hold.txnRef.update({ ...h, status: 'released', callbackNote, actor: ctx.sender, updatedAt: ctx.timestamp });
   644	  ctx.db.payment.insert({ txnRef, cents: h.cents, day: currentDay(ctx), releasedBy: ctx.sender, releasedRole: 'controller', at: ctx.timestamp });
   645	  audit(ctx, 'approve_payment', txnRef, callbackNote ?? '');
   646	}
   647	export const approvePayment = spacetimedb.reducer({ txnRef: t.string(), callbackNote: t.option(t.string()) }, (ctx, { txnRef, callbackNote }) =>
   648	  guard(ctx, txnRef, checkApprovePayment(ctx, txnRef, callbackNote), () => performApprovePayment(ctx, txnRef, callbackNote)));
   649	export const tryApprovePayment = spacetimedb.procedure({ txnRef: t.string(), callbackNote: t.option(t.string()) }, Outcome, (ctx, { txnRef, callbackNote }) =>
   650	  attempt(ctx, txnRef, tx => checkApprovePayment(tx, txnRef, callbackNote), tx => performApprovePayment(tx, txnRef, callbackNote)));
   651	

 succeeded in 0ms:
    78	### Moment one: hold 2231
    79	
    80	1. Step to day 41: type `step` in ASI:One, or run `scripts/clock.sh step` in A3. Point at the Queue: 2231 appears under `location_mismatch`. Click it; the Investigation panel fills with tool calls and the badge reads `replayed`.
    81	2. ASI:One, type each line and wait for the reply:
    82	
    83	| Type | Reply starts with |
    84	| --- | --- |
    85	| `what needs me` | `Needs you (n):` and a line `2231 ... location_mismatch day 41 Q: Did Ramon Ortiz drive truck 22 ...` |
    86	| `why 2231` | the finding, two `Evidence:` lines with their source, `Recommendation: hold_and_ask`, `Question:`, `source: replayed` |
    87	| `answer 2231 yes, Ortiz swapped to 22 that week, 17 was in the shop` | `answer_question 2231 written to audit_event by controller` and `The worker will draft a rule ...` |
    88	| `rules` | `#<n>  candidate  location_mismatch  scope {"driverId":23}  one_time  days 41-46  from 2231  would have cleared X of Y past rows; 0 were true exceptions` |
    89	| `approve rule <n>` | `approve_rule <n> written to audit_event by controller` |
    90	
    91	3. Use the explicit `answer 2231 ...` form at the table. Bare free text lands on the last hold discussed, and with `ASI_ONE_API_KEY` set the model picks the hold from all waiting questions. Keep these words out of the answer: `no`, `never`, `not ours`, `did not`, `fraud`, `reject` (the drafter treats it as a confirmed exception and drafts nothing), and `always`, `every`, `standing` (it drafts a 30-day standing rule).
    92	4. Read `<n>` off the `rules` reply. The video says rule 1; that holds only on a fresh publish, because the id keeps counting after a reset.
    93	5. Point at the dashboard: 2231 moves to the resolved section as `cleared_by_rule`; the Ledger of trust shows `approve_rule` then `cleared_by_rule 2231 rule <n>`. The Rules panel shows the rule as `expired` at once, because it was one-time and 2231 consumed it. Say that before anyone asks.
    94	6. The payment table is not on the dashboard. To show the payment written with role `rule`, run in B1:
    95	
    96	```
    97	curl -s -X POST http://127.0.0.1:3100/v1/database/dispatch-ledger/sql -d "SELECT txn_ref, cents, released_role FROM payment WHERE txn_ref = '2231'"
    98	```
    99	
   100	Fallback, same commands, B1:
   101	
   102	```
   103	python3 -m agent.cli "what needs me"
   104	python3 -m agent.cli "why 2231"
   105	python3 -m agent.cli "answer 2231 yes, Ortiz swapped to 22 that week, 17 was in the shop"
   106	python3 -m agent.cli "rules"
   107	python3 -m agent.cli "approve rule <n>"
   108	```
   109	
   110	### Moment two: INV-1077, the bank change
   111	
   112	1. Step three times to day 44 (`step` in ASI:One, or `scripts/clock.sh step` in A3). INV-1077 arrives on day 44; Gulf Coast Diesel's bank change is on day 42. Wait for the A2 line with `INV-1077 investigate -> hold (replayed, replayed)`.
   113	2. ASI:One:
   114	
   115	| Type | Reply starts with |
   116	| --- | --- |
   117	| `why INV-1077` | the finding, `Question: Call Gulf Coast Diesel on the number on file ...`, `source: replayed` |
   118	| `approve INV-1077` | `Refused: call-back note required for a bank change` |
   119	| (now run section 5 in A3) | |
   120	| `approve INV-1077 spoke to Gulf Coast Diesel on the number on file, confirmed by M. Reyes` | `approve_payment INV-1077 written to audit_event by controller` |
   121	
   122	3. Point at the Ledger of trust: a red `refused` row, actor `controller`, ref `INV-1077`, detail `call-back note required for a bank change`; later the `approve_payment` row with the note as its detail. In the Queue, INV-1077 moves to resolved as `released`.
   123	
   124	Fallback, B1:
   125	
   126	```
   127	python3 -m agent.cli "why INV-1077"
   128	python3 -m agent.cli "approve INV-1077"
   129	python3 -m agent.cli "approve INV-1077 spoke to Gulf Coast Diesel on the number on file, confirmed by M. Reyes"
   130	```
   131	
   132	## 5. Segregation of duties, live
   133	
   134	```
   135	scripts/as_agent.sh approve INV-1077
   136	```
   137	
   138	It prints the raw procedure body, `[false,"agent may not do this (needs controller)"]`, then `audit trail (last refusal):` and a row with `refused`, `agent`, `INV-1077`. Point at the dashboard: the newest row in the Ledger of trust, red background, actor pill `agent`, action `refused`. The script's "last refusal" line takes the last row the SQL returns, which is not ordered by id; after several judges it may print an older refusal, so point at the dashboard row.
   139	
   140	A second proof comes free with section 6: the controller who injects a hold is its requester, so `python3 -m agent.cli "approve <id>"` answers `Refused: requester cannot approve`.
   141	
   142	## 6. The judge's own scenario
   143	
   144	`scripts/inject.py` lands one fuel purchase on the current business day at a UTC time and runs the same kernel. The kernel uses the truck's nearest ping within 30 minutes; pings are hourly. The examples use truck 29 (100 gallon tank, so the limit is 110.0 gallons), parked at the San Antonio terminal all of day 41 and all of day 44. Pass `--driver 30`: the script's default (driver id = truck id) does not match the seed, where driver 30 drives truck 29.
   145	
   146	Clean fuel-up at the pump:
   147	
   148	```
   149	python3 scripts/inject.py --truck 29 --driver 30 --gallons 80 --lat 29.4241 --lon -98.4936 --time 18:00
   150	```
   151	
   152	Expect `kernel verdict: matched`, `distanceMiles` near 0, `thresholdMiles: 25`. Dashboard: the Ledger of trust shows `inject` then `auto_pay`; the auto-paid counter goes up by one. If it says `limit` with `limitReason: daily_cap`, the day's auto-pay cap was already reached. That is a policy hold and correct.
   153	
   154	A far-away purchase:
   155	
   156	```
   157	python3 scripts/inject.py --truck 29 --driver 30 --gallons 80 --station "Love's 412, Schulenburg TX" --time 18:00
   158	```
   159	
   160	Expect `kernel verdict: location_mismatch` with `distanceMiles` far above `thresholdMiles: 25`. Dashboard: a new hold under `location_mismatch` in the Queue; within a second the card's badge reads `scripted stand-in, not a model` (only 2231 and INV-1077 have recorded findings), and the `model offline` pill may appear. Both are the labels working.
   161	
   162	A tank overfill:
   163	
   164	```
   165	python3 scripts/inject.py --truck 29 --driver 30 --gallons 150 --lat 29.4241 --lon -98.4936 --time 18:00
   166	```
   167	
   168	Expect `kernel verdict: capacity_exceeded` and `capacityLimitGal: 110.0`. Capacity is checked before location. The stand-in recommends hold and asks nothing; no rule may ever clear this code.
   169	
   170	For another truck or day, read its pings from the fixture (day, then truck):
   171	
   172	```
   173	python3 -I -c "import json,sys;d,t=int(sys.argv[1]),int(sys.argv[2]);[print(p['at'],p['lat'],p['lon'],p['engineOn']) for p in json.load(open('seed/fixtures/trip_pings.json')) if p['day']==d and p['truckId']==t]" 44 29
   174	```
   175	

 succeeded in 0ms:
   205	function counts(bt: Backtest): string {
   206	  return `n=${bt.n}, wouldClear=${bt.wouldClear}, openHoldsCovered=${bt.openHoldsCovered}, confirmedExceptionsCovered=${bt.confirmedExceptionsCovered}, trueExceptionsCleared=${bt.trueExceptionsCleared}, window days ${bt.window.fromDay} to ${bt.window.toDay}`;
   207	}
   208	
   209	export async function handleDraftRule(brief: Brief, deps: RuleTaskDeps): Promise<RuleTaskResult> {
   210	  const log = deps.log ?? (() => {});
   211	  const steps: Step[] = [];
   212	  const note = (text: string) => steps.push({ type: 'note', at: nowIso(), text });
   213	  const base = { evidence: kernelEvidence(brief), confidence: 1, status: 'ok' as const, model: 'rules' };
   214	  const finish = (recommendation: 'hold' | 'done', finding: Finding & { rule?: RuleDraft; backtest?: Backtest }, question?: string): RuleTaskResult => ({
   215	    recommendation,
   216	    finding: RuleFindingSchema.parse(finding),
   217	    steps,
   218	    ...(question ? { question } : {}),
   219	    source: 'none',
   220	  });
   221	
   222	  const decision = decideDraft(brief);
   223	  note(`draft_rule for ${brief.txnRef} (${brief.code}): decision ${decision.kind}`);
   224	  switch (decision.kind) {
   225	    case 'negative':
   226	      return finish('hold', { ...base, finding: 'Controller confirmed the exception; recommend reject', recommendation: 'hold' });
   227	    case 'forbidden':
   228	      return finish('hold', { ...base, finding: `Rules may never clear ${brief.code}. Controller answer noted: "${summarize(brief.answer)}". The payment needs a direct approve or reject.`, recommendation: 'hold' });
   229	    case 'no_rule':
   230	      return finish('done', { ...base, finding: `No rule drafted: ${decision.why}. Controller answer: "${summarize(brief.answer)}".`, recommendation: 'hold' });
   231	    case 'no_scope':
   232	      return finish('hold', { ...base, finding: `No rule drafted: ${decision.why}. Controller answer: "${summarize(brief.answer)}".`, recommendation: 'hold' });
   233	    case 'draft':
   234	      break;
   235	  }
   236	
   237	  let rule = decision.rule;
   238	  const ask = deps.ask ?? (deps.anthropicApiKey ? (p: string) => askRuleModel(deps.anthropicApiKey!, p) : undefined);
   239	  if (ask) {
   240	    rule = await refineWithModel(rule, brief, ask, log);
   241	    note(`window checked with ${RULE_MODEL}: uses ${rule.uses}, days ${rule.validFromDay} to ${rule.validToDay}`);
   242	  }
   243	
   244	  const bt = backtest(rule, deps.matchResults(), deps.holdStatus);
   245	  note(`backtest from match_result and hold: ${counts(bt)}`);
   246	  if (bt.trueExceptionsCleared > 0) {
   247	    return finish('hold', {
   248	      ...base,
   249	      finding: `Rule not drafted: it would clear ${bt.trueExceptionsCleared} confirmed exception(s). Backtest ${counts(bt)}.`,
   250	      recommendation: 'hold',
   251	      rule,
   252	      backtest: bt,
   253	    });
   254	  }
   255	
   256	  try {
   257	    await deps.createRule({
   258	      sourceTxnRef: brief.txnRef,
   259	      scopeJson: JSON.stringify(rule.scope),
   260	      condition: rule.condition,
   261	      backtestJson: JSON.stringify(bt),
   262	      uses: rule.uses,
   263	      validFromDay: rule.validFromDay,
   264	      validToDay: rule.validToDay,
   265	      reason: rule.reason,

exec
/bin/zsh -lc "ls -l web/public/FACTS.json docs/FACTS.json seed/fixtures/investigations; sed -n '1,30p' seed/fixtures/investigations/2231.json; sed -n '1,30p' seed/fixtures/investigations/INV-1077.json" in /Users/anudeepbonagiri/dev/hackathons/dispatch-ledger
 succeeded in 0ms:
-rw-r--r--  1 anudeepbonagiri  staff  23020 Oct 24 11:38 docs/FACTS.json
-rw-r--r--  1 anudeepbonagiri  staff  23020 Oct 24 11:38 web/public/FACTS.json

seed/fixtures/investigations:
total 32
-rw-r--r--  1 anudeepbonagiri  staff  4201 Oct 24 11:37 2231.json
-rw-r--r--  1 anudeepbonagiri  staff  4507 Oct 24 11:37 INV-1077.json
{
  "recorded": true,
  "note": "RECORDED investigation for the story case, hand-written in the shape WORKER_MODE=record emits (no live Droid run produced it). Replayed verbatim by the worker in replay mode and labelled status 'replayed', source 'replayed'. Nothing here is produced at demo time by a model.",
  "finding": {
    "finding": "The card assigned to truck 17 was used at Love's 412 in Schulenburg while truck 17's nearest ping was 97.2 miles away at the San Antonio yard and truck 22 was 41 m from the pump four minutes earlier. The dispatcher swap log shows Ramon Ortiz moved to unit 22 on 2026-08-26 because unit 17 was in the shop for a brake job, so the fuel went into a company truck driven by the card's driver.",
    "evidence": [
      {
        "source": "find_trips_near",
        "ref": "truck 22 @ 2026-08-26T12:42:59Z",
        "quote": "{\"truck_id\":\"22\",\"at\":\"2026-08-26T12:42:59Z\",\"dist_m\":41}"
      },
      {
        "source": "swap_log.txt",
        "ref": "line 8",
        "quote": "unit 17 in shop: brake job (PO-1026); moved to unit 22 through 2026-08-31"
      },
      {
        "source": "kernel",
        "ref": "evidence.distanceMiles",
        "quote": "97.2 miles from the nearest ping of truck 17, threshold 25"
      }
    ],
    "recommendation": "hold_and_ask",
    "question_for_controller": "Did Ramon Ortiz drive truck 22 on 2026-08-26 while truck 17 was in the shop?",
    "confidence": 0.86,
    "status": "ok",
    "model": "droid",
    "durationMs": 23810,
    "tokenUsage": {
      "input": 18422,
{
  "recorded": true,
  "note": "RECORDED investigation for moment two (vendor bank change), hand-written in the shape WORKER_MODE=record emits (no live Droid run produced it). Replayed verbatim by the worker in replay mode and labelled status 'replayed', source 'replayed'. Nothing here is produced at demo time by a model.",
  "finding": {
    "finding": "Invoice INV-1077 from Gulf Coast Diesel bills $9,800.00 for a brake job on unit 17 against PO-1026 at the contract rate, and the quantity matches receiving. The invoice itself says the remit-to account was updated on 2026-08-27, two business days before it arrived, which is inside the 7 day window, so the invoice is clean but the payee is not yet confirmed.",
    "evidence": [
      {
        "source": "invoices/INV-1077.txt",
        "ref": "line 7",
        "quote": "Brake job (per axle)                     qty   4 x  $2,450.00 =   $9,800.00"
      },
      {
        "source": "invoices/INV-1077.txt",
        "ref": "line 12",
        "quote": "NOTE: remit-to account updated on 2026-08-27. Please update your records."
      },
      {
        "source": "contract_rate_for_vendor",
        "ref": "vendor 3 brake_job on day 44",
        "quote": "{\"rate_cents\":245000,\"clause\":\"Rate covers pads, drums or rotors, hardware and labor for one axle, with wheel-end inspection included.\",\"contract_id\":\"17\"}"
      },
      {
        "source": "kernel",
        "ref": "evidence.daysSinceChange",
        "quote": "bank account changed on day 42, invoice received day 44, threshold 7 days"
      }
    ],
    "recommendation": "hold",
    "question_for_controller": "Call Gulf Coast Diesel on the number on file, not the one on the invoice, and record who confirmed the new account before releasing $9,800.00.",
    "confidence": 0.91,

codex
## 1. Claims to correct

- [README.md](/Users/anudeepbonagiri/dev/hackathons/dispatch-ledger/README.md:5): “investigates each hold with Factory’s Droid over Elastic Agent Builder tools” and “asks the fleet controller one question through ASI:One … and turns the answer into a scoped, backtested rule.” **Accurate:** In the measured offline run, 45 investigations were scripted stand-ins and two were hand-written replay fixtures; no live model produced a finding. Only applicable holds receive questions or rules. The [Devpost “What it does” paragraph](/Users/anudeepbonagiri/dev/hackathons/dispatch-ledger/docs/DEVPOST.md:15) needs the same qualification.
- [README.md](/Users/anudeepbonagiri/dev/hackathons/dispatch-ledger/README.md:34): “`find_trips_near` over MCP: truck 22 at the pump…” **Accurate:** The hand-written 2231 replay fixture contains a simulated `find_trips_near` result; this run did not call Elastic.
- [README.md](/Users/anudeepbonagiri/dev/hackathons/dispatch-ledger/README.md:38): “Controller approves the rule in ASI:One…” **Accurate:** The measured 92-day run used `controller_sim.py` to approve it; the runbook proposes an ASI:One table demo.
- [README.md](/Users/anudeepbonagiri/dev/hackathons/dispatch-ledger/README.md:42): “All numbers below are written by `scripts/facts.py` … nothing is typed by hand.” **Accurate:** `facts.py` writes FACTS and RESULTS; the README table is a manually copied snapshot of those outputs.
- [README.md](/Users/anudeepbonagiri/dev/hackathons/dispatch-ledger/README.md:20): “Every action, and every refusal, is an `audit_event` row…” **Accurate:** Successful actions and refusals through `try_*` procedures persist; refusals thrown by reducers roll back their audit row. [FACTS.md](/Users/anudeepbonagiri/dev/hackathons/dispatch-ledger/docs/FACTS.md:20) records **zero** refusals in the measured run. The [Devpost accomplishment](/Users/anudeepbonagiri/dev/hackathons/dispatch-ledger/docs/DEVPOST.md:27) should say the agent-approval refusal is supported by a separate procedure test/demo, not by `docs/FACTS.json`.
- [README.md](/Users/anudeepbonagiri/dev/hackathons/dispatch-ledger/README.md:71): “replays recorded findings offline.” **Accurate:** Two hand-written fixtures replay; other investigations use a deterministic stand-in.
- [README.md](/Users/anudeepbonagiri/dev/hackathons/dispatch-ledger/README.md:87): “Indices … on a Serverless project; two Agent Builder ES|QL tools … exposed to Droid over MCP.” **Accurate:** The integration is configured in code, but [CLAIMS_AUDIT.md](/Users/anudeepbonagiri/dev/hackathons/dispatch-ledger/context/CLAIMS_AUDIT.md:22) says a working Serverless endpoint is unverified.
- [Devpost.md](/Users/anudeepbonagiri/dev/hackathons/dispatch-ledger/docs/DEVPOST.md:19): “A Python uAgent on Agentverse as the controller’s seat.” **Accurate:** A local mailbox uAgent is implemented; Agentverse registration/discoverability was still pending in the claims audit.

## 2. Answer-key path

[controller_sim.py](/Users/anudeepbonagiri/dev/hackathons/dispatch-ledger/scripts/controller_sim.py:25) does **not** read `answer_key.json`; it reads public tables and `swap_log.txt`. The blanket “only `facts.py` reads the key” claim is false: [seed/mirror.py](/Users/anudeepbonagiri/dev/hackathons/dispatch-ledger/seed/mirror.py:176) reads the JSON when run directly, and seed tests read it too. Neither is invoked by `demo_up.sh` or `full_run.sh`. The controller run nevertheless uses generator-derived swap-log evidence that identifies the six legitimate swaps, so that part of the scripted evaluation is not blind.

## 3. Judging-table failure

The runbook requires `AGENT_SEED` and then starts `agent/agent.py` manually after `demo_up.sh`. But [demo_up.sh](/Users/anudeepbonagiri/dev/hackathons/dispatch-ledger/scripts/demo_up.sh:66) already starts it when that seed and the virtual environment exist. The second uAgent is likely to fail binding the same port, disrupting the ASI:One seat. **One-line fix:** delete line 68 of `demo_up.sh` (its background `agent.py` launch), leaving the runbook’s manual start as the sole launch.
tokens used
70,451
## 1. Claims to correct

- [README.md](/Users/anudeepbonagiri/dev/hackathons/dispatch-ledger/README.md:5): “investigates each hold with Factory’s Droid over Elastic Agent Builder tools” and “asks the fleet controller one question through ASI:One … and turns the answer into a scoped, backtested rule.” **Accurate:** In the measured offline run, 45 investigations were scripted stand-ins and two were hand-written replay fixtures; no live model produced a finding. Only applicable holds receive questions or rules. The [Devpost “What it does” paragraph](/Users/anudeepbonagiri/dev/hackathons/dispatch-ledger/docs/DEVPOST.md:15) needs the same qualification.
- [README.md](/Users/anudeepbonagiri/dev/hackathons/dispatch-ledger/README.md:34): “`find_trips_near` over MCP: truck 22 at the pump…” **Accurate:** The hand-written 2231 replay fixture contains a simulated `find_trips_near` result; this run did not call Elastic.
- [README.md](/Users/anudeepbonagiri/dev/hackathons/dispatch-ledger/README.md:38): “Controller approves the rule in ASI:One…” **Accurate:** The measured 92-day run used `controller_sim.py` to approve it; the runbook proposes an ASI:One table demo.
- [README.md](/Users/anudeepbonagiri/dev/hackathons/dispatch-ledger/README.md:42): “All numbers below are written by `scripts/facts.py` … nothing is typed by hand.” **Accurate:** `facts.py` writes FACTS and RESULTS; the README table is a manually copied snapshot of those outputs.
- [README.md](/Users/anudeepbonagiri/dev/hackathons/dispatch-ledger/README.md:20): “Every action, and every refusal, is an `audit_event` row…” **Accurate:** Successful actions and refusals through `try_*` procedures persist; refusals thrown by reducers roll back their audit row. [FACTS.md](/Users/anudeepbonagiri/dev/hackathons/dispatch-ledger/docs/FACTS.md:20) records **zero** refusals in the measured run. The [Devpost accomplishment](/Users/anudeepbonagiri/dev/hackathons/dispatch-ledger/docs/DEVPOST.md:27) should say the agent-approval refusal is supported by a separate procedure test/demo, not by `docs/FACTS.json`.
- [README.md](/Users/anudeepbonagiri/dev/hackathons/dispatch-ledger/README.md:71): “replays recorded findings offline.” **Accurate:** Two hand-written fixtures replay; other investigations use a deterministic stand-in.
- [README.md](/Users/anudeepbonagiri/dev/hackathons/dispatch-ledger/README.md:87): “Indices … on a Serverless project; two Agent Builder ES|QL tools … exposed to Droid over MCP.” **Accurate:** The integration is configured in code, but [CLAIMS_AUDIT.md](/Users/anudeepbonagiri/dev/hackathons/dispatch-ledger/context/CLAIMS_AUDIT.md:22) says a working Serverless endpoint is unverified.
- [Devpost.md](/Users/anudeepbonagiri/dev/hackathons/dispatch-ledger/docs/DEVPOST.md:19): “A Python uAgent on Agentverse as the controller’s seat.” **Accurate:** A local mailbox uAgent is implemented; Agentverse registration/discoverability was still pending in the claims audit.

## 2. Answer-key path

[controller_sim.py](/Users/anudeepbonagiri/dev/hackathons/dispatch-ledger/scripts/controller_sim.py:25) does **not** read `answer_key.json`; it reads public tables and `swap_log.txt`. The blanket “only `facts.py` reads the key” claim is false: [seed/mirror.py](/Users/anudeepbonagiri/dev/hackathons/dispatch-ledger/seed/mirror.py:176) reads the JSON when run directly, and seed tests read it too. Neither is invoked by `demo_up.sh` or `full_run.sh`. The controller run nevertheless uses generator-derived swap-log evidence that identifies the six legitimate swaps, so that part of the scripted evaluation is not blind.

## 3. Judging-table failure

The runbook requires `AGENT_SEED` and then starts `agent/agent.py` manually after `demo_up.sh`. But [demo_up.sh](/Users/anudeepbonagiri/dev/hackathons/dispatch-ledger/scripts/demo_up.sh:66) already starts it when that seed and the virtual environment exist. The second uAgent is likely to fail binding the same port, disrupting the ASI:One seat. **One-line fix:** delete line 68 of `demo_up.sh` (its background `agent.py` launch), leaving the runbook’s manual start as the sole launch.
