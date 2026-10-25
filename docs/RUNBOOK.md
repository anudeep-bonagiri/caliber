# Judging-table runbook

Written 2026-10-24 from the scripts and components on disk. Nothing below was run for this document, because a live demo database was in use. Every expected line is read from the code that prints it.

Say it in the first ten seconds: simulated carrier, sandbox money, a published answer key.

**The one rule: if a live step shows nothing within five seconds, move to Terminal B, run the fallback, and keep talking. Never debug live.**

`scripts/demo_up.sh` runs before the judge sits down (two to three minutes; the fixture load is the long step), then B1: `(cd scripts && npx tsx run_days.ts --until 41)` (it prints `day 0 -> 41` and `done: 41 days in N s`), so holds 2231 and INV-1075 are open on day 41: the opening refusal needs 2231 to exist. The beat table starts at the first word: one line on the customer view at "/", then the console at /console, in the order the council set (Task 28): the investigator is refused, the controller approves and the payment settles, then the hold-to-rule story. Terminal A is live; Terminal B is the fallback (section 2). ASI:One lines are typed on the second laptop; `A3` lines run in Terminal A.

## 1. The beats

| Time | Say | Command | What appears | Fallback (Terminal B, after five seconds) |
| --- | --- | --- | --- | --- |
| 00:00 | "This is the controller's morning: one hold, written as a sentence, the question it needs answered, and where to answer it." Then switch to the console for the rest. | Browser: http://127.0.0.1:5173/ (the customer view, Task 29; if it is not merged, open /console directly), then http://127.0.0.1:5173/console | Today screen: the hold card for 2231 written as a sentence (truck 22 at the pump), the question, a mini-map, and `Answer in ASI:One`. Then the console: the dashboard every later beat points at. | Open /console directly and skip the line. |
| 00:05 | "Caliber is an accounts-payable clerk for a simulated trucking carrier. Sandbox money, and the answer key is published. The first forty business days ran before you sat down; we are on day 41." | A3: `scripts/clock.sh status` | Terminal: `{'id': 1, 'day': 41, 'date': '2026-08-26', 'paused': True, 'tick_micros': ...}`. Dashboard: top bar pill `connected` plus eight hex characters; Day clock `Day 41 of 92, Wed Aug 26` with the `paused` pill; Queue: `2231` under `LOCATION MISMATCH`. | `python3 -m agent.cli "status"` answers `investigator: Day 41 of 92 (2026-08-26), clock paused, ...`. If that says `ledger unreachable`, see section 5. |
| 00:10 | "Two agents sit in the controller's chat. This one is the investigator: it can read the whole ledger. I ask it to pay." | ASI:One, `@caliber-investigator` chat: `approve 2231` | Reply `investigator: refused by the ledger: reader may not do this (needs controller)` (`agent/investigate.py` forwards the write with the reader token; the message is the reducer's). Ledger of trust: newest row red, action `refused`, actor pill `reader`, ref `2231`. | A3: `scripts/as_agent.sh approve 2231`: the worker's `agent` identity hits the same role check, `agent may not do this (needs controller)`, and the same red row with actor `agent`. Say "the other identity that is not the controller, same reducer". |
| 00:25 | "The controller's seat can. A clean repair invoice, held only because it is over the auto-pay limit. One reducer checks the role and segregation of duties, writes the payment, and settlement posts it to the bank." | ASI:One, `@caliber-controller` chat: `approve INV-1075` | Reply `approve_payment INV-1075 written to audit_event by controller (event <n>, day 41)`. Ledger of trust: `approve_payment` ref `INV-1075`, then `settle` ref `INV-1075`. At this table the worker runs in replay, so the settle detail reads `paid, settlement: offline (offline-INV-1075)` and the Queue `resolved` row reads `settlement: offline`; say "offline id, no bank called", never "live". With settlement live (the recording staging in `docs/video/moment-script.md`) it reads `paid, bank id <id>`. If the reply is `not authorised for this seat`, see section 5. | `python3 -m agent.cli "approve INV-1075"` (the terminal twin holds the controller token and is not behind the ASI:One allowlist) |
| 00:40 | "Now the story. Hold 2231: a fuel card for one truck bought fuel far from where that truck's own telematics put it. Nothing paid. The kernel held it in plain code and opened a task." | Click `2231` in the Queue under `LOCATION MISMATCH` | Investigation of 2231: badge `replayed`, task pill `investigated`, the brief with `distance vs threshold` and `nearest ping`, steps `tool call find_trips_near` and `tool call Grep`, the finding, `recommends hold and ask`, and the recorded question (read it off the card; it asks whether Ramon Ortiz or the San Antonio dispatcher can confirm that Ortiz used FC-1017 to fuel truck 22 while truck 17 was in the shop). | `python3 -m agent.cli "why 2231"` prints the same finding with `source: replayed`. |
| 00:55 | "The controller's seat is a chat. Two agents sit in it: the controller, which can approve, and the investigator, which can only explain. I ask what needs me." | ASI:One: `what needs me` (the controller's own reply, no prefix; `why` and `status` are the investigator's) | Reply starts `Needs you (n):` and has a line `2231  ...  location_mismatch  day 41  Q: Can Ramon Ortiz or the San Antonio dispatcher confirm that Ortiz used FC-1017 to fuel truck 22 for transaction 2231 while truck 17 was in the shop under PO-1026?` (the recorded question; the CLI may cut the line short, read it off the card) | `python3 -m agent.cli "what needs me"` |
| 01:05 | "Why? The controller hands that to the investigator agent, a separate identity the database will not let pay. It asked Elastic which trucks pinged near that pump, then read the dispatcher's swap log." | ASI:One: `why 2231` | Reply starts `asked @caliber-investigator agent1q..., <n> s` (the hop), then `investigator:` and the hold line, `Finding: ...`, two `Evidence:` lines with their source, `Recommendation: hold_and_ask (confidence ...)`, `Question: ` followed by the recorded question (read it off the card), `source: replayed`. If it starts `investigator did not answer in time; from the ledger directly:` the controller answered after 8 s; same rows, say so. | `python3 -m agent.cli "why 2231"` (same `investigator:` prefix, from the reader identity) |
| 01:20 | "My answer is not a payment. It becomes a draft rule." | ASI:One: `answer 2231 yes, Ramon Ortiz drove relief unit 22 that week while unit 17 was in the shop` | Reply: `answer_question 2231 written to audit_event by controller (...)` and `The worker will draft a rule from this answer; check rules shortly.` Ledger of trust: `answer_question` row. Rules panel: a new row with the pill `candidate, waiting for the controller`. | `python3 -m agent.cli "answer 2231 yes, Ramon Ortiz drove relief unit 22 that week while unit 17 was in the shop"` |
| 01:35 | "One driver, a few days, one use. The database backtested it before it would store it." | ASI:One: `rules` | Reply line `#<n>  candidate  location_mismatch  scope {"driverId":23}  one_time  days 41-46  from 2231  would have cleared X of Y past rows; 0 were true exceptions`. Read `<n>` here. Rules panel row: `location mismatch on driver 23`, `days 41 to 46`, `Would have cleared X past rows; 0 were confirmed exceptions`. | `python3 -m agent.cli "rules"` |
| 01:50 | "I approve the rule, not the payment." | ASI:One: `approve rule <n>` | Reply: `approve_rule <n> written to audit_event by controller (...)`. | `python3 -m agent.cli "approve rule <n>"` |
| 02:00 | "The kernel re-ran the same code with the rule in place. The payment is written by the rule, not by anyone's opinion. The rule is used up." | none; point | Ledger of trust, newest first: `cleared_by_rule` ref `2231` detail `rule <n>`, under it `approve_rule` ref `<n>`. Investigation of 2231: `Paid: ... on day 41, released by rule`. Queue: 2231 leaves the group; open `resolved` to see it with pills `cleared by rule` and `by rule`. Rules panel: the row shows `one time` and `used`. | `curl -s -X POST http://127.0.0.1:3100/v1/database/dispatch-ledger/sql -d "SELECT txn_ref, cents, released_role FROM payment WHERE txn_ref = '2231'"` shows `rule` in the last column. |
| 02:20 | "A third identity: the worker that runs Droid holds `agent`. It asks to approve an invoice. The database says no and writes that down with its role on it." | A3: `scripts/as_agent.sh approve INV-1077` | Terminal: the procedure answer with `false` and `agent may not do this (needs controller)`, then `audit trail (last refusal):` and `['refused', 'agent', 'INV-1077', 'agent may not do this (needs controller)']`. Ledger of trust: newest row has a red background, actor pill `agent`, action `refused`, ref `INV-1077`. The role check runs first, so this works before INV-1077 exists. | Open `spacetimedb/src/index.ts` at `checkApprovePayment` in B2: the first line is the role check. |
| 02:40 | "Now a vendor invoice. The vendor changed its bank account days before it arrived. The vendor check ran against CRS: business credit, public records, OFAC, on the business only. Today the vendor check is a hand-authored fixture, sandbox pending; the card says FIXTURE, and it will say REPLAYED the day the sandbox call is recorded." | A3: `scripts/clock.sh step` three times, to day 44 | `advanced one day` three times; Day clock `Day 44 of 92, Mon Aug 31`. Queue: `INV-1077` under `VENDOR BANK CHANGE`. A2: `task <id> INV-1077 investigate -> hold (replayed, replayed) ...`. Investigation panel: Vendor check block with the amber `FIXTURE` chip (hover: "hand-authored fixture; CRS sandbox pending; no CRS call produced these values"), three rows each sourced `fixture:hand-authored (CRS sandbox pending)`, "recommends approve". Never say "live" for this block. | `python3 -m agent.cli "step"` three times. |
| 02:55 | "The controller tries to release it with no note." | ASI:One: `approve INV-1077` | Reply: `Refused: call-back note required for a bank change`. Ledger of trust: red `refused` row, actor `controller`, ref `INV-1077`, same detail. | `python3 -m agent.cli "approve INV-1077"` |
| 03:05 | "No call-back note, no payment. With the note, it goes. Earlier in the month the same check came back with a judgment on another vendor's bank change, and the controller rejected that invoice; that fixture is hand-authored too, sandbox pending." | ASI:One: `approve INV-1077 called Gulf Coast Diesel on the number on file, new account confirmed by the AR desk` | Reply: `approve_payment INV-1077 written to audit_event by controller (...)`. Ledger of trust: `approve_payment` row with the note as detail; the `released by controller` counter goes up by one. Investigation of INV-1077: `Paid: ... on day 44, released by controller`, and the call-back note. Queue `resolved`: pills `released`, `by controller`. If asked about the hit: Queue `resolved`, `INV-1032` (Alamo Fleet Service, day 19), `rejected`, reason starts `Vendor check hit: a judgment (Example County Civil Court ...`; its Vendor check block carries the same `FIXTURE` chip. | `python3 -m agent.cli "approve INV-1077 called Gulf Coast Diesel on the number on file, new account confirmed by the AR desk"` |
| 03:20 | "Your turn. Truck 29 is parked at the San Antonio terminal all day. A clean fill at the terminal pump." | A3: `python3 scripts/inject.py --truck 29 --driver 30 --gallons 80 --lat 29.42419 --lon -98.49379 --time 18:00` | Terminal: `injected <id>: truck 29, 80.0 gal, $279.20 at Judge scenario station on day 44 (2026-08-31 18:00Z)`, `kernel verdict: matched`, `distanceMiles: 0`, `thresholdMiles: 25`. Ledger of trust: `inject` then `auto_pay`; `auto-paid today` goes up by one. | Same line in B1. A verdict of `limit` with `limitReason: daily_cap` means the day's auto-pay cap was reached: a policy hold, and correct. |
| 03:40 | "Same truck, same hour, a purchase in Luling." | A3: `python3 scripts/inject.py --truck 29 --driver 30 --gallons 80 --station "Pilot 1126, Luling TX" --time 18:00` | Terminal: `kernel verdict: location_mismatch`, `distanceMiles: 53.9`, `thresholdMiles: 25`. Queue: a new hold under `LOCATION MISMATCH`. Click it; Investigation: badge `scripted stand-in, not a model` (only 2231 and INV-1077 have recorded findings); the `model offline` pill may appear. Both are the labels working. | Same line in B1. Then `python3 -m agent.cli "approve <id>"` answers `Refused: requester cannot approve`: whoever injects a hold cannot release it. |
| 04:00 | "And a tank overfill. Capacity is checked before location, and no rule may ever clear it." | A3: `python3 scripts/inject.py --truck 29 --driver 30 --gallons 150 --lat 29.42419 --lon -98.49379 --time 18:00` | Terminal: `kernel verdict: capacity_exceeded`, `capacityLimitGal: 110`. Queue: a hold under `CAPACITY EXCEEDED`; its stand-in recommends hold and asks nothing. | Same line in B1. |
| 04:20 | Read only from the file: "Seven classes. Every planted exception raised, zero false positives. 6 of 6 decoys cleared through an approved rule with one answer each. 0 planted exceptions cleared by a rule." | B1: `cat docs/FACTS.md` | The facts table from the last full 92-day run. The `Planted vs raised` panel draws the same file. | Open `docs/FACTS.md` in the editor. Never run `facts.py` at the table. |
| 04:30 optional | "Watch the rest of the month go by. Clean lines pay themselves under the auto-pay limits; everything else holds and opens a task." | A3: `scripts/clock.sh tick 500000` then `scripts/clock.sh run` | `tick set to 500000 us`, `clock running`. Day clock pill turns `running`, `tick 0.5 s per day`, the day counts up. Queue groups fill by code (`LOCATION MISMATCH`, `VENDOR BANK CHANGE`, ...). Ledger of trust scrolls `auto_pay` and `hold` rows; the `auto-paid today` counter moves. The `model offline` pill may show: stand-in findings, labelled as such. | `scripts/clock.sh pause`; say "the clock is a scheduled reducer; full_run.sh runs all 92 days" and move on. |
| 04:45 | "Caliber. The money does not move until the code has matched the line, and the agent can never approve what it proposed." | none | The dashboard, clock paused. | none |

Notes on the beats:

- If they ask where the data comes from (the file connector): stage with `scripts/demo_up.sh --inbox` instead, and drop the files off camera as in `docs/video/moment-script.md` before 00:00; the beat that was here: "Or watch the data arrive. This is the file connector: this morning's fuel-card export dropped in a folder. There is no API integration; the label says so." With `scripts/demo_up.sh --inbox` (company data loaded, no transactions), step the clock to day 41, then drop the day-41 fuel export. Expected: `logs/ingest.log`: `ingested fuel_card_wex_day41_sample.csv: card, 61 rows in 1 batches, 0 skipped (already on file), 61 matched now, 0 waiting for their day`. Top bar: `1 files ingested today, 61 rows` next to `file connector; API connectors not built`. Queue: `2231` under `LOCATION MISMATCH` within about a second of the copy. Measured 2026-10-24: the hold row lands in the hold table within 1 s of the copy; with the full 5,607-row file the page catches up only after about 20 s under the burst (2,434 rows matched and settled at once), so the demo drops the day-41 export (61 rows), which renders within about a second. The full file is for `scripts/full_run.sh --inbox`.
- Use the explicit `answer 2231 ...` form. Bare text lands on the last hold discussed, or with `ASI_ONE_API_KEY` set, on whichever waiting question the model picks. Keep `no`, `not ours`, `did not`, `never`, `fraud`, `reject` out of the answer (the drafter reads it as a confirmed exception and drafts nothing), and `always`, `every`, `standing` (it drafts a 30-day standing rule).
- Never say "rule 1". The rule id keeps counting across resets; read `<n>` from `rules`.
- `what needs me` lists every hold still waiting, oldest days included, because no one answered them during the run. Point at the 2231 line.
- The CLI `rules` reply prints a used rule as `expired`; the Rules panel shows it as `used`. Both mean the one-time rule cleared 2231.
- Inject only on day 44 or day 42. Those are the days truck 29 sits at San Antonio with the engine off in every ping. On day 41 it drives to Houston and back through Luling, and on day 43 it drives in from Corpus Christi, so the Luling line would match or the pump line would hold.
- For another truck or day, read its pings first: `python3 -I -c "import json,sys;d,t=int(sys.argv[1]),int(sys.argv[2]);[print(p['at'],p['lat'],p['lon'],p['engineOn']) for p in json.load(open('seed/fixtures/trip_pings.json')) if p['day']==d and p['truckId']==t]" 44 29`. The kernel uses the nearest ping within 30 minutes. Pass `--driver`; the default (the truck's driver in `seed/fixtures/drivers.json`) is right for truck 29 but say it out loud anyway.
- No dollar amount or distance from memory. The Investigation panel and the terminal print them; read them off the screen.

## 2. Two terminals

Both sit in the repo root on the demo laptop. The dashboard is full screen on the same laptop. The second laptop shows ASI:One only; the dashboard and database listen on 127.0.0.1 and cannot be reached from it. The Discord or Slack channel, on the phone or the second laptop, shows one plain line per audit row a few seconds after it is written (`approve_payment INV-1075 by controller, $2,450.00, day 41`, `paused by controller, day 41`); it is outbound only, nothing typed there reaches the ledger, and a finding from a recording carries the word `replayed`.

| Window | What runs | Pre-typed |
| --- | --- | --- |
| A1 | `agent/.venv/bin/python agent/agent.py` (controller, port 8011) and `INVESTIGATOR_PORT=8012 agent/.venv/bin/python agent/investigator.py` (investigator), both started after `demo_up.sh` and `python3 scripts/mint_identities.py`, never before; investigator first, then the controller | nothing |
| A2 | `tail -f logs/worker.log` | nothing |
| A3 | live commands | the A3 lines from section 1, in order |
| B1 | fallback; first line `export FACTORY_API_KEY= ANTHROPIC_API_KEY= ELASTIC_API_KEY= ASI_ONE_API_KEY=`; with `--inbox`, the drop command pre-typed and not yet sent: `cp seed/fixtures/inbox/fuel_card_wex_day41_sample.csv inbox/` | the B1 lines from section 1, in order |
| B2 | editor | `spacetimedb/src/index.ts` at `checkApprovePayment`, `spacetimedb/src/kernel.ts` at `evaluateCardTxn`, `worker/src/droid.ts` at the options block, `agent/handlers.py`, `spacetimedb/src/thresholds.ts` |
| B3 | `agent/.venv/bin/python scripts/discord_feed.py` (Task 32, the Discord and Slack feed; it posts to whichever of `DISCORD_WEBHOOK_URL` and `SLACK_WEBHOOK_URL` is set), started after the two agents in A1; the Discord or Slack channel is open on the phone or the second laptop | nothing |

Terminal B makes no paid call and needs no internet: the keys are empty, and a set-but-empty variable wins over `.env`. Each one-shot `python3 -m agent.cli "..."` is a new process that forgets the last hold discussed, so every fallback names its hold. Say "same handler, other front door" and run it.

## 3. Night before

- [ ] Step 0: run `scripts/demo_up.sh` once with the network on (it installs the root dependencies and `agent/.venv` when missing), then turn Wi-Fi off, then run it again. The second run must end `Ready. The clock is paused on day 0.` with no install step.
- [ ] Both laptops and chargers in the bag; phone hotspot tested. Only ASI:One needs the internet.
- [ ] WiFi off on the demo laptop: run every beat from Terminal B. Everything except ASI:One must work.
- [ ] `.env` on the demo laptop only. `grep -c -E '^(STDB_SEED_TOKEN|STDB_AGENT_TOKEN|STDB_CONTROLLER_TOKEN|AGENT_SEED)=.+' .env` prints `4`. On 2026-10-24 it printed `3`: `AGENT_SEED` is missing. Add it once (`openssl rand -hex 32`) and never change it; it fixes the agent's address.
- [ ] Agentverse mailbox connected: start A1, open the Inspector link it logs, Connect, Mailbox, Finish. Paste `agent/README.md` into the profile and put the real address in its table.
- [ ] Second laptop logged into ASI:One with a chat to `@caliber-controller` open; `status` gets a reply.
- [ ] One full 92-day run, then `python3 scripts/facts.py` once, then read `docs/FACTS.md`. Those are the only numbers you may say. At the table `facts.py` would overwrite `docs/FACTS.json` and `web/public/FACTS.json` with whatever day the clock is on.
- [ ] Notability screenshots in `docs/notability/` with `captions.md`, the same in the Devpost gallery.
- [ ] Screen recordings of moment one and moment two on the desktop, played once, sound off. Last fallback.
- [ ] Rehearse the 00:15 to 00:35 run twice: at a 0.5 s tick, day 41 arrives about twenty seconds after `run`.
- [ ] Measured times: `demo_up.sh` ____ s, `run_days.ts --until 40` ____ s, uAgent mailbox ready ____ s.

Boot, in order, before the first judge: `scripts/demo_up.sh` (prints `dashboard: http://127.0.0.1:5173 (customer view) and http://127.0.0.1:5173/console` and ends `Ready. The clock is paused on day 0.`; the web step is a production build served by `vite preview`, not the dev server, which trails the ledger by up to 33 s at the 0.5 s tick, Task 30; after `scripts/facts.py`, run `demo_up.sh` again for the console charts to change), then A1, then wait fifteen seconds and send `status` from ASI:One. `demo_up.sh` wipes the data and writes new agent and controller tokens into `.env`, so anything started before it must be restarted after it.

## 3b. Sunday 7:00 AM

In this order, before leaving for the venue:

1. Step 0 again: `scripts/demo_up.sh` with the network on, Wi-Fi off, `scripts/demo_up.sh` again; it ends `Ready. The clock is paused on day 0.` with no install step.
2. The target list: `scripts/full_run.sh` once (about 25 s). Read `Overall precision 1.0, recall 1.0`, `Decoys cleared through an approved rule: 6 of 6`, `Planted exceptions cleared by a rule: 0`, and the Vendor checks line (`1 with a hit rejected by the controller, 2 clean approved with a call-back note`, source `fixture`). If any number differs, stop and read `docs/RESULTS.md` before anything else.
3. Read `docs/FACTS.md` once. Those are the only numbers said at the table.
4. `scripts/demo_up.sh` again (day 0, paused), then A1: investigator first (`INVESTIGATOR_PORT=8012 agent/.venv/bin/python agent/investigator.py`), then the controller (`agent/.venv/bin/python agent/agent.py`).
5. Second laptop: `status` in the ASI:One chat gets a reply that starts `investigator: Day 0 of 92`.
6. Devpost shows "submitted" before 9:00 AM; the video link is the final one.

## 4. Reset between judges

```
scripts/clock.sh reset
```

It prints `operational state cleared, day 0, paused`. Then stage the opening again from B1: `(cd scripts && npx tsx run_days.ts --until 41)`, so 2231 and INV-1075 are open before the next judge sits down. It clears holds, match results, payments, day totals, tasks and rules, and leaves day 0 paused. It keeps the audit trail (refusals pile up across judges), the tick setting (still 0.5 s, ready for the next run), the rule id counter, every injected card row, and all company data. The worker, A1 and the dashboard need no restart and no token changes. `as_agent.sh` sorts refusals by id, so its "last refusal" line stays correct.

Injected rows come back: on day 44 of the next replay the kernel matches them again, so the Luling and overfill holds reappear, raised by the database this time. Run `scripts/demo_up.sh` at a long break to clear them, then restart A1.

## 5. Failure modes

| What you see | Do | Say |
| --- | --- | --- |
| ASI:One slow or down | After five seconds, run the B1 line. | "Same handler, other front door. The database does not care which." |
| ASI:One replies `Ledger error` or a role refusal it should not | `demo_up.sh` ran after A1 started, so A1 holds an old token. Restart A1; use B1 meanwhile. | "Restarting the chat seat; the ledger is fine." |
| A2 stops; the card reads `Task is open. Waiting for the worker to claim it.` | `ls worker/PAUSE` and remove it if present. Otherwise restart the worker with the line below. | "Holds are raised by the kernel inside the database, so nothing slipped through. The investigator is catching up." |
| Top bar pill reads `reconnecting` or `database unreachable` | Reload the page. | "The page is a read-only subscriber." |
| Day clock does not move after `run` | `scripts/clock.sh pause`, then stage with `run_days.ts` from B1. | "The clock is a scheduled reducer; stepping it by hand is the same call." |
| ASI:One controller replies `not authorised for this seat` | The ASI:One account is not in `ASI_ALLOWED_SENDERS` in `.env`, or A1 started before it was added. Add the address, restart the controller in A1; use B1 meanwhile. | "Only the controller's own account may write from that seat; the terminal is the same seat." |
| `clock.sh status` fails, CLI says `ledger unreachable` | Server died. Stop the old worker and web (below), run `scripts/demo_up.sh`, restart A1, stage to day 40. Play the recording meanwhile. | "Fresh publish; every number on screen comes back from the ledger." |

```
(cd worker && WORKER_MODE=replay FACTORY_API_KEY= ANTHROPIC_API_KEY= nohup npm start > ../logs/worker.log 2>&1 &)
pkill -f 'tsx src/index.ts'; lsof -ti :5173 | xargs kill     # before re-running demo_up.sh (stops the vite preview server)
```

## 6. Sponsor tables

`context/JUDGE_QA.md` is split by audience; these map it to each table. One line each; open the file only if they ask for code.

**Hyphenate** (they said they would run their own scenario; that is 03:25 to 04:25)

1. Is the company real? No; `seed/generate.py` makes it with seed 42 and a published key. `seed/fixtures/answer_key.json`
2. What does the clerk do? A three-way match in integer cents in plain code; clean lines pay under the auto-pay limits, the rest hold. `spacetimedb/src/kernel.ts`
3. Can I try my own case? Yes, on the current day, through the same kernel. `scripts/inject.py`
4. Who approves? The controller, from ASI:One or the terminal; the agent is refused by the database and the refusal is a row. `spacetimedb/src/index.ts` (`checkApprovePayment`)
5. Does money move? Into a mock bank only: one Nessie transfer per approved payment, its id on the audit row; at this offline table the id is labelled `offline-<txnRef>`. `worker/src/settle.ts`

**SpacetimeDB**

1. Why SpacetimeDB? The permission model is the database: roles are a table and every reducer checks the caller first, with no API layer to bypass. `spacetimedb/src/index.ts` (`roleOf`, `checkRole`)
2. How does a refusal survive? A thrown error rolls back its own audit row, so the `try_` procedures commit the refusal and return `[ok, message]`. `spacetimedb/src/index.ts` (`attempt`), `docs/CONTRACT.md`
3. How does the clock work? `advance_day` is a scheduled reducer only the database identity may call. `spacetimedb/src/index.ts` (`advanceDay`)
4. Who computes the backtest? The module, inside `create_rule`, from `match_result` and `hold`; the worker's numbers are kept only as a preview. `spacetimedb/src/index.ts` (`backtest`)
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
3. Was that live? Read the badge; the table runs `WORKER_MODE=replay` with every key empty, so it says `replayed` or `scripted stand-in, not a model`. `scripts/demo_up.sh`
4. What if it hangs? The abort falls back to the recorded finding or the stand-in, and a timeout row is written after the grace period. `worker/src/investigate.ts`, `worker/src/loop.ts`
5. What if two workers grab a task? `claim_task` is version-locked; the loser logs "another worker won". `worker/src/stdb.ts`

**Elastic**

1. What is in Elastic? Four indices: `telematics_log` with a geo_point, `receipts`, `contracts`, `invoices`. `elastic/mappings/`
2. What tools? Four hand-written tools in Agent Builder: two ES|QL, `find_trips_near` and `contract_rate_for_vendor`, and two semantic on JINA, `find_contract_clause` and `find_receipt_text`; no ES|QL is written at runtime. `elastic/tools/`
3. How does Droid reach them? The Agent Builder MCP endpoint at `{KIBANA_URL}/api/agent_builder/mcp`, only when both variables are set. `worker/src/droid.ts`
4. Was Elastic queried at this table? No; the demo exports no Elastic keys, and the smoke test proves it only against a real project. `elastic/smoke.py`
5. Does the kernel use Elastic? No; the kernel reads module rows, and Elastic is evidence for the investigator only. `spacetimedb/src/kernel.ts`
6. Show me the Workflow? Network on only: `(cd elastic && .venv/bin/python setup_workflow.py --run --no-wait)` prints `Running <workflow id> once...` and `  execution <id>: status ...`; about 63 s later `status` in ASI:One ends `<N> escalations, newest: <hold ref>: ...`. At the offline table `status` ends `escalations: not connected`; show the two Success executions in `docs/evidence/elastic/workflow_executions_2026-10-24.jpg` instead. `elastic/workflows/stale_holds.yaml`
   If the run returns a 429 (the Elastic trial model quota: every agent step after 19:03 PDT on 2026-10-24 hit it) or no new brief appears within 90 s, do not retry: open the run history in Kibana and run `agent/.venv/bin/python -m agent.cli "status"`, which ends with the stored briefs ("3 escalations, newest: ..."), and say: "The trial model quota is spent; these three briefs are from earlier runs of the same Workflow." Never run the Workflow or the Agent Builder chat in the 15 minutes before a judge's Elastic beat.

## 7. Never say

1. A number that is not on a screen right now or in `docs/FACTS.md`. Nothing from memory.
2. "The model decided." The kernel decides, the investigator recommends, the controller approves.
3. "Real-time" without pointing at the `audit_event` row that just appeared.
4. "Droid ran live" unless `WORKER_MODE` was live and the badge says `live`. The 2231 and INV-1077 fixtures carry a "live droid run (record)" note; do not repeat it unless you watched that run.
5. "Elastic just found truck 22." In replay, the card replays a recorded tool call.
6. "It pays vendors" or "it moves money." A payment row is the end of the line.
7. Anything that makes the carrier, the vendors or the money sound real.
8. "Rule 1" without reading the id from `rules`.
9. "It learns" without "from your answer, scoped, expiring and backtested by the database".
10. Anything about Cruze's pilot or customers beyond the one line in `context/JUDGE_QA.md`.
