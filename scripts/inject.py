#!/usr/bin/env python3
"""Judge scenario: insert one fuel transaction into the current simulated day and run the kernel on it.

Usage:
  python scripts/inject.py --truck 5 --gallons 80 --lat 29.42 --lon -98.49 --time 10:30
  python scripts/inject.py --truck 5 --gallons 80 --station "Pilot 1126, Luling TX" --time 13:05 --price 3.59

The transaction lands on the current business day at the given UTC time; the kernel looks for the truck's
nearest ping within 30 minutes and applies the same rules as every other row. The injecting controller is
recorded as the hold's requester, so it cannot approve the resulting hold itself.
"""
import argparse
import json
import os
import random
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def load_env():
    env = dict(os.environ)
    p = ROOT / ".env"
    if p.exists():
        for line in p.read_text().splitlines():
            if "=" in line and not line.strip().startswith("#"):
                k, v = line.split("=", 1)
                env.setdefault(k.strip(), v.strip())
    return env


def post(url, body, token=None):
    req = urllib.request.Request(url, data=body, method="POST")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--truck", type=int, required=True)
    ap.add_argument("--driver", type=int, default=0, help="driver id (default: the driver assigned to the truck in seed/fixtures/drivers.json)")
    ap.add_argument("--gallons", type=float, required=True)
    ap.add_argument("--lat", type=float)
    ap.add_argument("--lon", type=float)
    ap.add_argument("--station", default="Judge scenario station")
    ap.add_argument("--time", default="12:00", help="HH:MM UTC on the current business day")
    ap.add_argument("--price", type=float, default=3.49)
    ap.add_argument("--id", default=None)
    args = ap.parse_args()

    env = load_env()
    uri, db = env.get("STDB_URI", "http://127.0.0.1:3100"), env.get("STDB_DB", "dispatch-ledger")
    token = env.get("STDB_CONTROLLER_TOKEN")
    if not token:
        print("STDB_CONTROLLER_TOKEN missing from .env", file=sys.stderr)
        return 2

    status, text = post(f"{uri}/v1/database/{db}/sql", b"SELECT * FROM business_day")
    res = json.loads(text)[0]
    names = [e["name"]["some"] for e in res["schema"]["elements"]]
    clock = dict(zip(names, res["rows"][0]))
    date = clock["date"]
    hh, mm = (int(x) for x in args.time.split(":"))
    at = datetime(int(date[:4]), int(date[5:7]), int(date[8:10]), hh, mm, tzinfo=timezone.utc)
    micros = int(at.timestamp() * 1_000_000)

    known = {
        "Love's 412, Schulenburg TX": (29.6816, -96.9036),
        "Pilot 1126, Luling TX": (29.6805, -97.6475),
        "Buc-ee's, New Braunfels TX": (29.6612, -98.1122),
        "TA Express, Columbus TX": (29.7069, -96.5397),
    }
    lat, lon = args.lat, args.lon
    if lat is None or lon is None:
        if args.station in known:
            lat, lon = known[args.station]
        else:
            print("give --lat and --lon, or one of: " + ", ".join(known), file=sys.stderr)
            return 2

    txn_id = args.id or str(random.randint(900000, 999999))
    cents = round(args.gallons * args.price * 100)
    driver = args.driver
    if not driver:
        drivers_file = ROOT / "seed/fixtures/drivers.json"
        if drivers_file.exists():
            for d in json.loads(drivers_file.read_text()):
                if d.get("truckId") == args.truck:
                    driver = d["id"]
                    break
        driver = driver or args.truck
    row = {
        "id": txn_id,
        "card_id": f"FC-{1000 + args.truck}",
        "truck_id": args.truck,
        "driver_id": driver,
        "at": {"__timestamp_micros_since_unix_epoch__": micros},
        "day": clock["day"],
        "station_name": args.station,
        "station_lat": lat,
        "station_lon": lon,
        "gallons": args.gallons,
        "cents": cents,
        "merchant": args.station.split(",")[0].upper(),
    }
    status, text = post(f"{uri}/v1/database/{db}/call/inject_card_txn", json.dumps([row]).encode(), token)
    if status != 200:
        print(f"refused ({status}): {text}", file=sys.stderr)
        return 1

    status, text = post(f"{uri}/v1/database/{db}/sql", f"SELECT * FROM match_result WHERE txn_ref = '{txn_id}'".encode())
    res = json.loads(text)[0]
    names = [e["name"]["some"] for e in res["schema"]["elements"]]
    mr = dict(zip(names, res["rows"][0])) if res["rows"] else {}
    print(f"injected {txn_id}: truck {args.truck}, {args.gallons} gal, ${cents/100:,.2f} at {args.station} on day {clock['day']} ({date} {args.time}Z)")
    print(f"kernel verdict: {mr.get('code')}")
    ev = json.loads(mr.get("evidence_json", "{}")) if mr else {}
    for k in ("distanceMiles", "thresholdMiles", "capacityLimitGal", "limitReason", "reason"):
        if k in ev:
            print(f"  {k}: {ev[k]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
