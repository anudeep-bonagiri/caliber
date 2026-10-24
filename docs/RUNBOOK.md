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
