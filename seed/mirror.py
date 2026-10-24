"""Python mirror of spacetimedb/src/kernel.ts. Reads the fixture directory and re-derives every verdict.

Used by generate.py to prove the planted set is exactly what the kernel flags, and by the tests.
Rules are copied, not simplified: thresholds, integer arithmetic and tie-breaks match the TypeScript.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import simcal as cal
from geo import haversine

T = {"LOCATION_MILES": 25, "PING_WINDOW_MIN": 30, "TANK_FACTOR": 1.1, "TOLL_DUP_MIN": 10, "RATE_VARIANCE": 0.05,
     "INVOICE_DUP_DAYS": 30, "BANK_CHANGE_DAYS": 7, "BANK_CHANGE_MIN_CENTS": 500_000,
     "AUTO_PAY_MAX_CENTS": 250_000, "AUTO_PAY_DAY_MAX_CENTS": 4_000_000}


def load_rows(path: Path) -> list[dict]:
    if path.suffix == ".jsonl":
        with path.open() as f:
            return [json.loads(line) for line in f if line.strip()]
    return json.loads(path.read_text())


def load_table(fixtures: Path, name: str) -> list[dict]:
    for ext in (".json", ".jsonl"):
        p = fixtures / f"{name}{ext}"
        if p.exists():
            return load_rows(p)
    raise FileNotFoundError(name)


def nearest_ping(pings: list[tuple[int, dict]], at_micros: int, window_min: int):
    window = window_min * 60_000_000
    best = None
    for micros, p in pings:
        delta = abs(micros - at_micros)
        if delta > window:
            continue
        delta_min = delta // 60_000_000
        if best is None or delta_min < best[1]:
            best = (p, delta_min)
    return best


def evaluate_card(txn: dict, truck: dict | None, pings: list[tuple[int, dict]]) -> tuple[str, dict]:
    if truck is None:
        return "location_mismatch", {"reason": "card not assigned to a truck"}
    capacity_limit = truck["tankGal"] * T["TANK_FACTOR"]
    if txn["gallons"] > capacity_limit:
        return "capacity_exceeded", {"tankGal": truck["tankGal"], "capacityLimitGal": round(capacity_limit, 1)}
    near = nearest_ping(pings, cal.iso_to_micros(txn["at"]), T["PING_WINDOW_MIN"])
    if near is None:
        return "location_mismatch", {"nearestPing": None, "reason": "no ping within 30 minutes"}
    p, delta_min = near
    miles = haversine(p["lat"], p["lon"], txn["stationLat"], txn["stationLon"])
    ev = {"distanceMiles": round(miles, 1), "deltaMin": delta_min, "engineOn": p["engineOn"]}
    if miles > T["LOCATION_MILES"]:
        return "location_mismatch", ev
    return "matched", ev


def evaluate_toll(txn: dict, at_micros: int, earlier: list[tuple[int, dict]]) -> tuple[str, dict]:
    window = T["TOLL_DUP_MIN"] * 60_000_000
    for e_micros, e in earlier:
        if e["id"] == txn["id"] or e["plazaId"] != txn["plazaId"]:
            continue
        delta = at_micros - e_micros
        if 0 <= delta <= window:
            return "duplicate_toll", {"duplicateOf": e["id"], "minutesApart": delta // 60_000_000}
    return "matched", {}


def evaluate_invoice(inv: dict, po: dict | None, contract: dict | None, vendor: dict | None, earlier: list[dict]) -> tuple[str, dict]:
    if inv.get("poId") is not None:
        if po is None or po["vendorId"] != inv["vendorId"] or po["item"] != inv["item"]:
            return "po_mismatch", {"poId": inv["poId"]}
    if vendor is not None and inv["cents"] > T["BANK_CHANGE_MIN_CENTS"]:
        since = inv["receivedDay"] - vendor["bankChangedDay"]
        if vendor["bankChangedDay"] > 0 and 0 <= since <= T["BANK_CHANGE_DAYS"]:
            return "vendor_bank_change", {"bankChangedDay": vendor["bankChangedDay"], "daysSinceChange": since}
    for e in earlier:
        if e["id"] == inv["id"]:
            continue
        apart = inv["receivedDay"] - e["receivedDay"]
        if e["cents"] == inv["cents"] and (e.get("poId") or "") != (inv.get("poId") or "") and 0 <= apart <= T["INVOICE_DUP_DAYS"]:
            return "duplicate_invoice", {"duplicateOf": e["id"], "daysApart": apart}
    if po is not None:
        if contract is not None:
            limit = (contract["rateCents"] * round((1 + T["RATE_VARIANCE"]) * 10_000)) // 10_000
            if inv["unitCents"] > limit:
                return "rate_variance", {"contractId": contract["id"], "contractRateCents": contract["rateCents"], "allowedUnitCents": limit}
        if inv["qty"] > po["receivedQty"]:
            return "short_received", {"poQty": po["qty"], "receivedQty": po["receivedQty"],
                                      "proposedPartialCents": round(po["receivedQty"]) * inv["unitCents"]}
    return "matched", {}


def auto_pay_decision(cents: int, day_auto_paid: int) -> str:
    if cents > T["AUTO_PAY_MAX_CENTS"]:
        return "limit"
    if day_auto_paid + cents > T["AUTO_PAY_DAY_MAX_CENTS"]:
        return "limit"
    return "pay"


def run(fixtures: Path) -> dict:
    trucks = {t["id"]: t for t in load_table(fixtures, "trucks")}
    trucks_by_card = {t["fuelCardId"]: t for t in trucks.values()}
    pings_by_truck: dict[int, list[tuple[int, dict]]] = {}
    for p in load_table(fixtures, "trip_pings"):
        pings_by_truck.setdefault(p["truckId"], []).append((cal.iso_to_micros(p["at"]), p))
    verdicts: dict[str, tuple[str, dict, int, int]] = {}  # txnRef -> (code, evidence, day, cents)

    for txn in load_table(fixtures, "card_txns"):
        truck = trucks_by_card.get(txn["cardId"])
        assert truck is not None and truck["id"] == txn["truckId"], txn["id"]
        code, ev = evaluate_card(txn, truck, pings_by_truck.get(txn["truckId"], []))
        verdicts[txn["id"]] = (code, ev, txn["day"], txn["cents"])

    tolls = load_table(fixtures, "toll_txns")
    tolls_sorted = sorted(((cal.iso_to_micros(t["at"]), t) for t in tolls), key=lambda x: (x[0], x[1]["id"]))
    seen_by_plate: dict[str, list[tuple[int, dict]]] = {}
    for micros, t in tolls_sorted:
        earlier = seen_by_plate.setdefault(t["plate"], [])
        code, ev = evaluate_toll(t, micros, earlier)
        verdicts[t["id"]] = (code, ev, t["day"], t["cents"])
        earlier.append((micros, t))

    vendors = {v["id"]: v for v in load_table(fixtures, "vendors")}
    contracts = load_table(fixtures, "contracts")
    pos = {p["id"]: p for p in load_table(fixtures, "pos")}
    invoices = sorted(load_table(fixtures, "invoices"), key=lambda i: (i["receivedDay"], i["id"]))
    seen_by_vendor: dict[int, list[dict]] = {}
    for inv in invoices:
        po = pos.get(inv["poId"]) if inv.get("poId") is not None else None
        contract = next((c for c in contracts if c["vendorId"] == inv["vendorId"] and c["item"] == inv["item"]
                         and c["validFromDay"] <= inv["receivedDay"] <= c["validToDay"]), None)
        earlier = seen_by_vendor.setdefault(inv["vendorId"], [])
        code, ev = evaluate_invoice(inv, po, contract, vendors.get(inv["vendorId"]), earlier)
        verdicts[inv["id"]] = (code, ev, inv["receivedDay"], inv["cents"])
        earlier.append(inv)

    # auto-pay limits over clean rows, in id order within each day
    day_paid: dict[int, int] = {}
    day_total: dict[int, int] = {}
    limits: list[str] = []
    for ref in sorted(verdicts, key=lambda r: (verdicts[r][2], r)):
        code, _, day, cents = verdicts[ref]
        if code != "matched":
            continue
        day_total[day] = day_total.get(day, 0) + cents
        if auto_pay_decision(cents, day_paid.get(day, 0)) == "limit":
            limits.append(ref)
        else:
            day_paid[day] = day_paid.get(day, 0) + cents
    flagged = {ref: v[0] for ref, v in verdicts.items() if v[0] != "matched"}
    return {"flagged": flagged, "limits": limits, "day_auto_paid": day_paid, "day_clean_total": day_total, "n": len(verdicts)}


def compare_with_key(result: dict, key_rows: list[dict]) -> None:
    expected = {r["txnRef"]: r["code"] for r in key_rows}
    flagged = result["flagged"]
    extra = sorted(set(flagged) - set(expected))
    missing = sorted(set(expected) - set(flagged))
    wrong = sorted(r for r in expected if r in flagged and flagged[r] != expected[r])
    if extra or missing or wrong:
        raise AssertionError(f"mirror disagrees with answer key: extra={extra[:20]} missing={missing[:20]} wrong={wrong[:20]}")


if __name__ == "__main__":
    fx = Path(sys.argv[1] if len(sys.argv) > 1 else "fixtures")
    res = run(fx)
    key = json.loads((fx / "answer_key.json").read_text())
    compare_with_key(res, key)
    by_code: dict[str, int] = {}
    for code in res["flagged"].values():
        by_code[code] = by_code.get(code, 0) + 1
    decoys = sum(1 for r in key if r["expected"] == "clear_after_question")
    print(f"rows evaluated: {res['n']}")
    print(f"flagged: {len(res['flagged'])} = {len(key) - decoys} planted + {decoys} decoys; by code {dict(sorted(by_code.items()))}")
    print(f"limit policy holds: {len(res['limits'])} {res['limits']}")
    print(f"max auto-paid cents in a day: {max(res['day_auto_paid'].values())}")
