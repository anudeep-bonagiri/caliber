# The moment: captions (Task 24)

Second by second, what a viewer with no audio sees. Times are seconds from the first frame of each file. Every take is the same five-step sequence from `docs/video/moment-script.md`: the file drop, hold 2231, the card with the Droid steps and the Ortiz question, the controller's answer, the rule with its backtest counts and the clearing.

## Fallback: `moment-fallback-dashboard-only.mp4`

Label: dashboard only, recorded by Playwright's own video recorder, no terminal window on screen. The controller seat was the terminal twin, driven off camera (`agent/.venv/bin/python -m agent.cli ...`), so the typed lines are not in the frame; their effects are (the answer on the card, the candidate rule, the approval, the audit rows). Made because macOS Screen Recording was not granted to the Claude Code app on 2026-10-24 (see context/PROJECT_STATUS.md, job 13). The two real takes replace it when recorded.

File: 1440 by 900, 25 fps, 24.9 s, 1.1 MB (H.264 from the 1440 by 900 webm, no audio). Staging: `scripts/demo_up.sh --inbox`, clock stepped to day 41, worker in replay (the card's badge reads `replayed`: the recorded live Droid run of 2026-10-24).

| Time | On screen |
| --- | --- |
| 0.0 | Dashboard, `Day 41 of 92, Wed Aug 26`, paused. Queue empty. Top bar: `0 files ingested today, 0 rows` and `file connector; API connectors not built`. |
| 2.5 | (off camera) `cp seed/fixtures/inbox/fuel_card_wex_day41_sample.csv inbox/` |
| 4.1 | Top bar flips to `1 files ingested today, 61 rows`. Queue fills: `LOCATION MISMATCH` with `2231  $412.00  day 41  awaiting controller` and its question "Can Ramon Ortiz or the San Antonio dispatcher confirm ...", plus the other day-41 holds. Ledger of trust: `61 transactions matched today`, auto-paid 60, holds 1. |
| 5.7 | Click on 2231. Investigation of 2231: `replayed` badge, truck 17 (TX-1017), driver Ramon Ortiz #23, card FC-1017, Love's 412 Schulenburg TX, 120 gallons, `97.2 mi vs 25 mi`, engine off; steps: `recorded droid run (2026-10-24) for 2231`, the `find_trips_near` tool call and its result naming truck 22, the swap_log.txt read; the finding; `Recommendation: hold_and_ask`; the question. |
| 14.7 | (off camera) the controller answers from the terminal twin. Card: `answered`, the answer text "yes, Ramon Ortiz drove relief unit 22 that week while unit 17 was in the shop". Ledger of trust: `answer_question` row, actor `controller`. |
| 14.8 | Rules: `#1 location_mismatch on driver 23`, `ONE TIME`, `CANDIDATE, WAITING FOR THE CONTROLLER`, days 41 to 46, `Would have cleared 1 past rows; 0 were confirmed exceptions`, the controller's answer quoted. |
| 20.9 | (off camera) `approve rule 1`. Rules: the pill turns `used`; Queue: 2231 leaves the open list (resolved, cleared by rule); Ledger of trust: `approve_rule` then `cleared_by_rule` rows; released by rule counter up by one. |
| 24.9 | End. |

The five events a viewer sees, with timestamps: data arrives (4.1 s), hold 2231 opened and explained (5.7 s), the person answers (14.7 s), the rule with its backtest counts (14.8 s), the hold cleared by the rule with the audit row (20.9 s).

## Take 1: `moment-take1` (pending)

## Take 2: `moment-take2` (pending)
