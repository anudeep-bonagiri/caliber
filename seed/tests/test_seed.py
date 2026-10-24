"""Acceptance tests for the seed generator. `pytest seed/` from the repo root or `pytest` inside seed/."""
from __future__ import annotations

import filecmp
import importlib.util
import json
from pathlib import Path

import pytest

import generate
import geo
import mirror
import simcal

SEED_DIR = Path(__file__).resolve().parents[1]
FIXTURES = SEED_DIR / "fixtures"
TABLE_KEYS = {
    "terminals": ["id", "name", "lat", "lon"],
    "trucks": ["id", "plate", "tankGal", "fuelCardId", "terminalId"],
    "drivers": ["id", "name", "homeTerminal", "truckId"],
    "trip_pings": ["truckId", "day", "at", "lat", "lon", "odometer", "engineOn"],
    "card_txns": ["id", "cardId", "truckId", "driverId", "at", "day", "stationName", "stationLat", "stationLon", "gallons", "cents", "merchant"],
    "toll_txns": ["id", "plate", "truckId", "at", "day", "plazaId", "plazaName", "cents"],
    "vendors": ["id", "name", "bankLast4", "bankChangedDay"],
    "contracts": ["id", "vendorId", "item", "rateCents", "validFromDay", "validToDay", "clause"],
    "pos": ["id", "vendorId", "truckId", "item", "qty", "unitCents", "receivedQty", "issuedDay"],
    "invoices": ["id", "vendorId", "poId", "receivedDay", "item", "qty", "unitCents", "cents", "docRef"],
}
PLANTED = {"location_mismatch": 14, "capacity_exceeded": 6, "rate_variance": 9, "duplicate_toll": 11,
           "duplicate_invoice": 4, "vendor_bank_change": 3, "short_received": 5}


@pytest.fixture(scope="session")
def fx() -> dict:
    assert FIXTURES.exists(), "run `python generate.py --seed 42 --out fixtures` first"
    data = {name: mirror.load_table(FIXTURES, name) for name in TABLE_KEYS}
    data["answer_key"] = json.loads((FIXTURES / "answer_key.json").read_text())
    data["summary"] = json.loads((FIXTURES / "summary.json").read_text())
    return data


def load_calendar_file():
    """seed/calendar.py by path, under a private module name, so the stdlib module is untouched."""
    spec = importlib.util.spec_from_file_location("seed_calendar_under_test", SEED_DIR / "calendar.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# ---------------------------------------------------------------- calendar
@pytest.mark.parametrize("day,expected", [(1, "2026-07-01"), (2, "2026-07-02"), (3, "2026-07-03"), (4, "2026-07-06"),
                                          (23, "2026-07-31"), (41, "2026-08-26"), (44, "2026-08-31"), (92, "2026-11-05")])
def test_calendar_dates(day, expected):
    calmod = load_calendar_file()
    assert calmod.date_for_day(day).isoformat() == expected
    assert simcal.date_for_day(day).isoformat() == expected


def test_calendar_is_weekdays_only_and_matches_ts_algorithm():
    import datetime as dt
    # Re-run the TypeScript loop literally: walk day numbers since the epoch, skip Saturday and Sunday.
    start = dt.date(2026, 7, 1).toordinal()
    previous = None
    for day in range(1, 93):
        remaining, ordinal = day, start - 1
        while remaining > 0:
            ordinal += 1
            if dt.date.fromordinal(ordinal).isoweekday() not in (6, 7):
                remaining -= 1
        expected = dt.date.fromordinal(ordinal)
        got = simcal.date_for_day(day)
        assert got == expected
        assert got.weekday() < 5
        assert previous is None or got > previous
        previous = got
    assert simcal.micros_for_day(1) == 1782864000 * 1_000_000  # 2026-07-01T00:00:00Z
    assert simcal.micros_for_day(41, 13, 5) == simcal.iso_to_micros("2026-08-26T13:05:00Z")
    assert simcal.date_for_day(0).isoformat() == "2026-07-01"


# ---------------------------------------------------------------- shape and counts
def test_tables_have_contract_keys(fx):
    for name, keys in TABLE_KEYS.items():
        assert fx[name], name
        for row in fx[name][:50]:
            assert list(sorted(row)) == sorted(keys), (name, row)


def test_counts(fx):
    assert len(fx["terminals"]) == 6
    assert len(fx["trucks"]) == 40 and [t["id"] for t in fx["trucks"]] == list(range(1, 41))
    assert len(fx["drivers"]) == 48 and sum(1 for d in fx["drivers"] if d["truckId"] == 0) == 8
    assert len(fx["vendors"]) == 5 and len(fx["pos"]) == 30 and len(fx["invoices"]) == 180
    assert 5000 <= len(fx["card_txns"]) <= 6000
    assert 1800 <= len(fx["toll_txns"]) <= 2400
    assert len(fx["trip_pings"]) < 160_000
    assert sum(1 for i in fx["invoices"] if i["poId"] is None) == 25
    assert fx["summary"]["counts"]["card_txns"] == len(fx["card_txns"])


def test_company_facts(fx):
    trucks = {t["id"]: t for t in fx["trucks"]}
    assert trucks[17]["plate"] == "TX-1017" and trucks[17]["fuelCardId"] == "FC-1017"
    assert all(t["tankGal"] in (100, 120, 150, 200, 250, 300) for t in trucks.values())
    assert len({t["fuelCardId"] for t in trucks.values()}) == 40
    d23 = next(d for d in fx["drivers"] if d["id"] == 23)
    assert d23["name"] == "Ramon Ortiz" and d23["truckId"] == 17
    assert [p["id"] for p in fx["pos"]] == [f"PO-{1001 + i}" for i in range(30)]
    assert [i["id"] for i in fx["invoices"]] == [f"INV-{1001 + i}" for i in range(180)]


def test_ids_are_chronological(fx):
    cards = [c for c in fx["card_txns"] if c["id"] != "2231"]
    assert [c["id"] for c in cards] == sorted((c["id"] for c in cards), key=int)
    assert all(a["at"] <= b["at"] for a, b in zip(cards, cards[1:]))
    tolls = fx["toll_txns"]
    assert all(a["at"] <= b["at"] for a, b in zip(tolls, tolls[1:]))
    assert tolls[0]["id"] == "T1001"


def test_physical_bounds(fx):
    trucks = {t["id"]: t for t in fx["trucks"]}
    capacity_refs = {r["txnRef"] for r in fx["answer_key"] if r["code"] == "capacity_exceeded"}
    for c in fx["card_txns"]:
        tank = trucks[c["truckId"]]["tankGal"]
        if c["id"] in capacity_refs:
            assert 1.15 * tank <= c["gallons"] <= 1.6 * tank
        else:
            assert 10 <= c["gallons"] <= tank
        price = c["cents"] / 100 / c["gallons"]
        assert 3.19 <= price <= 3.91
        assert trucks[c["truckId"]]["fuelCardId"] == c["cardId"]
    for t in fx["toll_txns"]:
        assert 425 <= t["cents"] <= 1850
    pings_by_truck: dict[int, list] = {}
    for p in fx["trip_pings"]:
        pings_by_truck.setdefault(p["truckId"], []).append(p)
    for tid, rows in pings_by_truck.items():
        odos = [r["odometer"] for r in rows]
        assert odos == sorted(odos), tid


# ---------------------------------------------------------------- answer key and plants
def test_answer_key_counts(fx):
    key = fx["answer_key"]
    assert len(key) == 58
    by = {}
    for r in key:
        by[(r["code"], r["expected"])] = by.get((r["code"], r["expected"]), 0) + 1
    for code, n in PLANTED.items():
        if code == "vendor_bank_change":
            # D-3: one bank-change vendor carries a hit in its fixture and is expected to be rejected
            assert by[(code, "hold")] == n - 1 and by[(code, "reject")] == 1, code
            continue
        expected = "auto_reject" if code == "duplicate_toll" else "hold"
        assert by[(code, expected)] == n, code
    assert by[("location_mismatch", "clear_after_question")] == 6
    assert len({r["txnRef"] for r in key}) == 58
    assert all(set(r) == {"txnRef", "code", "expected", "note"} for r in key)


def test_fixed_decoy_2231(fx):
    c = next(c for c in fx["card_txns"] if c["id"] == "2231")
    assert c["day"] == 41 and c["cardId"] == "FC-1017" and c["truckId"] == 17 and c["driverId"] == 23
    assert c["stationName"] == "Love's 412, Schulenburg TX" and c["gallons"] == 120.0 and c["cents"] == 41200
    at = simcal.iso_to_micros(c["at"])
    p22 = [p for p in fx["trip_pings"] if p["truckId"] == 22 and p["day"] == 41]
    assert any(abs(simcal.iso_to_micros(p["at"]) - at) <= 10 * 60_000_000
               and geo.haversine(p["lat"], p["lon"], c["stationLat"], c["stationLon"]) <= 0.5 for p in p22)
    p17 = [p for p in fx["trip_pings"] if p["truckId"] == 17 and p["day"] == 41]
    assert p17 and not any(p["engineOn"] for p in p17)
    assert 90 <= geo.haversine(p17[0]["lat"], p17[0]["lon"], c["stationLat"], c["stationLon"]) <= 100
    row = next(r for r in fx["answer_key"] if r["txnRef"] == "2231")
    assert row["code"] == "location_mismatch" and row["expected"] == "clear_after_question"
    log = (FIXTURES / "evidence" / "swap_log.txt").read_text()
    assert "Ortiz" in log and "22" in log and "brake job" in log


def test_fixed_bank_change_invoice(fx):
    inv = next(i for i in fx["invoices"] if i["id"] == "INV-1077")
    assert inv["vendorId"] == 3 and inv["cents"] == 980000 and inv["receivedDay"] == 44 and inv["item"] == "brake_job"
    assert inv["poId"] is not None
    vendor = next(v for v in fx["vendors"] if v["id"] == 3)
    assert vendor["bankChangedDay"] == 42
    row = next(r for r in fx["answer_key"] if r["txnRef"] == "INV-1077")
    assert row["code"] == "vendor_bank_change" and row["expected"] == "hold"


def test_bank_change_hit_vendor(fx):
    # D-3: vendor 1 (Alamo Fleet Service) is the hit vendor; its bank-change invoice is expected to be rejected and
    # the hand-authored fixtures tell a coherent story: clean first invoice, judgment filed before the bank change.
    rows = [r for r in fx["answer_key"] if r["code"] == "vendor_bank_change"]
    hits = [r for r in rows if r["expected"] == "reject"]
    assert len(hits) == 1 and hits[0]["txnRef"] == "INV-1032" and "judgment" in hits[0]["note"]
    inv = next(i for i in fx["invoices"] if i["id"] == "INV-1032")
    vendor = next(v for v in fx["vendors"] if v["id"] == inv["vendorId"])
    assert vendor["id"] == 1 and vendor["bankChangedDay"] == 18 and inv["receivedDay"] == 19
    first = min(i["receivedDay"] for i in fx["invoices"] if i["vendorId"] == 1)
    vc = FIXTURES / "vendor_checks"
    hit = json.loads((vc / "1.bank_change.json").read_text())
    clean = json.loads((vc / "1.json").read_text())
    assert hit["recorded"] is False and clean["recorded"] is False
    assert "hand-authored" in hit["note"] and "CRS sandbox pending" in hit["note"]
    import datetime
    filed = datetime.date.fromisoformat(hit["responses"]["public_records"]["judgments"][0]["filedDate"])
    assert simcal.date_for_day(first) < filed < simcal.date_for_day(vendor["bankChangedDay"])
    assert clean["responses"]["public_records"]["judgments"] == [] and clean["responses"]["ofac"]["result"] == "NO_MATCH"
    for name in ("3.json", "5.json"):
        f = json.loads((vc / name).read_text())
        assert f["recorded"] is False and f["responses"]["ofac"]["matches"] == [] and f["responses"]["public_records"]["judgments"] == []
    assert not (vc / "3.hit.json").exists()


def test_location_mismatch_constraints(fx):
    cards = {c["id"]: c for c in fx["card_txns"]}
    lm = [cards[r["txnRef"]] for r in fx["answer_key"] if r["code"] == "location_mismatch" and r["expected"] == "hold"]
    decoys = [cards[r["txnRef"]] for r in fx["answer_key"] if r["expected"] == "clear_after_question"]
    assert all(c["driverId"] != 23 for c in lm)
    assert all(not (39 <= c["day"] <= 47) for c in lm)
    assert len({c["driverId"] for c in lm}) == 14
    lm_pairs = {(c["driverId"], simcal.week_of(c["day"])) for c in lm}
    assert not any((c["driverId"], simcal.week_of(c["day"])) in lm_pairs for c in decoys)


def test_every_planted_ref_has_evidence(fx):
    ev = FIXTURES / "evidence"
    for r in fx["answer_key"]:
        ref = r["txnRef"]
        if ref.startswith("INV-"):
            assert (ev / "invoices" / f"{ref}.txt").exists(), ref
        elif ref.startswith("T"):
            assert (ev / "tolls" / f"{ref}.txt").exists(), ref
        else:
            assert (ev / "receipts" / f"{ref}.txt").exists(), ref
    assert len(list((ev / "receipts").glob("*.txt"))) == len(fx["card_txns"])
    assert len(list((ev / "telematics").glob("*.csv"))) == 92
    assert len(list((ev / "contracts").glob("*.txt"))) == len(fx["contracts"])
    total = sum(p.stat().st_size for p in ev.rglob("*") if p.is_file())
    assert total < 60 * 1024 * 1024


def test_mirror_agrees_with_key(fx):
    res = mirror.run(FIXTURES)
    mirror.compare_with_key(res, fx["answer_key"])
    assert len(res["flagged"]) == 58
    assert len(res["limits"]) < 15
    assert max(res["day_auto_paid"].values()) < 4_000_000
    assert fx["summary"]["limit_holds"] == len(res["limits"])
    assert "po_mismatch" not in res["flagged"].values()


# ---------------------------------------------------------------- determinism
def test_generate_twice_is_byte_identical(tmp_path):
    a, b = tmp_path / "a", tmp_path / "b"
    generate.generate(42, a)
    generate.generate(42, b)
    files_a = sorted(p.relative_to(a) for p in a.rglob("*") if p.is_file())
    files_b = sorted(p.relative_to(b) for p in b.rglob("*") if p.is_file())
    assert files_a == files_b and files_a
    for rel in files_a:
        assert filecmp.cmp(a / rel, b / rel, shallow=False), rel
    # and matches the committed fixtures for every file the generator owns
    for rel in files_a:
        assert filecmp.cmp(a / rel, FIXTURES / rel, shallow=False), rel


# ---------------------------------------------------------------- kernel edge cases the coordinator asked for
def test_no_accidental_duplicate_invoice_within_30_days(fx):
    """Kernel rule: every invoice is compared with ALL earlier same-vendor invoices (smaller receivedDay, or same
    day and smaller id). Only the four planted copies may repeat (vendor, cents) under a different poId."""
    planted = {r["txnRef"] for r in fx["answer_key"] if r["code"] == "duplicate_invoice"}
    inv = sorted(fx["invoices"], key=lambda i: (i["receivedDay"], i["id"]))
    collisions = []
    for k, i in enumerate(inv):
        for e in inv[:k]:
            if (e["vendorId"] == i["vendorId"] and e["cents"] == i["cents"]
                    and (e["poId"] or "") != (i["poId"] or "") and 0 <= i["receivedDay"] - e["receivedDay"] <= 30):
                collisions.append(i["id"])
    assert sorted(set(collisions)) == sorted(planted)


def test_no_accidental_duplicate_toll(fx):
    planted = {r["txnRef"] for r in fx["answer_key"] if r["code"] == "duplicate_toll"}
    clean = sorted((t for t in fx["toll_txns"] if t["id"] not in planted), key=lambda t: (t["plate"], t["plazaId"], t["at"]))
    for a, b in zip(clean, clean[1:]):
        if a["plate"] == b["plate"] and a["plazaId"] == b["plazaId"]:
            assert simcal.iso_to_micros(b["at"]) - simcal.iso_to_micros(a["at"]) > 10 * 60_000_000, (a["id"], b["id"])


def test_po_references_are_consistent(fx):
    pos = {p["id"]: p for p in fx["pos"]}
    for i in fx["invoices"]:
        if i["poId"] is None:
            continue
        po = pos[i["poId"]]
        assert po["vendorId"] == i["vendorId"] and po["item"] == i["item"], i["id"]
