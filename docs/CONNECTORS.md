# Connectors

One connector exists: a file connector. `scripts/ingest_watch.py` watches `inbox/` (repo root, not committed) and accepts three CSV layouts, documented here. There is no WEX, toll-authority or accounting API integration; the label everywhere is "file connector; API connectors not built". The three sample files in `seed/fixtures/inbox/` carry the full seeded dataset in these layouts (5,607 fuel-card rows, 2,157 toll rows, 180 invoices), written by `seed/generate.py` with seed 42, so dropping them on a fresh `scripts/demo_up.sh --inbox` reproduces the seeded run's facts apart from timestamps.

## How a file flows

1. A file is complete when its size has not changed between two polls (0.5 s apart). Names ending in `.part` and names starting with a dot are ignored.
2. The header row picks the layout. Anything else is rejected.
3. Every row is parsed with exact arithmetic (see Units). The whole file is rejected on the first bad row.
4. Rows are sent to the module's `ingest_rows` reducer (seed role, HTTP, batches of 500). The reducer inserts rows that are not already on file, matches rows dated on or before the current business day through the same path `advance_day` uses (holds, auto-pay limits and duplicate auto-rejects apply unchanged), and stores later rows for their day. It appends one `ingest_log` row per batch and one `ingest` audit row.
5. The file moves to `inbox/done/<timestamp>-<name>`, or to `inbox/failed/<timestamp>-<name>` with the reason in `logs/ingest.log`.

Re-dropping a file is safe: every id already on file is counted as skipped and nothing is overwritten.

## Layout 1: fuel card (WEX style), `fuel_card_wex_sample.csv`

| Column | Module field | Notes |
| --- | --- | --- |
| `transaction_id` | `card_txn.id` | unique; an id already on file is skipped |
| `posting_date` | `card_txn.day` | `YYYY-MM-DD`, a business date; the day is the count of weekdays from 2026-07-01 to this date inclusive |
| `transaction_time_utc` | `card_txn.at` | ISO 8601 with a timezone, stored as microseconds since the Unix epoch |
| `card_number` | `card_txn.card_id`, and `card_txn.truck_id` | the module resolves the truck from `truck.fuel_card_id`; an unknown card refuses the batch |
| `driver_id` | `card_txn.driver_id` | integer |
| `merchant_name` | `card_txn.merchant` | text |
| `site_name` | `card_txn.station_name` | text |
| `site_lat`, `site_lon` | `card_txn.station_lat`, `station_lon` | decimal degrees |
| `gallons` | `card_txn.gallons` | one decimal |
| `total_amount` | `card_txn.cents` | dollars with exactly two decimals, converted to integer cents exactly |

A fourth sample, `fuel_card_wex_day41_sample.csv`, is the same layout with only business day 41's rows (61 rows, including 2231): a daily export, what a carrier's card provider sends each morning. Dropping it at day 41 matches a day's rows in about a second; dropping the full 5,607-row file at day 41 matches 2,434 rows at once and the dashboard takes about 20 seconds to render the burst. The full file is for the reproducibility check, the one-day file for the opening beat.

## Layout 2: toll statement, `toll_statement_sample.csv`

| Column | Module field | Notes |
| --- | --- | --- |
| `transaction_id` | `toll_txn.id` | unique |
| `posting_date` | `toll_txn.day` | as above |
| `transaction_time_utc` | `toll_txn.at` | as above |
| `plate` | `toll_txn.plate`, and `toll_txn.truck_id` | the module resolves the truck from `truck.plate`; an unknown plate refuses the batch |
| `plaza_id`, `plaza_name` | `toll_txn.plaza_id`, `plaza_name` | text |
| `amount` | `toll_txn.cents` | dollars with exactly two decimals |

## Layout 3: maintenance invoices, `maintenance_invoices_sample.csv`

| Column | Module field | Notes |
| --- | --- | --- |
| `invoice_number` | `invoice.id` | unique |
| `vendor_id` | `invoice.vendor_id` | integer; an unknown vendor refuses the batch |
| `po_number` | `invoice.po_id` | empty means no PO (the kernel treats it as a non-PO invoice) |
| `received_date` | `invoice.received_day` | `YYYY-MM-DD`, a business date, as above |
| `item` | `invoice.item` | text, the contract item code |
| `quantity` | `invoice.qty` | number |
| `unit_price` | `invoice.unit_cents` | dollars with exactly two decimals |
| `total_amount` | `invoice.cents` | dollars with exactly two decimals; the kernel compares it with quantity times the contract rate |
| `document_ref` | `invoice.doc_ref` | path of the rendered document under `seed/fixtures/evidence/` |

## Units

- Money: dollars with exactly two decimals in the file, integer cents in the module. The watcher converts with `Decimal`, never a float; `412.00` is 41200 and `5.50` is 550. An amount without exactly two decimals is rejected.
- Dates: `YYYY-MM-DD`. The business day is the number of weekdays from 2026-07-01 to the date, inclusive (day 1 is Wednesday 2026-07-01, day 41 is 2026-08-26, day 92 is 2026-11-05). Weekend dates and dates outside days 1 to 92 are rejected.
- Times: ISO 8601 with a timezone, for example `2026-08-26T18:04:00Z`. The watcher sends microseconds since the Unix epoch as a string, so nothing is rounded.
- Gallons, coordinates and quantities: plain decimal numbers; they are not money and are stored as 64-bit floats, as in the seeded fixtures.
- Trucks: never in a file. The module resolves the truck from the card number (fuel) or the plate (toll).

## What is rejected

| Problem | Where | Effect |
| --- | --- | --- |
| Header is not one of the three layouts | watcher | file moves to `inbox/failed/` |
| Wrong column count on a line | watcher | file rejected |
| Duplicate id inside one file | watcher | file rejected |
| Unparsable date, weekend date, date outside days 1 to 92 | watcher | file rejected |
| Unparsable time or time without a timezone | watcher | file rejected |
| Amount without exactly two decimals | watcher | file rejected |
| Non-integer driver or vendor id | watcher | file rejected |
| Unknown card number, plate or vendor | module (`ingest_rows`) | the batch is refused, nothing in it is written, the file moves to `inbox/failed/` |
| Id already on file | module | the row is skipped and counted in `ingest_log.skipped`; the rest of the batch proceeds |
| Caller without the seed role | module | refused by role, like every seed reducer |

## What the dashboard shows

The top bar reads the public `ingest_log` table: "N files ingested today, M rows" (distinct file names, sum of rows received), with the `ingest_log` ids in the hover text, next to the chip "file connector; API connectors not built".
