# Dashboard honesty audit, 2026-10-24 14:16 PDT

Read-only, against the running web app at http://localhost:5173 and the ledger at day 44 while builder-13's rehearsal was stepping the clock. Screenshots are CSS-pixel captures of the Playwright viewport.

| File | What it shows |
| --- | --- |
| 01-overview-day44.png | Whole dashboard: day clock with the "Simulated carrier" line, queue, an investigation card (770003, a judge-scenario row) with the `replayed` badge, rules board with the `used` pill and backtest line, trust counters with "Investigations: 0 live, 27 replayed, 0 scripted stand-in" |
| 02-fullpage-day44.png | Full page including the audit feed with `settle` rows reading "paid, settlement: offline (offline-<ref>)" and the facts charts labelled "from docs/FACTS.json, written by scripts/facts.py" |
| 03-bank-change-hold-INV-1032.png | A bank-change hold awaiting the controller: `call-back required` pill in the queue and the header, the investigation replayed, and below the fold a vendor check labelled "stand-in, not a vendor check" with three `no result` rows |
| 04-released-INV-1077-vendor-check-settlement.png | INV-1077 released: "Paid: $9,800.00 on day 44, released by controller", the call-back note, the replayed investigation with "replayed from a recording made 2026-10-24 by droid live run", and the vendor check block for vendor 3 marked `replayed` with three evidence rows |

Findings are in context/PROJECT_STATUS.md under "Builder-W: dashboard honesty audit".
