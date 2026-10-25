# Facts

Written by scripts/facts.py at 2026-10-25T00:22:27+00:00. Nothing in it is typed by hand.

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
Released by the controller: 8 payments, $32,097.00.
Refusals recorded in the audit trail: 1 ({'agent': 1}).
Settlement: 0 payments carry a live Nessie transfer id, 7894 a labelled offline id, 0 unsettled.
Vendor checks: 3 bank-change holds; 1 with a hit rejected by the controller, 2 clean approved with a call-back note; check source {'fixture': 3} (fixture means hand-authored, CRS sandbox pending); outcomes match the key: True.
Investigations by source: {'replayed': 47}; by status: {'investigated': 47}.
Droid cost, from the recorded live run of 2026-10-24, 52 investigations: per task on average 1,033 input tokens, 1,354 output tokens and 70,386 cache tokens (cacheCreationTokens plus cacheReadTokens), 25.6 s; totals 53,739 input, 70,433 output, 3,660,097 cache tokens, 2,016,204 Factory credits.
Decoy re-record, the six decoy recordings re-recorded live on 2026-10-24 (now the fixtures for 1421, 2044, 2231, 3955, 5428, 5986): 6 tasks, totals 6,529 input, 7,036 output, 420,407 cache tokens (cacheCreationTokens plus cacheReadTokens), 196,074 Factory credits.


## Model-only baseline

Copied from bench/BASELINE.json (generated 2026-10-25T12:55:10+00:00 by bench/score.py from one committed run; prompts under bench/prompts, raw responses under bench/outputs). Precision / recall, code-exact.

| Code | Planted | Caliber P / R | Claude Sonnet P / R | Claude Opus 5.5 P / R | asi1-mini P / R |
| --- | --- | --- | --- | --- | --- |
| location_mismatch | 20 | 1.00 / 1.00 | 1.00 / 1.00 | 0.95 / 1.00 | 0.71 / 1.00 |
| capacity_exceeded | 6 | 1.00 / 1.00 | 1.00 / 1.00 | 1.00 / 1.00 | n/a / 0.00 |
| rate_variance | 9 | 1.00 / 1.00 | 1.00 / 1.00 | 0.47 / 1.00 | 1.00 / 0.89 |
| duplicate_toll | 11 | 1.00 / 1.00 | 1.00 / 1.00 | 1.00 / 1.00 | 0.12 / 1.00 |
| duplicate_invoice | 4 | 1.00 / 1.00 | 1.00 / 1.00 | 1.00 / 1.00 | 0.29 / 0.50 |
| vendor_bank_change | 3 | 1.00 / 1.00 | 1.00 / 1.00 | 1.00 / 1.00 | 0.11 / 0.33 |
| short_received | 5 | 1.00 / 1.00 | 1.00 / 1.00 | 0.62 / 1.00 | 1.00 / 1.00 |
| overall | 58 | 1.00 / 1.00 | 1.00 / 1.00 | 0.81 / 1.00 | 0.31 / 0.81 |

Model ids: Claude Sonnet claude-sonnet-5-5; Claude Opus 5.5 claude-opus-5-5; asi1-mini asi1-mini. Partial: {'asi1': False, 'caliber': False, 'opus': False, 'sonnet': False}.
Claude Sonnet failed on nothing in this sample.
Claude Opus 5.5 held 14 clean rows (holds by code that did not match a planted row: 10 as rate_variance, 3 as short_received, 1 as location_mismatch).
asi1-mini missed 4 of 6 capacity_exceeded, 1 of 9 rate_variance, 2 of 4 duplicate_invoice, 2 of 3 vendor_bank_change; held with the wrong code 2 capacity_exceeded; held 101 clean rows (holds by code that did not match a planted row: 82 as duplicate_toll, 8 as location_mismatch, 8 as vendor_bank_change, 5 as duplicate_invoice); 1 row had no parseable answer (1 unparsed), counted as not held.
Claude Sonnet spend $6.3789 at list rates {'input': 2.0, 'output': 10.0} (cap $15.0, stopped for cost: False); Claude Opus 5.5 spend $12.8491 at list rates {'cacheRead': 0.2, 'cacheWrite': 5.0, 'input': 4.0, 'output': 20.0} (the same cap on this model alone, stopped for cost: False, 558 rows answered); asi1-mini requests 561 against the free-plan quota.
1. Positives are the 58 answer-key rows: 52 planted exceptions and 6 decoys. A decoy is a legitimate unit swap that the records on file cannot distinguish from card misuse, so hold is the correct decision for every system: the kernel held and asked, then cleared through an approved rule after one controller answer; a model that says hold on a decoy is counted correct; a model that says clear on a decoy is counted exactly as it scores, a miss.
2. Code-exact scoring (the table): a hold counts for a code only when the system named that code; a hold with a wrong or missing code is a false positive for the code it named and a miss for the planted code. This is the definition docs/FACTS.json uses for the kernel.
3. Caliber's figures are the measured 92-day run over all 7,944 transactions (docs/FACTS.json); the models saw a 558-row sample holding every planted row and decoy plus 500 clean rows, so recall is directly comparable and the kernel's precision was tested on about fourteen times as many clean rows.
4. Synthetic data from the same generator as the clean rows (seed/generate.py, seed 42); every system was given identical inputs; no fine-tuning, no examples, one prompt, one attempt per row. The result measures whether each system finds what we planted, not how it behaves on a real carrier's statements.
5. Claude Sonnet: no temperature was sent because Claude Sonnet 5.5 returns 400 for a non-default temperature; thinking and effort were left at the API defaults. Claude Opus 5.5: the same request shape (model, max_tokens, messages), no temperature, no thinking field (adaptive by default; it cannot be disabled on Opus 5.5) and no effort field. The API default effort differs by model, medium on Opus 5.5 and high on Sonnet 5.5, so each Anthropic run sits at its own default rather than at one shared setting; both runs share the $15 cap, applied to each model's outputs on its own. asi1-mini: temperature 0.
6. Parsing: the first complete JSON object in a reply is the decision, for every model; a reply with no complete object counts as not held. Raw replies are on disk unchanged under bench/outputs.
