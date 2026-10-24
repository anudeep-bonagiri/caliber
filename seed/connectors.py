"""Inbox connector samples (Task 21): the full seeded dataset written in the three file formats that
scripts/ingest_watch.py accepts. Column layouts are the contract in docs/CONNECTORS.md; the watcher parses these
and only these. Written by generate.py beside the JSON fixtures, deterministic for a given seed, never hand-edited.

Money is written as dollars with exactly two decimals and read back with exact decimal arithmetic (no floats).
The business day is never written: the watcher derives it from the posting or received date (weekdays counted
from 2026-07-01). The truck is never written: the module resolves it from the card number or the plate.
"""
from __future__ import annotations

import csv
import io
from pathlib import Path

import simcal as cal

CARD_FILE = "fuel_card_wex_sample.csv"
TOLL_FILE = "toll_statement_sample.csv"
INVOICE_FILE = "maintenance_invoices_sample.csv"
# One business day's fuel-card export (the day the demo opens on): the same layout, only that day's rows. Dropping it
# at day 41 matches a day's worth of rows (about 60) instead of 2,434, which is what a daily WEX export looks like and
# what the dashboard can render within a second (Task 24).
DEMO_DAY = 41
DAY_FILE = f"fuel_card_wex_day{DEMO_DAY}_sample.csv"

CARD_HEADER = ["transaction_id", "posting_date", "transaction_time_utc", "card_number", "driver_id",
               "merchant_name", "site_name", "site_lat", "site_lon", "gallons", "total_amount"]
TOLL_HEADER = ["transaction_id", "posting_date", "transaction_time_utc", "plate", "plaza_id", "plaza_name", "amount"]
INVOICE_HEADER = ["invoice_number", "vendor_id", "po_number", "received_date", "item", "quantity",
                  "unit_price", "total_amount", "document_ref"]


def dollars(cents: int) -> str:
    """Exact: 41200 -> '412.00', 550 -> '5.50'. Negative amounts do not occur in the seeded company."""
    if cents < 0:
        raise ValueError(f"negative amount {cents}")
    return f"{cents // 100}.{cents % 100:02d}"


def _write(path: Path, header: list[str], rows: list[list]) -> None:
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\n", quoting=csv.QUOTE_MINIMAL)
    w.writerow(header)
    w.writerows(rows)
    path.write_text(buf.getvalue())


def write_inbox(out: Path, card_rows: list[dict], toll_rows: list[dict], invoices: list[dict]) -> None:
    """card_rows and toll_rows are the public fixture rows (ISO `at`), invoices the fixture invoice rows."""
    d = out / "inbox"
    d.mkdir(parents=True, exist_ok=True)
    _write(d / CARD_FILE, CARD_HEADER, [
        [c["id"], cal.iso_date(c["day"]), c["at"], c["cardId"], c["driverId"], c["merchant"], c["stationName"],
         c["stationLat"], c["stationLon"], c["gallons"], dollars(c["cents"])]
        for c in card_rows])
    _write(d / DAY_FILE, CARD_HEADER, [
        [c["id"], cal.iso_date(c["day"]), c["at"], c["cardId"], c["driverId"], c["merchant"], c["stationName"],
         c["stationLat"], c["stationLon"], c["gallons"], dollars(c["cents"])]
        for c in card_rows if c["day"] == DEMO_DAY])
    _write(d / TOLL_FILE, TOLL_HEADER, [
        [t["id"], cal.iso_date(t["day"]), t["at"], t["plate"], t["plazaId"], t["plazaName"], dollars(t["cents"])]
        for t in toll_rows])
    _write(d / INVOICE_FILE, INVOICE_HEADER, [
        [i["id"], i["vendorId"], i["poId"] or "", cal.iso_date(i["receivedDay"]), i["item"], i["qty"],
         dollars(i["unitCents"]), dollars(i["cents"]), i["docRef"]]
        for i in invoices])
