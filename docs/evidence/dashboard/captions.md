# Dashboard honesty audit, 2026-10-24 14:16 PDT

Read-only, against the running web app at http://localhost:5173 and the ledger at day 44 while builder-13's rehearsal was stepping the clock. Screenshots are CSS-pixel captures of the Playwright viewport.

| File | What it shows |
| --- | --- |
| 01-overview-day44.png | Whole dashboard: day clock with the "Simulated carrier" line, queue, an investigation card (770003, a judge-scenario row) with the `replayed` badge, rules board with the `used` pill and backtest line, trust counters with "Investigations: 0 live, 27 replayed, 0 scripted stand-in" |
| 02-fullpage-day44.png | Full page including the audit feed with `settle` rows reading "paid, settlement: offline (offline-<ref>)" and the facts charts labelled "from docs/FACTS.json, written by scripts/facts.py" |
| 03-bank-change-hold-INV-1032.png | A bank-change hold awaiting the controller: `call-back required` pill in the queue and the header, the investigation replayed, and below the fold a vendor check labelled "stand-in, not a vendor check" with three `no result` rows |
| 04-released-INV-1077-vendor-check-settlement.png | INV-1077 released: "Paid: $9,800.00 on day 44, released by controller", the call-back note, the replayed investigation with "replayed from a recording made 2026-10-24 by droid live run", and the vendor check block for vendor 3 marked `replayed` with three evidence rows |

Findings are in context/PROJECT_STATUS.md under "Builder-W: dashboard honesty audit".

## After the worker restart with 2fac596 (job 7, 2026-10-24 14:28 PDT, ledger at day 60)

| File | What it shows |
| --- | --- |
| 05-after-restart-day60.png | Day 60 after stepping from 44. Trust panel line now reads "Investigations: 0 live, 34 replayed, 0 scripted stand-in. Vendor checks: 0 live, 2 recorded replay, 0 hand-shaped fixture, 5 stand-in"; audit feed `settle` rows read "paid, bank id <uuid>" for payments settled live through Nessie since the restart |
| 06-replayed-card-after-restart-3884.png | Hold 3884 (day 49, investigated by the restarted worker): `replayed` badge, first note "recorded droid run (2026-10-24) for 3884", then "replayed from a recording made 2026-10-24 by droid live run"; no "live droid run (record)" text anywhere on the page |

No new vendor_check task arrived between day 45 and the day-60 cap: the remaining planted bank change is vendor 5 (Border Fleet Repair) on day 71, so the amber "hand-shaped fixture" badge could not be observed on a fresh card in this run. The two vendor checks counted as "recorded replay" are INV-1077 and its earlier twin, written by the old code before the restart; their stored refs still contain "POST /TODO-..." and will render that text if a judge selects INV-1077 until the ledger is rebuilt (full_run.sh) or the clock passes day 71.
