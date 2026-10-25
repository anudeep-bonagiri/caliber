# The moment: typed sequence for the opening of the video (Task 24, reordered for Task 28)

Order, set by the council (Task 28 demo order): (a) the investigator agent is asked to pay and the ledger refuses it; (b) the controller approves a held invoice (INV-1075, over the auto-pay limit) and the Nessie bank id lands on the audit row; (c) the hold-to-rule story, with the Elastic Workflow triggered at its start and the escalation count read back about 63 s later. (a) and (b) and (c) through `approve rule` fit the first 60 s; the `status` line closes the clip at about 90 s.

## Staging note (off camera, before every take)

(a) needs hold 2231 open before the refusal, and (b) needs live settlement, so the take is staged with settlement live and Droid on replay:

1. `scripts/demo_up.sh --inbox` (company data, no transactions, watcher up on `logs/ingest.log`). It starts a replay worker; stop it with `pkill -f 'tsx src/index.ts'` and start the recording worker with exactly this line:
   `(cd worker && WORKER_MODE=live FACTORY_API_KEY= ANTHROPIC_API_KEY= NESSIE_MAX_PER_SECOND=20 nohup npm start > ../logs/worker.log 2>&1 &)`
   The empty Factory key forces Droid to replay (`worker/src/config.ts`); settlement follows `WORKER_MODE` and goes live (`worker/src/index.ts`). Wait for `settlement: live through Nessie (mock bank), at most 20 transfers per second, ...` in `logs/worker.log`. If a line reads `has no Nessie account; rerun scripts/nessie_seed.py`, run that once.
2. `python3 scripts/mint_identities.py`, then the two agents (investigator first, then the controller, section 2 of `docs/RUNBOOK.md`). `.env` must carry `ASI_ALLOWED_SENDERS` with the address of the ASI:One account used on camera, or every controller write in ASI:One answers `not authorised for this seat`.
3. `(cd scripts && npx tsx run_days.ts --until 41)`: Day clock `Day 41 of 92`.
4. Drop the data off camera, both files at day 41: `cp seed/fixtures/inbox/fuel_card_wex_day41_sample.csv seed/fixtures/inbox/maintenance_invoices_sample.csv inbox/`. The day-41 fuel export (61 rows) opens 2231; the invoice file opens every invoice hold received by day 41, among them INV-1075 for (b) (vendor 4, received 2026-08-25, `brake_job`, $2,790.00, held only because it is over the $2,500 auto-pay limit, the routine approval a controller makes), and holds INV-1077 for its day. Every auto-paid row then settles through Nessie at 20 per second; wait until `logs/worker.log` stops adding `settled <ref> bank id <id>` lines.
5. `(cd elastic && .venv/bin/python mirror_holds.py)` so the `holds` index the Workflow reads matches day 41.
6. Reload the dashboard. Check: `Day 41 of 92`, `2231  $412.00  day 41` open under `LOCATION MISMATCH`, `INV-1075` open in the queue. On the second laptop, two ASI:One chats open: `@caliber-investigator` and `@caliber-controller`.

Screen: the dashboard in a Chrome window 1440 by 900 at the top left (http://127.0.0.1:5173/console once Task 29 is merged, http://127.0.0.1:5173 before), one Terminal window titled `caliber-take` over its lower right third, prompt at `~/dev/hackathons/dispatch-ledger`; ASI:One on the second laptop, captured separately or right of frame. Recorder: Anudeep's macOS recorder (Shift-Command-5, region 1440 by 900 over the Chrome window) or `screencapture -V 40` once Screen Recording is granted. Chrome ignores AppleScript `bounds` and System Events is not granted assistive access from this session, so drag the window to the top left by hand if it is not there. No narration. The worker replays the recorded live Droid runs, so the 2231 card's badge says `replayed`; that is honest and stays. A Nessie id on the audit row is live; say so only if the row reads `paid, bank id <id>` and not `settlement: offline`.

## Typed sequence

One line per action. Wait for what the screen must show before the next line.

| Step | Where | Typed (or clicked) | Wait for, on screen | Pause after |
| --- | --- | --- | --- | --- |
| 0 | nothing | recording starts | Day clock `Day 41 of 92`; 2231 in the queue | 2 s |
| 1 (a) | ASI:One, `@caliber-investigator` chat | `approve 2231` | Reply `investigator: refused by the ledger: reader may not do this (needs controller)`. Dashboard, Ledger of trust: newest row red, action `refused`, actor pill `reader`, ref `2231` | 3 s |
| 2 (b) | ASI:One, `@caliber-controller` chat | `approve INV-1075` | Reply `approve_payment INV-1075 written to audit_event by controller (event <n>, day 41)` (`agent/handlers.py`, `agent/formatting.py`). Ledger of trust: `approve_payment` row, actor `controller`, ref `INV-1075`; then a `settle` row, ref `INV-1075`, detail `paid, bank id <id>`. Queue `resolved`: INV-1075 with `settled <id>` | 3 s |
| 3 (c) | Terminal | `scripts/clock.sh step` | `advanced one day`; Day clock `Day 42 of 92`; day-42 rows from the files on disk match, the Ledger of trust scrolls | 2 s |
| 4 (c, Elastic opens) | Terminal | `(cd elastic && .venv/bin/python setup_workflow.py --run --no-wait)` | `Running <workflow id> once...`, then `  execution <id>: status ...`. Note the time: the escalation shows in `status` about 63 s later (step 9) | 1 s |
| 5 | Dashboard | click the `2231` row | Investigation of 2231: the `replayed` badge, the `find_trips_near` step naming truck 22, the swap_log.txt step, `Recommendation: hold_and_ask`, the question `Can Ramon Ortiz or the San Antonio dispatcher confirm ...` | 4 s |
| 6 | ASI:One, controller chat | `why 2231` | First line `asked @caliber-investigator agent1q..., <n> s`, then `investigator: 2231 ...` with the finding, two `Evidence:` lines, the question, `source: replayed` | 3 s |
| 7 | ASI:One, controller chat | `answer 2231 Yes. Ortiz drove unit 22 that week while unit 17 was in the shop, per the swap log.` | Reply `answer_question 2231 written to audit_event by controller (...)`; Ledger of trust `answer_question` row; the Rules panel shows a candidate within a few seconds | 3 s |
| 8 | ASI:One, controller chat | `rules` | The candidate line `#<n>  candidate  location_mismatch  scope {"driverId":23} ...`; Rules panel `Would have cleared 1 past rows; 0 were confirmed exceptions`. Read `<n>` here | 2 s |
| 9 | ASI:One, controller chat | `approve rule <n>` | Reply `approve_rule <n> written to audit_event by controller (...)`; Rules pill `used`; Queue: 2231 leaves the open list (`cleared by rule`); Ledger of trust `approve_rule`, then `cleared_by_rule` ref `2231` | 3 s |
| 10 | ASI:One, controller chat, at least 63 s after step 4 | `status` | `asked @caliber-investigator agent1q..., <n> s`, then `investigator: Day 42 of 92 ...`, last line `<N> escalations, newest: <hold ref>: ...`. If N has not moved, wait 10 s and send `status` again | 3 s, then stop |

Terminal twin, if the mailbox drops: steps 6 to 10 may be typed as `agent/.venv/bin/python -m agent.cli "<line>"`; the replies are the same text without the `asked @caliber-investigator` hop line. Steps 1 and 2 have no terminal twin on camera: (a) is the point of the ASI:One seat and (b) needs the controller seat. Say which seat was used in `moment-captions.md` for each take.

Never: say "live" for the replayed badge; pipe any of these into `head`; approve the rule before the Rules panel shows the candidate; read a dollar amount or a bank id from memory.

Between takes: re-stage from step 1 of the staging note (demo_up republishes, so the rule id is 1 again and 2231 and INV-1075 are open again), wait 10 s, start again from step 0. Each staging makes the settlement transfers again, so leave time for step 4 to drain.
