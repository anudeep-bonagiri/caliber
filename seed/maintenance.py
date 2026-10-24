"""Vendors' side of the ledger: contracts, purchase orders, invoices, and the invoice plants.

Rules the data must satisfy under the kernel:
  rate_variance    unitCents > contract rate * 10500 // 10000 on receivedDay, PO present
  short_received   invoice qty > po.receivedQty
  duplicate_invoice same vendor, same cents, different poId, 0..30 days after an earlier invoice
  vendor_bank_change cents > 500000 and 0 <= receivedDay - bankChangedDay <= 7
  po_mismatch      poId missing, other vendor, or other item (never planted; must never happen)
Every other invoice is clean by construction and (vendor, cents) is unique across different poIds.
"""
from __future__ import annotations

import random
from dataclasses import dataclass

import simcal as cal
from company import Company, VENDOR_REGION
from plant import COUNTS, DECOY1

ITEMS = ["tire_replacement", "oil_service", "brake_job", "dpf_clean", "alignment", "ac_service"]
ITEM_LABEL = {"tire_replacement": "Tire replacement (drive, per tire)", "oil_service": "Oil and filter service",
              "brake_job": "Brake job (per axle)", "dpf_clean": "DPF clean and bake", "alignment": "Three-axle alignment",
              "ac_service": "Cab A/C service"}
BASE_RATES = {
    1: {"tire_replacement": 54500, "oil_service": 31500, "brake_job": 128000, "dpf_clean": 46500, "alignment": 24500, "ac_service": 38500},
    2: {"tire_replacement": 51900, "oil_service": 33900, "brake_job": 135500, "dpf_clean": 49900, "alignment": 26900},
    3: {"tire_replacement": 56800, "oil_service": 32900, "brake_job": 245000, "dpf_clean": 52500, "ac_service": 41900},
    4: {"tire_replacement": 53200, "oil_service": 34500, "brake_job": 139500, "dpf_clean": 48800, "alignment": 27500, "ac_service": 44200},
    5: {"tire_replacement": 49800, "oil_service": 29900, "brake_job": 119000, "dpf_clean": 45900, "alignment": 23900, "ac_service": 36800},
}
# (vendor, item, first day of the new rate, multiplier). Increases only, so old PO prices stay inside tolerance.
ROLLOVERS = [(1, "oil_service", 45, 1.04), (2, "brake_job", 50, 1.03), (3, "tire_replacement", 60, 1.05),
             (4, "dpf_clean", 35, 1.06), (5, "tire_replacement", 62, 1.02), (4, "ac_service", 70, 1.03)]
# Standing POs per vendor: (item, qty). Pairs with the same item give the duplicate plants a second real PO.
STANDING = {
    1: [("tire_replacement", 2), ("tire_replacement", 4), ("oil_service", 1), ("dpf_clean", 1)],
    2: [("tire_replacement", 4), ("oil_service", 1), ("oil_service", 2), ("brake_job", 1)],
    3: [("tire_replacement", 2), ("oil_service", 1), ("brake_job", 1), ("dpf_clean", 1), ("dpf_clean", 2)],
    4: [("tire_replacement", 3), ("oil_service", 1), ("brake_job", 2), ("dpf_clean", 1)],
    5: [("tire_replacement", 2), ("oil_service", 1), ("brake_job", 1), ("ac_service", 1), ("ac_service", 2)],
}
SHORT = [(2, "tire_replacement", 4, 3), (4, "dpf_clean", 2, 1), (1, "alignment", 2, 1), (5, "tire_replacement", 3, 2), (3, "ac_service", 2, 1)]
BANK = [  # vendor, item, qty, bankChangedDay (vendor 3 is INV-1077 from the brief)
    (3, "brake_job", 4, 42), (1, "tire_replacement", 10, 18), (5, "dpf_clean", 12, 71)]
NON_PO_ITEMS = ["shop_supplies", "filters", "coolant", "wiper_blades", "def_fluid", "shop_labor"]
FEES = [1250, 1875, 2450, 3125, 3750, 4500]
TOTAL_INVOICES = 180
NON_PO_COUNT = 25
FIXED_BANK_INVOICE = {"id": "INV-1077", "day": 44, "cents": 980000, "unitCents": 245000}
CLAUSES = {
    "tire_replacement": "Vendor supplies and mounts new drive tires of the contracted brand and ply rating at the unit rate, casings returned to the carrier on request. Pricing is firm for the term; any surcharge requires written approval from the carrier's maintenance manager before the work order is opened.",
    "oil_service": "Each service includes engine oil, all filters, chassis lube and a 40-point inspection at the unit rate. Vendor invoices against the standing purchase order within five business days of completion and attaches the inspection sheet.",
    "brake_job": "Rate covers pads, drums or rotors, hardware and labor for one axle, with wheel-end inspection included. Work beyond the axle count on the purchase order needs a change order before the truck leaves the shop.",
    "dpf_clean": "Rate covers removal, thermal bake, flow test and reinstallation of one diesel particulate filter. Filters that fail the flow test are quoted separately and the carrier may decline the replacement.",
    "alignment": "Rate covers a three-axle laser alignment with a printed before-and-after report. Vendor does not replace steering components without a separate purchase order.",
    "ac_service": "Rate covers evacuation, leak test, recharge and cabin filter for one tractor. Compressor or condenser replacement is quoted and ordered separately.",
}


@dataclass
class Contract:
    id: int
    vendorId: int
    item: str
    rateCents: int
    validFromDay: int
    validToDay: int
    clause: str


def build_contracts() -> list[Contract]:
    out: list[Contract] = []
    roll = {(v, i): (d, m) for v, i, d, m in ROLLOVERS}
    cid = 0
    for v in sorted(BASE_RATES):
        for item in ITEMS:
            if item not in BASE_RATES[v]:
                continue
            rate = BASE_RATES[v][item]
            if (v, item) in roll:
                day, mult = roll[(v, item)]
                new_rate = int(round(rate * mult / 100.0)) * 100
                cid += 1
                out.append(Contract(cid, v, item, rate, 1, day - 1, CLAUSES[item]))
                cid += 1
                out.append(Contract(cid, v, item, new_rate, day, cal.TOTAL_DAYS, CLAUSES[item]))
            else:
                cid += 1
                out.append(Contract(cid, v, item, rate, 1, cal.TOTAL_DAYS, CLAUSES[item]))
    return out


def contract_on(contracts: list[Contract], vendor: int, item: str, day: int) -> Contract | None:
    for c in contracts:
        if c.vendorId == vendor and c.item == item and c.validFromDay <= day <= c.validToDay:
            return c
    return None


def _truck_for_vendor(rng: random.Random, company: Company, vendor: int) -> int:
    pool = [t.id for t in company.trucks if t.terminalId in VENDOR_REGION[vendor]]
    return rng.choice(pool)


def build_maintenance(seed: int, company: Company, decoy_po_truck: int = DECOY1["card_truck"]):
    """Returns (contracts, pos, invoices, answer_key_rows, info). Ids are assigned here."""
    rng = random.Random(f"{seed}:maintenance")
    contracts = build_contracts()
    vendors = {v.id: v for v in company.vendors}
    for v, _, _, bcd in BANK:
        vendors[v].bankChangedDay = bcd

    pos: list[dict] = []  # without ids yet
    invs: list[dict] = []

    def add_po(vendor, truck, item, qty, issued, received_qty=None, tag="standing"):
        unit = contract_on(contracts, vendor, item, issued).rateCents
        po = {"vendorId": vendor, "truckId": truck, "item": item, "qty": qty, "unitCents": unit,
              "receivedQty": qty if received_qty is None else received_qty, "issuedDay": issued, "_tag": tag, "_seq": len(pos)}
        pos.append(po)
        return po

    def add_inv(po, day, qty=None, unit=None, fee=None, tag="clean", vendor=None, item=None):
        vendor = po["vendorId"] if po else vendor
        item = po["item"] if po else item
        qty = (po["qty"] if po else 1) if qty is None else qty
        unit = (po["unitCents"] if po else unit) if unit is None else unit
        if fee is None:
            fee = 0 if rng.random() < 0.6 else rng.choice(FEES)
        inv = {"vendorId": vendor, "_po": po, "receivedDay": day, "item": item, "qty": qty, "unitCents": unit,
               "_fee": fee, "cents": qty * unit + fee, "_tag": tag, "_seq": len(invs)}
        invs.append(inv)
        return inv

    # ---- standing POs and their invoices
    standing: list[dict] = []
    for v in sorted(STANDING):
        for item, qty in STANDING[v]:
            standing.append(add_po(v, _truck_for_vendor(rng, company, v), item, qty, rng.randint(1, 8)))
    n_standing_inv = TOTAL_INVOICES - NON_PO_COUNT - len(BANK) - len(SHORT) - COUNTS["duplicate_invoice"]
    per_po = [n_standing_inv // len(standing)] * len(standing)
    for i in range(n_standing_inv - sum(per_po)):
        per_po[i] += 1
    for po, k in zip(standing, per_po):
        days = sorted(rng.sample(range(po["issuedDay"] + 2, cal.TOTAL_DAYS + 1), k))
        for d in days:
            add_inv(po, d)

    # ---- short receipts: one invoice each, full quantity billed
    for v, item, qty, recv in SHORT:
        day = rng.randint(6, cal.TOTAL_DAYS)
        po = add_po(v, _truck_for_vendor(rng, company, v), item, qty, max(1, day - rng.randint(3, 10)), recv, "short")
        add_inv(po, day, fee=0, tag="short_received")

    # ---- vendor bank changes: one large invoice each, 1..6 days after the change
    for v, item, qty, bcd in BANK:
        if v == 3:
            day, issued, truck = FIXED_BANK_INVOICE["day"], 40, decoy_po_truck
        else:
            day = bcd + rng.randint(1, 6)
            issued = day - rng.randint(2, 5)
            truck = _truck_for_vendor(rng, company, v)
        po = add_po(v, truck, item, qty, issued, tag="bank")
        inv = add_inv(po, day, fee=0, tag="vendor_bank_change")
        assert inv["cents"] > 500_000, inv
        if v == 3:
            assert inv["cents"] == FIXED_BANK_INVOICE["cents"] and inv["unitCents"] == FIXED_BANK_INVOICE["unitCents"]

    # ---- rate variances: nine standing invoices priced 8 to 30 percent above the contract on receivedDay
    candidates = [i for i in invs if i["_tag"] == "clean"]
    rng.shuffle(candidates)
    used_po, used_week = set(), set()
    n = 0
    for inv in candidates:
        if n == COUNTS["rate_variance"]:
            break
        po = inv["_po"]
        w = cal.week_of(inv["receivedDay"])
        if id(po) in used_po or w in used_week:
            continue
        rate = contract_on(contracts, inv["vendorId"], inv["item"], inv["receivedDay"]).rateCents
        unit = int(rate * rng.uniform(1.08, 1.30)) // 25 * 25
        assert unit > rate * 10500 // 10000
        inv["unitCents"] = unit
        inv["cents"] = inv["qty"] * unit + inv["_fee"]
        inv["_tag"] = "rate_variance"
        used_po.add(id(po))
        used_week.add(w)
        n += 1
    assert n == COUNTS["rate_variance"]

    # ---- duplicate invoices: same vendor and amount under a second real PO for the same item
    candidates = [i for i in invs if i["_tag"] == "clean" and i["receivedDay"] <= cal.TOTAL_DAYS - 25]
    rng.shuffle(candidates)
    used_vendor = set()
    n = 0
    for inv in candidates:
        if n == COUNTS["duplicate_invoice"]:
            break
        v = inv["vendorId"]
        if v in used_vendor:
            continue
        others = [p for p in standing if p["vendorId"] == v and p["item"] == inv["item"] and p is not inv["_po"]]
        if not others:
            continue
        # the original's total must be unique for the vendor so its PO siblings never collide with the copy
        taken = {o["cents"] for o in invs if o is not inv and o["vendorId"] == v}
        while inv["qty"] * inv["unitCents"] + inv["_fee"] in taken:
            inv["_fee"] += 125
        inv["cents"] = inv["qty"] * inv["unitCents"] + inv["_fee"]
        dup = add_inv(others[0], inv["receivedDay"] + rng.randint(3, 25), qty=inv["qty"], unit=inv["unitCents"],
                      fee=inv["_fee"], tag="duplicate_invoice")
        dup["_dup_of"] = inv
        inv["_tag"] = "dup_original"
        used_vendor.add(v)
        n += 1
    assert n == COUNTS["duplicate_invoice"]

    # ---- invoices without a PO: small shop items
    for _ in range(NON_PO_COUNT):
        v = rng.randint(1, 5)
        add_inv(None, rng.randint(1, cal.TOTAL_DAYS), unit=rng.randint(2500, 39900), fee=0, vendor=v, item=rng.choice(NON_PO_ITEMS))

    # ---- make INV-1077 the 77th invoice: exactly 76 invoices must be received before day 44
    def rank_fix():
        before = [i for i in invs if i["receivedDay"] < 44]
        delta = len(before) - 76
        movable = [i for i in invs if i["_tag"] == "clean"]
        if delta > 0:
            movable = sorted([i for i in movable if i["receivedDay"] < 44], key=lambda i: (-i["receivedDay"], i["_seq"]))
            for i in movable[:delta]:
                i["receivedDay"] = rng.randint(45, cal.TOTAL_DAYS)
        elif delta < 0:
            movable = sorted([i for i in movable if i["receivedDay"] >= 44], key=lambda i: (i["receivedDay"], i["_seq"]))
            for i in movable[:-delta]:
                i["receivedDay"] = rng.randint(max(1, i["_po"]["issuedDay"] + 1), 43)
    rank_fix()
    assert len([i for i in invs if i["receivedDay"] < 44]) == 76

    # ---- uniqueness of (vendor, cents) across different POs, except the planted pairs
    def po_key(i):
        return i["_po"]["_seq"] if i["_po"] else -1

    def planted(i):
        return i["_tag"] in ("vendor_bank_change", "short_received", "dup_original", "duplicate_invoice")

    changed = True
    while changed:
        changed = False
        by: dict[tuple[int, int], list[dict]] = {}
        for i in invs:
            by.setdefault((i["vendorId"], i["cents"]), []).append(i)
        for group in by.values():
            if len({po_key(i) for i in group}) <= 1:
                continue
            anchor = next((i for i in group if planted(i)), group[0])
            for i in group:
                if i is anchor or i.get("_dup_of") is anchor or anchor.get("_dup_of") is i:
                    continue
                if planted(i):
                    raise RuntimeError(f"two planted invoices collide: {anchor['_tag']} and {i['_tag']}")
                i["_fee"] += 125
                i["cents"] = i["qty"] * i["unitCents"] + i["_fee"]
                changed = True

    # ---- bank windows hold nothing else above $5,000
    for v, _, _, bcd in BANK:
        for i in invs:
            if i["vendorId"] == v and bcd <= i["receivedDay"] <= bcd + 7 and i["_tag"] != "vendor_bank_change":
                assert i["cents"] <= 500_000, i

    # ---- ids: POs by issue day, invoices by received day (INV-1077 first on day 44)
    pos.sort(key=lambda p: (p["issuedDay"], p["vendorId"], p["_seq"]))
    for k, p in enumerate(pos):
        p["id"] = f"PO-{1001 + k}"
    invs.sort(key=lambda i: (i["receivedDay"], 0 if i["_tag"] == "vendor_bank_change" and i["vendorId"] == 3 else 1, i["vendorId"], i["_seq"]))
    for k, i in enumerate(invs):
        i["id"] = f"INV-{1001 + k}"
        i["poId"] = i["_po"]["id"] if i["_po"] else None
        i["docRef"] = f"evidence/invoices/{i['id']}.txt"
    fixed = next(i for i in invs if i["_tag"] == "vendor_bank_change" and i["vendorId"] == 3)
    assert fixed["id"] == FIXED_BANK_INVOICE["id"], fixed["id"]

    key: list[dict] = []
    for i in invs:
        v = vendors[i["vendorId"]]
        if i["_tag"] == "rate_variance":
            c = contract_on(contracts, i["vendorId"], i["item"], i["receivedDay"])
            pct = (i["unitCents"] - c.rateCents) / c.rateCents * 100
            key.append({"txnRef": i["id"], "code": "rate_variance", "expected": "hold",
                        "note": f"{i['item']} billed at {i['unitCents']} cents against contract {c.id} rate {c.rateCents} ({pct:.1f} percent over)"})
        elif i["_tag"] == "duplicate_invoice":
            o = i["_dup_of"]
            key.append({"txnRef": i["id"], "code": "duplicate_invoice", "expected": "hold",
                        "note": f"same vendor and amount as {o['id']} ({o['poId']}) {i['receivedDay'] - o['receivedDay']} days earlier, now under {i['poId']}"})
        elif i["_tag"] == "vendor_bank_change":
            key.append({"txnRef": i["id"], "code": "vendor_bank_change", "expected": "hold",
                        "note": f"{v.name} changed remit-to bank on day {v.bankChangedDay} (ending {v.previousBankLast4} to {v.bankLast4}); invoice of {i['cents']} cents received day {i['receivedDay']}"})
        elif i["_tag"] == "short_received":
            po = i["_po"]
            key.append({"txnRef": i["id"], "code": "short_received", "expected": "hold",
                        "note": f"billed {i['qty']} but {po['id']} shows {po['receivedQty']} received; partial {po['receivedQty'] * i['unitCents']} cents"})
    info = {"fixed_bank_po": fixed["poId"]}
    return contracts, pos, invs, key, info
