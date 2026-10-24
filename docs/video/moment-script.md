# The moment: typed sequence for the opening clip (Task 24)

Screen: the dashboard in a Chrome window 1440 by 900 at the top left (http://127.0.0.1:5173), one Terminal window over its lower right third, prompt at `~/dev/hackathons/dispatch-ledger`. Staging note (2026-10-24): the Chrome window was opened and sized 1440 by 900 through the Claude in Chrome extension; Chrome ignores AppleScript `bounds` and System Events is not granted assistive access from this session, so drag that window to the top left by hand if it is not there. The Terminal window titled `caliber-take` was placed at {960, 560, 1440, 925} (its lower right third) and is the one to type in; the recorder region is 1440 by 900 over the Chrome window. Recorder: Anudeep's macOS recorder (Shift-Command-5, region 1440 by 900 over the Chrome window) or `screencapture -V 40` once Screen Recording is granted. No narration. Under 40 s.

Staged off camera before the cue: `scripts/demo_up.sh --inbox` (company data, no transactions, watcher up on `logs/ingest.log`, worker in replay), `cd scripts && npx tsx run_days.ts --until 41`, so the day clock reads `Day 41 of 92`, the queue is empty and the top bar reads `0 files ingested today, 0 rows` next to `file connector; API connectors not built`. The worker replays the recorded live Droid runs, so the card's badge says `replayed`; that is honest and stays.

One line per action. Wait for what the screen must show before the next line.

| Step | Typed in the Terminal (or clicked) | Wait for, on screen | Pause after |
| --- | --- | --- | --- |
| 0 | nothing; recording starts | Day clock `Day 41 of 92`, empty queue, `0 files ingested today` | 2 s |
| 1 | `cp seed/fixtures/inbox/fuel_card_wex_day41_sample.csv inbox/` (the day-41 export, 61 rows; the full 5,607-row file stalls the page for about 20 s and is not used on camera) | Queue fills under `LOCATION MISMATCH` and `CAPACITY EXCEEDED`; `2231  $412.00  day 41` is in the list; top bar flips to `1 files ingested today, 61 rows` (about 1 s after the copy) | 2 s |
| 2 | click the `2231` row in the queue | Investigation of 2231: the `replayed` badge, the `find_trips_near` step naming truck 22, the swap_log.txt step, the finding, `Recommendation: hold_and_ask`, the question `Can Ramon Ortiz or the San Antonio dispatcher confirm ...` | 4 s (let the viewer read the question) |
| 3 | `agent/.venv/bin/python -m agent.cli "answer 2231 yes, Ramon Ortiz drove relief unit 22 that week while unit 17 was in the shop"` | Terminal: `answer_question 2231 written to audit_event by controller (...)`; card: `Answer on file: yes, Ramon Ortiz ...`; Ledger of trust: `answer_question` row, actor `controller` | 3 s (the worker drafts the rule) |
| 4 | `agent/.venv/bin/python -m agent.cli "rules"` | Terminal: the candidate rule line with its id; Rules panel: the candidate card `Would have cleared 1 past rows; 0 were confirmed exceptions` | 2 s |
| 5 | `agent/.venv/bin/python -m agent.cli "approve rule <n>"` (the id from step 4; it is 1 on a fresh staging) | Terminal: `approve_rule <n> written to audit_event by controller (...)`; Rules panel: the pill turns `used`; Queue: 2231 leaves the open list (resolved, `cleared by rule`); Ledger of trust: `approve_rule` then `cleared_by_rule` rows, `released by rule` counter up by one; the Investigation panel for 2231 reads `cleared_by_rule` | 4 s, then stop |

If the Agentverse mailbox is connected and a second laptop is on ASI:One, steps 3 to 5 may be typed in the ASI:One chat instead of the terminal twin; the replies are the same text. Say which seat was used in `moment-captions.md` for each take.

Never: say "live" for the replayed badge; pipe any of these into `head`; approve the rule before the Rules panel shows the candidate.

Between takes: re-stage off camera (`scripts/demo_up.sh --inbox`, `run_days.ts --until 41`), wait 10 s, start again from step 0. The rule id counts up across stagings only if the database is not republished; demo_up republishes, so it is 1 again.
