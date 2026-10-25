#!/usr/bin/env python3
"""Per-row model inputs for the baseline (Task 22, step 2): exactly what the kernel sees, nothing more.

For each sampled row the file bench/inputs/<id>.json carries the same rows that spacetimedb/src/index.ts hands
to kernel.ts for that transaction:
  card    the transaction, the card's truck (plate, tank size), and the truck's telematics pings for that
          business day (pingsFor in index.ts loads the day; the kernel's rule then uses the 30-minute window)
  toll    the transaction and the plate's earlier tolls (evaluateTollRow passes every earlier toll for the plate)
  invoice the invoice, its PO (with received quantity), the contract valid on the receipt day for the PO's item,
          the vendor record with bankChangedDay, and the vendor's earlier invoices (evaluateInvoiceRow)
Fields are allow-listed. No answer-key field, no match_result, no finding, no planted marker exists or is written.

Run: agent/.venv/bin/python bench/inputs.py
"""
from __future__ import annotations

import json
from collections import defaultdict

from common import BENCH, load_fixtures, mirror, write_json

CARD_FIELDS = ("id", "cardId", "truckId", "driverId", "at", "day", "stationName", "stationLat", "stationLon", "gallons", "cents", "merchant")
TRUCK_FIELDS = ("id", "plate", "tankGal", "fuelCardId")
PING_FIELDS = ("at", "lat", "lon", "engineOn", "odometer")
TOLL_FIELDS = ("id", "plate", "truckId", "at", "day", "plazaId", "plazaName", "cents")
INVOICE_FIELDS = ("id", "vendorId", "poId", "receivedDay", "item", "qty", "unitCents", "cents", "docRef")
EARLIER_INVOICE_FIELDS = ("id", "poId", "receivedDay", "item", "qty", "unitCents", "cents")
PO_FIELDS = ("id", "vendorId", "truckId", "item", "qty", "unitCents", "receivedQty", "issuedDay")
CONTRACT_FIELDS = ("id", "vendorId", "item", "rateCents", "validFromDay", "validToDay")
VENDOR_FIELDS = ("id", "name", "bankLast4", "bankChangedDay")


def pick(row: dict, fields: tuple[str, ...]) -> dict:
    return {f: row[f] for f in fields if f in row}


def contract_for(contracts: list[dict], vendor_id: int, item: str, day: int) -> dict | None:
    """Same selection as index.ts: the vendor's contract for the PO item valid on the receipt day; the most
    recently started wins, lowest id breaks ties."""
    best = None
    for c in contracts:
        if c["vendorId"] != vendor_id or c["item"] != item or c["validFromDay"] > day or c["validToDay"] < day:
            continue
        if best is None or c["validFromDay"] > best["validFromDay"] or (c["validFromDay"] == best["validFromDay"] and c["id"] < best["id"]):
            best = c
    return best


def build_inputs(sample_rows: list[dict], fx: dict) -> dict[str, dict]:
    trucks = {t["id"]: t for t in fx["trucks"]}
    pings_by_truck_day: dict[tuple[int, int], list[dict]] = defaultdict(list)
    for p in fx["trip_pings"]:
        pings_by_truck_day[(p["truckId"], p["day"])].append(p)
    for lst in pings_by_truck_day.values():
        lst.sort(key=lambda p: p["at"])
    cards = {c["id"]: c for c in fx["card_txns"]}
    tolls = {t["id"]: t for t in fx["toll_txns"]}
    tolls_by_plate: dict[str, list[tuple[int, dict]]] = defaultdict(list)
    for t in fx["toll_txns"]:
        tolls_by_plate[t["plate"]].append((mirror.cal.iso_to_micros(t["at"]), t))
    invoices = {i["id"]: i for i in fx["invoices"]}
    invoices_by_vendor: dict[int, list[dict]] = defaultdict(list)
    for i in fx["invoices"]:
        invoices_by_vendor[i["vendorId"]].append(i)
    pos = {p["id"]: p for p in fx["pos"]}
    vendors = {v["id"]: v for v in fx["vendors"]}

    out: dict[str, dict] = {}
    for s in sample_rows:
        ref, kind = s["id"], s["kind"]
        if kind == "card":
            txn = cards[ref]
            truck = trucks.get(txn["truckId"])
            pings = pings_by_truck_day.get((txn["truckId"], txn["day"]), [])
            out[ref] = {
                "kind": "card",
                "transaction": pick(txn, CARD_FIELDS),
                "truck": pick(truck, TRUCK_FIELDS) if truck else None,
                "truckPingsThatDay": [pick(p, PING_FIELDS) for p in pings],
            }
        elif kind == "toll":
            txn = tolls[ref]
            me_micros = mirror.cal.iso_to_micros(txn["at"])
            earlier = [t for m, t in tolls_by_plate[txn["plate"]]
                       if t["id"] != ref and (m < me_micros or (m == me_micros and t["id"] < ref))]
            earlier.sort(key=lambda t: (t["at"], t["id"]))
            out[ref] = {
                "kind": "toll",
                "transaction": pick(txn, TOLL_FIELDS),
                "earlierTollsSamePlate": [pick(t, TOLL_FIELDS) for t in earlier],
            }
        else:
            inv = invoices[ref]
            po = pos.get(inv["poId"]) if inv.get("poId") else None
            contract = contract_for(fx["contracts"], inv["vendorId"], po["item"], inv["receivedDay"]) if po else None
            vendor = vendors.get(inv["vendorId"])
            earlier = [e for e in invoices_by_vendor[inv["vendorId"]]
                       if e["id"] != ref and (e["receivedDay"] < inv["receivedDay"] or (e["receivedDay"] == inv["receivedDay"] and e["id"] < ref))]
            earlier.sort(key=lambda e: (e["receivedDay"], e["id"]))
            out[ref] = {
                "kind": "invoice",
                "invoice": pick(inv, INVOICE_FIELDS),
                "purchaseOrder": pick(po, PO_FIELDS) if po else None,
                "contractValidOnReceiptDay": pick(contract, CONTRACT_FIELDS) if contract else None,
                "vendor": pick(vendor, VENDOR_FIELDS) if vendor else None,
                "earlierInvoicesSameVendor": [pick(e, EARLIER_INVOICE_FIELDS) for e in earlier],
            }
    return out


FORBIDDEN_KEYS = {"code", "expected", "note", "planted", "matchResult", "match_result", "finding", "txnRef", "answer", "decoy"}


def check_no_leak(doc: dict) -> None:
    def walk(x):
        if isinstance(x, dict):
            for k, v in x.items():
                assert k not in FORBIDDEN_KEYS, k
                walk(v)
        elif isinstance(x, list):
            for v in x:
                walk(v)
    walk(doc)


def main() -> int:
    sample = json.loads((BENCH / "sample.json").read_text())
    fx = load_fixtures()
    docs = build_inputs(sample["rows"], fx)
    for ref, doc in docs.items():
        check_no_leak(doc)
        write_json(BENCH / "inputs" / f"{ref}.json", doc)
    sizes = sorted(len(json.dumps(d)) for d in docs.values())
    print(f"wrote {len(docs)} input files under bench/inputs; bytes min {sizes[0]} median {sizes[len(sizes)//2]} max {sizes[-1]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
