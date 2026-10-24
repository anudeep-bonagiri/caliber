"""Dispatch Ledger synthetic company. `python generate.py --seed 42 --out fixtures`.

Writes every file listed in docs/CONTRACT.md "Fixture files" except investigations/, then runs the
kernel mirror over the output and refuses to finish unless the flagged set equals the answer key.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import simcal as cal  # noqa: E402
import mirror  # noqa: E402
import plant  # noqa: E402
from company import build_company  # noqa: E402
from maintenance import build_maintenance  # noqa: E402
from connectors import write_inbox  # noqa: E402
from render_docs import render_all  # noqa: E402
from sim import simulate  # noqa: E402

PINGS_JSONL_THRESHOLD_BYTES = 40 * 1024 * 1024
MAX_DAY_AUTO_PAID_CENTS = 3_500_000


def dump(path: Path, rows: list[dict], compact_rows: bool = False) -> None:
    if compact_rows:
        body = ",\n".join(json.dumps(r, sort_keys=True, separators=(",", ":")) for r in rows)
        path.write_text("[\n" + body + "\n]\n")
    else:
        path.write_text(json.dumps(rows, sort_keys=True, indent=2) + "\n")


def public(row: dict, keys: list[str]) -> dict:
    out = {}
    for k in keys:
        v = row[k]
        if hasattr(v, "strftime"):
            v = cal.iso(v)
        out[k] = v
    return out


def generate(seed: int, out: Path) -> dict:
    out.mkdir(parents=True, exist_ok=True)
    company = build_company(seed)
    plan = plant.plan(seed, company)
    sim = simulate(seed, company, plan.constraints)
    cards, tolls, key = plant.apply_after_sim(seed, company, plan, sim)
    contracts, pos, invoices, inv_key, info = build_maintenance(seed, company)
    key += inv_key
    key.sort(key=lambda r: (r["code"], r["txnRef"]))

    # ---- fixture tables
    dump(out / "terminals.json", [{"id": t[0], "name": t[2], "lat": t[3], "lon": t[4]} for t in company.terminals])
    dump(out / "trucks.json", [{"id": t.id, "plate": t.plate, "tankGal": t.tankGal, "fuelCardId": t.fuelCardId, "terminalId": t.terminalId} for t in company.trucks])
    dump(out / "drivers.json", [{"id": d.id, "name": d.name, "homeTerminal": d.homeTerminal, "truckId": d.truckId} for d in company.drivers])
    ping_rows = [public(p, ["truckId", "day", "at", "lat", "lon", "odometer", "engineOn"]) for p in sim.pings]
    ping_body = "[\n" + ",\n".join(json.dumps(r, sort_keys=True, separators=(",", ":")) for r in ping_rows) + "\n]\n"
    for stale in ("trip_pings.json", "trip_pings.jsonl"):
        (out / stale).unlink(missing_ok=True)
    if len(ping_body) > PINGS_JSONL_THRESHOLD_BYTES:
        (out / "trip_pings.jsonl").write_text("".join(json.dumps(r, sort_keys=True, separators=(",", ":")) + "\n" for r in ping_rows))
    else:
        (out / "trip_pings.json").write_text(ping_body)
    card_keys = ["id", "cardId", "truckId", "driverId", "at", "day", "stationName", "stationLat", "stationLon", "gallons", "cents", "merchant"]
    card_rows = [public(x, card_keys) for x in cards]
    dump(out / "card_txns.json", card_rows, compact_rows=True)
    toll_rows = [public(t, ["id", "plate", "truckId", "at", "day", "plazaId", "plazaName", "cents"]) for t in tolls]
    dump(out / "toll_txns.json", toll_rows, compact_rows=True)
    dump(out / "vendors.json", [{"id": v.id, "name": v.name, "bankLast4": v.bankLast4, "bankChangedDay": v.bankChangedDay} for v in company.vendors])
    dump(out / "contracts.json", [{"id": c.id, "vendorId": c.vendorId, "item": c.item, "rateCents": c.rateCents, "validFromDay": c.validFromDay, "validToDay": c.validToDay, "clause": c.clause} for c in contracts])
    dump(out / "pos.json", [{k: p[k] for k in ["id", "vendorId", "truckId", "item", "qty", "unitCents", "receivedQty", "issuedDay"]} for p in pos])
    dump(out / "invoices.json", [{k: i[k] for k in ["id", "vendorId", "poId", "receivedDay", "item", "qty", "unitCents", "cents", "docRef"]} for i in invoices])
    dump(out / "answer_key.json", key)
    # Task 21: the same rows in connector format for the inbox file connector (docs/CONNECTORS.md)
    write_inbox(out, card_rows, toll_rows, invoices)

    # ---- evidence
    receipt_rows = [dict(r, _price=x["_price"]) for r, x in zip(card_rows, cards)]
    po_hint = {}
    for s in plan.swaps:
        if s.own_truck == plant.DECOY1["card_truck"]:
            po_hint[s.own_truck] = info["fixed_bank_po"]
    render_all(out, company, receipt_rows, toll_rows, ping_rows, contracts, pos, invoices, plan.swaps, po_hint)

    # ---- mirror: the kernel must flag exactly the key, nothing else
    res = mirror.run(out)
    mirror.compare_with_key(res, key)
    max_day = max(res["day_auto_paid"].values())
    assert max_day < MAX_DAY_AUTO_PAID_CENTS, f"heaviest day auto-pays {max_day} cents"
    assert len(res["limits"]) < 15, res["limits"]

    by_code: dict[str, int] = {}
    for r in key:
        by_code[r["code"]] = by_code.get(r["code"], 0) + (0 if r["expected"] == "clear_after_question" else 1)
    day_total: dict[int, int] = {}
    for rows in (card_rows, toll_rows):
        for r in rows:
            day_total[r["day"]] = day_total.get(r["day"], 0) + r["cents"]
    for i in invoices:
        day_total[i["receivedDay"]] = day_total.get(i["receivedDay"], 0) + i["cents"]
    summary = {
        "seed": seed,
        "counts": {"terminals": len(company.terminals), "trucks": len(company.trucks), "drivers": len(company.drivers),
                   "trip_pings": len(ping_rows), "card_txns": len(card_rows), "toll_txns": len(toll_rows),
                   "vendors": len(company.vendors), "contracts": len(contracts), "pos": len(pos), "invoices": len(invoices),
                   "answer_key_rows": len(key)},
        "planted": dict(sorted(by_code.items())),
        "decoys": sum(1 for r in key if r["expected"] == "clear_after_question"),
        "limit_holds": len(res["limits"]),
        "limit_hold_refs": res["limits"],
        "dollars_per_day": {"posted_min": round(min(day_total.values()) / 100, 2), "posted_max": round(max(day_total.values()) / 100, 2),
                            "auto_paid_min": round(min(res["day_auto_paid"].values()) / 100, 2),
                            "auto_paid_max": round(max_day / 100, 2), "auto_pay_day_cap": 40000.0},
        "trip_pings_file": "trip_pings.jsonl" if (out / "trip_pings.jsonl").exists() else "trip_pings.json",
        "calendar": {"day_1": cal.iso_date(1), "day_92": cal.iso_date(92), "decoy_day_41": cal.iso_date(41)},
    }
    (out / "summary.json").write_text(json.dumps(summary, sort_keys=True, indent=2) + "\n")
    return summary


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--out", default="fixtures")
    args = ap.parse_args()
    out = Path(args.out)
    if not out.is_absolute():
        out = HERE / out
    summary = generate(args.seed, out)
    print(json.dumps(summary, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
