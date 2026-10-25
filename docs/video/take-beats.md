# Screen take of 2026-10-25 08:36 PDT: beat map (docs/video/screen_take.mov, 7:25)

Times are from the start of the file, accurate to about five seconds. Read the matching script line from docs/VIDEO.md when the beat appears; the video runs slower than the narration, so pause between lines rather than rush.

| Time | On screen | Script beat |
| --- | --- | --- |
| 0:00 | Slide 01 | title |
| 0:06 to 0:25 | ASI:One investigator chat: approve 2231, reply "refused by the ledger: reader may not do this (needs controller)" | [0:00] |
| 0:27 to 0:50 | New chat with @caliber-controller: approve INV-1075, reply "written to audit_event by controller (event 310, day 41)" | [0:20] |
| 0:50 to 1:10 | Console: ledger of trust, "settle INV-1075 paid, bank id ..." | [0:20] end |
| 1:10 to 1:40 | Terminal commands, console queue (day 41 on screen; the clock step landed at 2:30) | [0:40] and [0:55] |
| 1:40 to 2:30 | Customer view: the 2231 card with the question | [1:15] |
| 2:30 to 2:48 | Controller chat: why 2231, the relayed finding with the hop line | [1:45] |
| 2:48 to 3:08 | answer 2231 ... sent | [1:45] end |
| 3:08 to 3:18 | Console: rule #1 candidate, "would have cleared 1 past rows; 0 were confirmed exceptions" | [2:00] |
| 3:18 to 3:50 | Controller chat: rules | [2:00] |
| 3:52 to 4:16 | approve rule 1; console shows the rule used and 2231 settled | [2:00] end |
| 4:16 to 4:44 | status: the hop line, "3 escalations, newest: 1421" | [2:20] |
| 4:44 to 5:05 | Chat scrolled to the replies; console at day 44 | [2:30] |
| 5:05 to 5:30 | approve INV-1077 refused: "call-back note required for a bank change"; then with the note, "written to audit_event (event 330, day 44)" | [2:30] |
| 6:00 to 6:16 | Slide 04, proof | [2:50] |
| 6:16 to 6:36 | Benchmark image | [2:50] second paragraph |
| 6:36 to 6:55 | Slides 02 and 03, then the customer view | [3:25] |
| 6:55 to 7:25 | Slide 05, close | [3:45] |

Known blemishes: the terminal step at 1:10 did not advance the clock (it ran in another Terminal window); the day changed at 2:30 from the shell, so the console reads day 41 until then. The Workflow brief in the status line is the earlier one (3 escalations); the guard skipped already-briefed holds, as designed.
