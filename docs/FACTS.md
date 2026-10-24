# Facts

Written by scripts/facts.py at 2026-10-24T21:13:08+00:00. Nothing in it is typed by hand.

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
Refusals recorded in the audit trail: 1 ({'agent': 1}).
Settlement: 0 payments carry a live Nessie transfer id, 7895 a labelled offline id, 0 unsettled.
Investigations by source: {'replayed': 47}; by status: {'investigated': 47}.
Droid cost, from the recorded live run of 2026-10-24, 52 investigations: per task on average 1,033 input tokens, 1,354 output tokens and 70,386 cache tokens (cacheCreationTokens plus cacheReadTokens), 25.6 s; totals 53,739 input, 70,433 output, 3,660,097 cache tokens, 2,016,204 Factory credits.
Decoy re-record, the six decoy recordings re-recorded live on 2026-10-24 (now the fixtures for 1421, 2044, 2231, 3955, 5428, 5986): 6 tasks, totals 6,529 input, 7,036 output, 420,407 cache tokens (cacheCreationTokens plus cacheReadTokens), 196,074 Factory credits.

