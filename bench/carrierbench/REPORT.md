# CarrierBench report

Generated 2026-10-24T23:24:14+00:00 by bench/carrierbench/carrierbench.py --seed 42. Nothing in this file is typed by hand.

## Fixtures

- Generator: seed/generate.py, seed 42. Regenerated in 2.74 s; every generated file byte-identical to seed/fixtures: True. Working tree matches the committed fixtures (git HEAD): True.

| File | md5 (working tree) | matches commit | matches regenerated |
| --- | --- | --- | --- |
| seed/fixtures/answer_key.json | cc9b36576bdfaf6e0e18e4235872ac44 | True | True |
| seed/fixtures/card_txns.json | 81ba60a2a462c07ebc0f8066a5c1d376 | True | True |
| seed/fixtures/contracts.json | a9b6dc4a57b9ec6d965fba8833a10b37 | True | True |
| seed/fixtures/drivers.json | 50a6e03f24bbb9ab1d16f0fd855d16e1 | True | True |
| seed/fixtures/invoices.json | 05177da871d9dfa08380284d4d5b234a | True | True |
| seed/fixtures/pos.json | c7c1c0422d8255e5357cff67af5848c2 | True | True |
| seed/fixtures/summary.json | 575936bede911406506ae0e47565324d | True | True |
| seed/fixtures/terminals.json | 01b25d3d62c3a153c5e26778b6a0d1af | True | True |
| seed/fixtures/toll_txns.json | 5e527b7bc5e1f29b9f24260cd675f789 | True | True |
| seed/fixtures/trip_pings.json | fce729a00d94a9efa8339c83fac3943f | True | True |
| seed/fixtures/trucks.json | 861b4b8e162f17f88e280380482b0ece | True | True |
| seed/fixtures/vendors.json | 0be9ff02a40fe656e84fc07eed79d058 | True | True |

## Counts

- 92 business days (2026-07-01 to 2026-11-05), 6 terminals, 40 trucks, 48 drivers, 40 fuel cards, 5 maintenance vendors, 34 contracts, 30 purchase orders, 46 stations, 14 toll plazas, 155,457 telematics pings.
- Rows: 5,607 fuel-card transactions, 2,157 tolls, 180 invoices; 7,944 in all; 7,886 clean.
- Answer key: 58 rows = 52 planted exceptions in 7 classes + 6 decoys. Expected outcomes: {'auto_reject': 11, 'clear_after_question': 6, 'hold': 40, 'reject': 1}.

| Code | Planted |
| --- | --- |
| location_mismatch | 14 |
| capacity_exceeded | 6 |
| rate_variance | 9 |
| duplicate_toll | 11 |
| duplicate_invoice | 4 |
| vendor_bank_change | 3 |
| short_received | 5 |

## Controls

- Held-out entities (computed): 25 of 40 trucks carry exactly one answer-key row, 10 carry none; 0 of 5 vendors carry exactly one, 0 carry none. 19 planted rows sit on an entity with no other planted row.
- Decoys: 6; all look like location_mismatch to the kernel: True; all have a swap-log line for the driver: True.
- Policy holds (auto-pay limit, not exceptions): 6 ['INV-1075', 'INV-1080', 'INV-1106', 'INV-1109', 'INV-1117', 'INV-1171'].

| Decoy | Day | Truck | Driver | Miles from nearest ping | Swap-log lines |
| --- | --- | --- | --- | --- | --- |
| 1421 | 8 | 15 | Clayton Burks (drv 22) | 66.1 | 2 |
| 2044 | 19 | 30 | Jerome Watkins (drv 10) | 56.4 | 2 |
| 2231 | 41 | 17 | Ramon Ortiz (drv 23) | 97.2 | 2 |
| 3955 | 51 | 35 | Carl Whitaker (drv 6) | 58.1 | 2 |
| 5428 | 74 | 6 | Alejandro Garza (drv 11) | 48.5 | 2 |
| 5986 | 83 | 16 | Derrick Osborne (drv 35) | 53.9 | 2 |

## Machine audit

- seed/mirror.py (the Python copy of spacetimedb/src/kernel.ts) evaluated 7,944 rows from their own evidence and flagged 58.
- Answer-key rows audited: 58; inferable from evidence with the key's code: 58; with an evidence file: 58.
- Rows flagged by the mirror that are not in the key: []; key rows with the wrong code: []; key rows not flagged: [].
- Failures: []. Audit passed: True.

| Code | Rows | Inferable | Evidence file |
| --- | --- | --- | --- |
| location_mismatch | 20 | 20 | 20 |
| capacity_exceeded | 6 | 6 | 6 |
| rate_variance | 9 | 9 | 9 |
| duplicate_toll | 11 | 11 | 11 |
| duplicate_invoice | 4 | 4 | 4 |
| vendor_bank_change | 3 | 3 | 3 |
| short_received | 5 | 5 | 5 |

Per-row evidence is in REPORT.json under audit.rows (evidenceUsed is the kernel rule's evidence object; evidenceInputs are the lookups it was given).
