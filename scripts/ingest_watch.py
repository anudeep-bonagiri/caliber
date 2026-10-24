#!/usr/bin/env python3
"""The inbox file connector (Task 21). Python 3 standard library only.

Watches inbox/ (repo root, gitignored) for the three CSV layouts in docs/CONNECTORS.md: a WEX-style fuel-card file,
a toll statement and a maintenance invoice file. A complete file (size unchanged between two polls, not ending in
.part) is parsed, every row is converted to the batch shape the module's `ingest_rows` reducer takes, and the rows
are sent over HTTP with the seed token in batches of 500. The reducer inserts the rows like the seed path does,
skips ids already on file, matches rows dated on or before the current business day through the same path
advance_day uses, and stores later rows for their day. The file then moves to inbox/done/<timestamp>-<name>, or to
inbox/failed/<timestamp>-<name> with the reason in the log when the header, a date, an amount or an id is bad or
the module refused the batch. Re-dropping a file is safe: every duplicate id is counted as skipped.

Label: file connector; API connectors not built.

Usage: python3 scripts/ingest_watch.py [--inbox inbox] [--interval 0.5] [--once]
Env (from .env): STDB_URI, STDB_DB, STDB_SEED_TOKEN. The token is never printed.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import os
import shutil
import sys
import time
import urllib.error
import urllib.request
from decimal import Decimal, InvalidOperation
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
START = dt.date(2026, 7, 1)
TOTAL_DAYS = 92
BATCH = 500

CARD_HEADER = ["transaction_id", "posting_date", "transaction_time_utc", "card_number", "driver_id",
               "merchant_name", "site_name", "site_lat", "site_lon", "gallons", "total_amount"]
TOLL_HEADER = ["transaction_id", "posting_date", "transaction_time_utc", "plate", "plaza_id", "plaza_name", "amount"]
INVOICE_HEADER = ["invoice_number", "vendor_id", "po_number", "received_date", "item", "quantity",
                  "unit_price", "total_amount", "document_ref"]
KIND_BY_HEADER = {tuple(CARD_HEADER): "card", tuple(TOLL_HEADER): "toll", tuple(INVOICE_HEADER): "invoice"}


class Rejected(Exception):
    """The file is not acceptable; it moves to inbox/failed with this message."""


def log(msg: str) -> None:
    print(f"{dt.datetime.now().strftime('%H:%M:%S')} {msg}", flush=True)


def load_env() -> dict:
    env = dict(os.environ)
    p = ROOT / ".env"
    if p.exists():
        for line in p.read_text().splitlines():
            if "=" in line and not line.strip().startswith("#"):
                k, v = line.split("=", 1)
                env.setdefault(k.strip(), v.strip())
    return env


# ---------------------------------------------------------------- parsing (exact, no floats for money)
def day_for_date(text: str, what: str) -> int:
    try:
        d = dt.date.fromisoformat(text)
    except ValueError:
        raise Rejected(f"{what}: unparsable date {text!r} (expected YYYY-MM-DD)")
    if d < START:
        raise Rejected(f"{what}: date {text} is before the first business day {START.isoformat()}")
    n, cur = 0, START
    while cur <= d:
        if cur.weekday() < 5:
            n += 1
        cur += dt.timedelta(days=1)
    if d.weekday() >= 5:
        raise Rejected(f"{what}: {text} is a weekend; postings carry the business date")
    if n > TOTAL_DAYS:
        raise Rejected(f"{what}: {text} is after business day {TOTAL_DAYS}")
    return n


def micros(text: str, what: str) -> str:
    try:
        t = dt.datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        raise Rejected(f"{what}: unparsable time {text!r} (expected ISO 8601 UTC)")
    if t.tzinfo is None:
        raise Rejected(f"{what}: time {text!r} has no timezone")
    epoch = dt.datetime(1970, 1, 1, tzinfo=dt.timezone.utc)
    return str((t - epoch) // dt.timedelta(microseconds=1))


def cents(text: str, what: str) -> int:
    whole, dot, frac = text.strip().partition(".")
    if not dot or len(frac) != 2 or not whole.lstrip("-").isdigit() or not frac.isdigit():
        raise Rejected(f"{what}: amount {text!r} must have exactly two decimals")
    try:
        return int(Decimal(text) * 100)
    except InvalidOperation:
        raise Rejected(f"{what}: amount {text!r} is not a number")


def integer(text: str, what: str) -> int:
    if not text.strip().lstrip("-").isdigit():
        raise Rejected(f"{what}: {text!r} is not an integer")
    return int(text)


def number(text: str, what: str) -> float:
    try:
        return float(text)
    except ValueError:
        raise Rejected(f"{what}: {text!r} is not a number")


def parse(path: Path) -> tuple[str, list[dict]]:
    with path.open(newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        try:
            header = next(reader)
        except StopIteration:
            raise Rejected("empty file")
        kind = KIND_BY_HEADER.get(tuple(h.strip() for h in header))
        if kind is None:
            raise Rejected(f"bad header {header}; see docs/CONNECTORS.md")
        rows = []
        seen: set[str] = set()
        for n, cells in enumerate(reader, start=2):
            if not cells or all(c.strip() == "" for c in cells):
                continue
            if len(cells) != len(header):
                raise Rejected(f"line {n}: {len(cells)} columns, header has {len(header)}")
            what = f"line {n}"
            if kind == "card":
                tid, pdate, ttime, card, drv, merchant, site, lat, lon, gal, amount = cells
                row = {"id": tid, "cardId": card, "driverId": integer(drv, what), "atMicros": micros(ttime, what),
                       "day": day_for_date(pdate, what), "stationName": site, "stationLat": number(lat, what),
                       "stationLon": number(lon, what), "gallons": number(gal, what), "cents": cents(amount, what),
                       "merchant": merchant}
            elif kind == "toll":
                tid, pdate, ttime, plate, plaza, plaza_name, amount = cells
                row = {"id": tid, "plate": plate, "atMicros": micros(ttime, what), "day": day_for_date(pdate, what),
                       "plazaId": plaza, "plazaName": plaza_name, "cents": cents(amount, what)}
            else:
                tid, vendor, po, rdate, item, qty, unit, total, doc = cells
                row = {"id": tid, "vendorId": integer(vendor, what), "poId": po or None,
                       "receivedDay": day_for_date(rdate, what), "item": item, "qty": number(qty, what),
                       "unitCents": cents(unit, what), "cents": cents(total, what), "docRef": doc}
            if not tid:
                raise Rejected(f"{what}: empty id")
            if tid in seen:
                raise Rejected(f"{what}: duplicate id {tid} inside the file")
            seen.add(tid)
            rows.append(row)
    return kind, rows


# ---------------------------------------------------------------- the module
class Ledger:
    def __init__(self, env: dict):
        self.uri = env.get("STDB_URI", "http://127.0.0.1:3100").rstrip("/")
        self.db = env.get("STDB_DB", "dispatch-ledger")
        self.token = env.get("STDB_SEED_TOKEN", "")

    def ingest(self, file_name: str, kind: str, batch: list[dict]) -> None:
        body = json.dumps([file_name, kind, json.dumps(batch, separators=(",", ":"))]).encode()
        req = urllib.request.Request(f"{self.uri}/v1/database/{self.db}/call/ingest_rows", data=body, method="POST")
        req.add_header("Authorization", f"Bearer {self.token}")
        req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                r.read()
        except urllib.error.HTTPError as e:
            raise Rejected(f"module refused the batch (HTTP {e.code}): {e.read().decode()[:300]}")

    def log_rows(self, file_name: str) -> list[dict]:
        q = f"SELECT * FROM ingest_log WHERE file_name = '{file_name}'".encode()
        req = urllib.request.Request(f"{self.uri}/v1/database/{self.db}/sql", data=q, method="POST")
        with urllib.request.urlopen(req, timeout=30) as r:
            res = json.loads(r.read().decode())[0]
        names = [e["name"]["some"] for e in res["schema"]["elements"]]
        return [dict(zip(names, row)) for row in res["rows"]]


# ---------------------------------------------------------------- files
def complete(path: Path, sizes: dict) -> bool:
    """A file counts as complete when its size has not changed since the previous poll."""
    if path.suffix.lower() != ".csv" or path.name.endswith(".part") or path.name.startswith("."):
        return False
    size = path.stat().st_size
    prev = sizes.get(path)
    sizes[path] = size
    return prev is not None and prev == size and size > 0


def move(path: Path, folder: Path) -> Path:
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / f"{dt.datetime.now().strftime('%Y%m%dT%H%M%S')}-{path.name}"
    shutil.move(str(path), str(target))
    return target


def process(path: Path, ledger: Ledger, inbox: Path) -> bool:
    t0 = time.time()
    try:
        kind, rows = parse(path)
        batches = 0
        for i in range(0, len(rows), BATCH):
            ledger.ingest(path.name, kind, rows[i:i + BATCH])
            batches += 1
        logged = ledger.log_rows(path.name)
        skipped = sum(int(r["skipped"]) for r in logged[-batches:]) if logged else 0
        matched = sum(int(r["matched"]) for r in logged[-batches:]) if logged else 0
        done = move(path, inbox / "done")
        log(f"ingested {path.name}: {kind}, {len(rows)} rows in {batches} batches, {skipped} skipped (already on file), "
            f"{matched} matched now, {len(rows) - skipped - matched} waiting for their day; {time.time() - t0:.2f} s; moved to {done.relative_to(ROOT)}")
        return True
    except Rejected as e:
        failed = move(path, inbox / "failed")
        log(f"rejected {path.name}: {e}; moved to {failed.relative_to(ROOT)}")
        return False
    except (urllib.error.URLError, OSError) as e:
        log(f"could not reach the ledger for {path.name}: {e}; will retry")
        return False


def main() -> int:
    ap = argparse.ArgumentParser(description="inbox file connector; API connectors not built")
    ap.add_argument("--inbox", default=str(ROOT / "inbox"))
    ap.add_argument("--interval", type=float, default=0.5)
    ap.add_argument("--once", action="store_true", help="process what is there now and exit")
    args = ap.parse_args()
    env = load_env()
    ledger = Ledger(env)
    if not ledger.token:
        print("STDB_SEED_TOKEN missing; run scripts/demo_up.sh first", file=sys.stderr)
        return 2
    inbox = Path(args.inbox)
    inbox.mkdir(parents=True, exist_ok=True)
    log(f"watching {inbox} every {args.interval} s for the three layouts in docs/CONNECTORS.md (file connector; API connectors not built)")
    sizes: dict = {}
    while True:
        for path in sorted(p for p in inbox.iterdir() if p.is_file()):
            if args.once or complete(path, sizes):
                sizes.pop(path, None)
                process(path, ledger, inbox)
        if args.once:
            return 0
        time.sleep(args.interval)


if __name__ == "__main__":
    sys.exit(main())
