# Model-only baseline

Generated 2026-10-25T00:12:27+00:00 by bench/score.py from one committed run. Prompts under bench/prompts, raw responses under bench/outputs. Nothing in this file is typed by hand.

Three systems were given the same rows and the same records: Caliber (the kernel plus Droid, the measured run in docs/FACTS.json), Claude Sonnet alone and asi1-mini alone, each asked hold or clear with a one-line reason and the code.

| Code | Planted | Caliber P / R | Claude Sonnet P / R | asi1-mini P / R |
| --- | --- | --- | --- | --- |
| location_mismatch | 20 | 1.00 / 1.00 | 1.00 / 1.00 | 0.71 / 1.00 |
| capacity_exceeded | 6 | 1.00 / 1.00 | 1.00 / 1.00 | n/a / 0.00 |
| rate_variance | 9 | 1.00 / 1.00 | 1.00 / 1.00 | 1.00 / 0.89 |
| duplicate_toll | 11 | 1.00 / 1.00 | 1.00 / 1.00 | 0.12 / 1.00 |
| duplicate_invoice | 4 | 1.00 / 1.00 | 1.00 / 1.00 | 0.29 / 0.50 |
| vendor_bank_change | 3 | 1.00 / 1.00 | 1.00 / 1.00 | 0.11 / 0.33 |
| short_received | 5 | 1.00 / 1.00 | 1.00 / 1.00 | 1.00 / 1.00 |
| overall | 58 | 1.00 / 1.00 | 1.00 / 1.00 | 0.31 / 0.81 |

P is precision, R is recall, code-exact. The overall row counts a hold as correct only when the code matches.

| System | Model id | Rows answered | Holds | Detection P / R (any code) | Decoys held | False holds |
| --- | --- | --- | --- | --- | --- | --- |
| Caliber (kernel + Droid) | kernel.ts, no model decides | 7944 of 7944 | 58 | 1.00 / 1.00 | 6 of 6 | 0 |
| Claude Sonnet | claude-sonnet-5-5 | 558 of 558 | 58 | 1.00 / 1.00 | 6 of 6 | 0 |
| asi1-mini | asi1-mini | 557 of 558 | 150 | 0.33 / 0.84 | 6 of 6 | 101 |

## Where each model failed

- Claude Sonnet failed on nothing in this sample.
- asi1-mini missed 4 of 6 capacity_exceeded, 1 of 9 rate_variance, 2 of 4 duplicate_invoice, 2 of 3 vendor_bank_change; held with the wrong code 2 capacity_exceeded; held 101 clean rows (holds by code that did not match a planted row: 82 as duplicate_toll, 8 as location_mismatch, 8 as vendor_bank_change, 5 as duplicate_invoice); 1 row had no parseable answer (1 unparsed), counted as not held.

## Ties or wins against the kernel

- Claude Sonnet tied the kernel on location_mismatch.
- Claude Sonnet tied the kernel on capacity_exceeded.
- Claude Sonnet tied the kernel on rate_variance.
- Claude Sonnet tied the kernel on duplicate_toll.
- Claude Sonnet tied the kernel on duplicate_invoice.
- Claude Sonnet tied the kernel on vendor_bank_change.
- Claude Sonnet tied the kernel on short_received.
- asi1-mini tied the kernel on short_received.
- Claude Sonnet tied the kernel on overall.

## Run facts

- Sample: seed 42; 52 planted, 6 decoys, 500 clean rows ({'card': 174, 'invoice': 153, 'toll': 173}); every clean invoice was included because only 153 exist; the 6 auto-pay limit holds (a policy hold, not an exception) were left out.
- Claude Sonnet: requested claude-sonnet-5-5, used claude-sonnet-5-5; 558 of 558 rows answered; 2,358,546 input and 166,183 output tokens (output includes thinking); cost $6.38 at list rates $2.0 per million input and $10.0 per million output (Anthropic first-party API list prices, platform.claude.com pricing (cached 2026-10-06)); cap $15.0, stopped for cost: False. Complete.
- asi1-mini: 557 of 558 rows answered; 561 requests against the free-plan quota of 100 per 15 minutes and 1000 per day, paced one request every 9.1 s; 2,393,406 prompt and 66,383 completion tokens. Complete.
- Caliber: docs/FACTS.json as of 2026-10-24T22:25:41+00:00, 7944 transactions over 92 days.
- Rerun: `agent/.venv/bin/python bench/sample.py && agent/.venv/bin/python bench/inputs.py && agent/.venv/bin/python bench/baseline.py --model sonnet && agent/.venv/bin/python bench/baseline.py --model asi1 && agent/.venv/bin/python bench/score.py`

## Footnotes

1. Positives are the 58 answer-key rows: 52 planted exceptions and 6 decoys. A decoy is a legitimate unit swap that the records on file cannot distinguish from card misuse, so hold is the correct decision for every system: the kernel held and asked, then cleared through an approved rule after one controller answer; a model that says hold on a decoy is counted correct; a model that says clear on a decoy is counted exactly as it scores, a miss.
2. Code-exact scoring (the table): a hold counts for a code only when the system named that code; a hold with a wrong or missing code is a false positive for the code it named and a miss for the planted code. This is the definition docs/FACTS.json uses for the kernel.
3. Caliber's figures are the measured 92-day run over all 7,944 transactions (docs/FACTS.json); the models saw a 558-row sample holding every planted row and decoy plus 500 clean rows, so recall is directly comparable and the kernel's precision was tested on about fourteen times as many clean rows.
4. Synthetic data from the same generator as the clean rows (seed/generate.py, seed 42); every system was given identical inputs; no fine-tuning, no examples, one prompt, one attempt per row. The result measures whether each system finds what we planted, not how it behaves on a real carrier's statements.
5. Claude Sonnet: no temperature was sent because Claude Sonnet 5.5 returns 400 for a non-default temperature; thinking and effort were left at the API defaults. asi1-mini: temperature 0.
6. Parsing: the first complete JSON object in a reply is the decision, for both models; a reply with no complete object counts as not held. Raw replies are on disk unchanged under bench/outputs.
