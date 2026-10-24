"""Plants the fuel and toll exceptions and the truck-swap decoys. Invoice plants live in maintenance.py.

plan() runs before the simulator and returns the constraints the simulator must honour (which trucks sit
at home on which days, who drives which relief truck). apply_after_sim() adds the card and toll rows that
need finished pings, assigns ids and writes the answer-key rows for those classes.
"""
from __future__ import annotations

import datetime as dt
import random
from dataclasses import dataclass, field

import simcal as cal
import geo
from company import Company
from sim import Constraints, SimResult

COUNTS = {"location_mismatch": 14, "capacity_exceeded": 6, "rate_variance": 9, "duplicate_toll": 11,
          "duplicate_invoice": 4, "vendor_bank_change": 3, "short_received": 5, "decoy": 6}
QUIET_DAYS = set(range(39, 48))  # no planted location_mismatch here (demo window around day 41)
DECOY1 = {"id": "2231", "day": 41, "card_truck": 17, "driver": 23, "relief_truck": 22,
          "station": "Love's 412, Schulenburg TX", "gallons": 120.0, "price": 3.4333, "cents": 41200,
          "route": ("HOU", "round_trip"), "shop_until": 44, "reason": "brake job"}
SHOP_REASONS = ["dpf_clean", "alignment", "ac_service", "tire_replacement", "oil_service"]


@dataclass
class Swap:
    driver_id: int
    own_truck: int
    relief_truck: int
    d0: int
    d1: int
    decoy_day: int
    reason: str
    fixed_id: str | None = None
    station: str | None = None
    gallons: float | None = None
    price: float | None = None


@dataclass
class Plan:
    swaps: list[Swap]
    loc_mismatch: list[dict]
    constraints: Constraints
    used_trucks: set[int] = field(default_factory=set)


def _allowed_days_for_lm() -> list[int]:
    return [d for d in range(2, cal.TOTAL_DAYS + 1) if d not in QUIET_DAYS]


def plan(seed: int, company: Company) -> Plan:
    rng = random.Random(f"{seed}:plant")
    c = Constraints()
    swaps: list[Swap] = []
    used: set[int] = set()

    # ---- decoy 1, fixed by the brief
    d1 = DECOY1
    swaps.append(Swap(d1["driver"], d1["card_truck"], d1["relief_truck"], d1["day"], d1["shop_until"], d1["day"],
                      d1["reason"], d1["id"], d1["station"], d1["gallons"], d1["price"]))
    used |= {d1["card_truck"], d1["relief_truck"]}

    # ---- five more swaps: distinct terminals where possible, distinct weeks
    swap_weeks = {cal.week_of(d1["day"])}
    terminal_order = [1, 3, 4, 2, 5, 6]
    rng.shuffle(terminal_order)
    for term in terminal_order:
        if len(swaps) == COUNTS["decoy"]:
            break
        free = [t for t in company.trucks_at(term) if t.id not in used]
        if len(free) < 2:
            continue
        own, relief = rng.sample(free, 2)
        driver = company.driver_of_truck(own.id)
        for _ in range(200):
            d0 = rng.randint(3, cal.TOTAL_DAYS - 6)
            if cal.week_of(d0) not in swap_weeks and d0 not in QUIET_DAYS:
                break
        length = rng.randint(2, 5)
        d_end = min(cal.TOTAL_DAYS, d0 + length - 1)
        swap_weeks.add(cal.week_of(d0))
        swaps.append(Swap(driver.id, own.id, relief.id, d0, d_end, d0, rng.choice(SHOP_REASONS)))
        used |= {own.id, relief.id}
    assert len(swaps) == COUNTS["decoy"], len(swaps)

    for s in swaps:
        for d in range(s.d0, s.d1 + 1):
            c.force_inactive.add((s.own_truck, d))
            c.no_one_way.add((s.relief_truck, d))
            c.driver_override[(s.relief_truck, d)] = s.driver_id
        c.home_required.setdefault(s.own_truck, set()).add(s.d0)
        c.home_required.setdefault(s.relief_truck, set()).add(s.d0)
        c.force_active.add((s.relief_truck, s.decoy_day))
        stop = {"card_truck": s.own_truck, "driver": s.driver_id, "kind": "decoy", "fixed_id": s.fixed_id,
                "station": s.station, "gallons": s.gallons, "price": s.price}
        c.forced_stop[(s.relief_truck, s.decoy_day)] = stop
    c.force_route[(DECOY1["relief_truck"], DECOY1["day"])] = DECOY1["route"]

    # ---- 14 location mismatches: distinct trucks (so distinct drivers), distinct weeks, never driver 23
    swap_drivers = {s.driver_id for s in swaps}
    pool = [t for t in company.trucks if t.id not in used and company.driver_of_truck(t.id).id not in swap_drivers | {23}]
    rng.shuffle(pool)
    weeks_used: set[int] = set()
    lm: list[dict] = []
    allowed = _allowed_days_for_lm()
    for truck in pool:
        if len(lm) == COUNTS["location_mismatch"]:
            break
        for _ in range(300):
            day = rng.choice(allowed)
            if cal.week_of(day) not in weeks_used:
                break
        else:
            continue
        weeks_used.add(cal.week_of(day))
        home_lat, home_lon = geo.terminal_latlon(truck.code)
        far = [s for s in geo.STATIONS if 60.0 <= geo.haversine(home_lat, home_lon, s.lat, s.lon) <= 200.0]
        station = rng.choice(sorted(far, key=lambda s: s.name))
        minute = rng.randint(9, 17) * 60 + rng.randint(4, 26)
        lm.append({"truck": truck.id, "day": day, "minute": minute, "second": rng.randint(0, 59),
                   "station": station.name, "frac": round(rng.uniform(0.40, 0.95), 3)})
        c.force_inactive.add((truck.id, day))
        c.home_required.setdefault(truck.id, set()).add(day)
        used.add(truck.id)
    assert len(lm) == COUNTS["location_mismatch"]
    return Plan(swaps, lm, c, used)


def _nearest_ping(pings: list[dict], at: dt.datetime) -> dict | None:
    best = None
    for p in pings:
        delta = abs((p["at"] - at).total_seconds())
        if delta > 30 * 60:
            continue
        if best is None or delta < best[0]:
            best = (delta, p)
    return None if best is None else best[1]


def apply_after_sim(seed: int, company: Company, plan: Plan, sim: SimResult) -> tuple[list[dict], list[dict], list[dict]]:
    """Add planted card and toll rows, assign ids, return (card_txns, tolls, answer_key_rows)."""
    rng = random.Random(f"{seed}:plant-after")
    key: list[dict] = []
    pings_by_truck: dict[int, list[dict]] = {}
    for p in sim.pings:
        pings_by_truck.setdefault(p["truckId"], []).append(p)
    cards = list(sim.card_txns)
    tolls = list(sim.tolls)

    # ---- location mismatches
    for slot in plan.loc_mismatch:
        truck = company.truck(slot["truck"])
        station = geo.STATION_BY_NAME[slot["station"]]
        at = cal.local_to_utc(slot["day"], slot["minute"], slot["second"])
        price = sim.price_at(station, slot["day"])
        gallons = round(truck.tankGal * slot["frac"], 1)
        cents = int(gallons * price * 100 + 0.5 + 1e-9)
        near = _nearest_ping(pings_by_truck[truck.id], at)
        assert near is not None and not near["engineOn"]
        miles = geo.haversine(near["lat"], near["lon"], station.lat, station.lon)
        assert 60.0 <= miles <= 200.0, miles
        cards.append({
            "cardId": truck.fuelCardId, "truckId": truck.id, "driverId": company.driver_of_truck(truck.id).id,
            "at": at, "day": slot["day"], "stationName": station.name, "stationLat": station.lat,
            "stationLon": station.lon, "gallons": gallons, "cents": cents, "merchant": station.merchant,
            "_price": price, "_kind": "location_mismatch", "_fixed_id": None, "_pump_truck": 0,
            "_note": f"card used at {station.name} while truck {truck.id} sat at the {geo.TERMINAL_BY_CODE[truck.code][2]} yard engine off, {miles:.0f} miles away",
        })

    # ---- capacity exceeded: mutate six clean stops on distinct trucks and weeks
    swap_trucks = {s.own_truck for s in plan.swaps} | {s.relief_truck for s in plan.swaps}
    clean = [x for x in cards if x["_kind"] == "clean" and x["truckId"] not in swap_trucks and x["driverId"] != 23]
    rng.shuffle(clean)
    seen_truck: set[int] = set()
    seen_week: set[int] = set()
    n = 0
    for x in clean:
        if n == COUNTS["capacity_exceeded"]:
            break
        w = cal.week_of(x["day"])
        if x["truckId"] in seen_truck or w in seen_week:
            continue
        truck = company.truck(x["truckId"])
        x["gallons"] = round(truck.tankGal * rng.uniform(1.15, 1.60), 1)
        x["cents"] = int(x["gallons"] * x["_price"] * 100 + 0.5 + 1e-9)
        x["_kind"] = "capacity_exceeded"
        x["_note"] = f"{x['gallons']} gallons on a {truck.tankGal} gallon tank (limit {truck.tankGal * 1.1:.0f})"
        seen_truck.add(x["truckId"])
        seen_week.add(w)
        n += 1
    assert n == COUNTS["capacity_exceeded"]

    # ---- duplicate tolls: eleven second charges 2 to 9 minutes after a real pass
    rng.shuffle(tolls)
    seen_truck, seen_week = set(), set()
    dups: list[dict] = []
    for t in tolls:
        if len(dups) == COUNTS["duplicate_toll"]:
            break
        w = cal.week_of(t["day"])
        if t["truckId"] in seen_truck or w in seen_week:
            continue
        seen_truck.add(t["truckId"])
        seen_week.add(w)
        d = dict(t)
        d["at"] = t["at"] + dt.timedelta(minutes=rng.randint(2, 9), seconds=rng.randint(0, 59))
        d["_kind"] = "duplicate_toll"
        d["_dup_of"] = t
        dups.append(d)
    assert len(dups) == COUNTS["duplicate_toll"]
    tolls += dups

    # ---- ids
    cards.sort(key=lambda x: (x["at"], x["truckId"], x["cardId"]))
    next_id = 1000
    for x in cards:
        if x.get("_fixed_id"):
            x["id"] = x["_fixed_id"]
            continue
        if next_id == 2231:
            next_id += 1
        x["id"] = str(next_id)
        next_id += 1
    tolls.sort(key=lambda x: (x["at"], x["truckId"], x["plazaId"]))
    for i, t in enumerate(tolls):
        t["id"] = f"T{1001 + i}"

    # ---- answer key rows for these classes
    swap_by_truck = {s.own_truck: s for s in plan.swaps}
    for x in cards:
        if x["_kind"] == "clean":
            continue
        if x["_kind"] == "decoy":
            s = swap_by_truck[x["truckId"]]
            drv = company.driver(s.driver_id)
            note = (f"legitimate swap: {drv.name} drove relief unit {s.relief_truck} days {s.d0}-{s.d1} while unit "
                    f"{s.own_truck} was in the shop ({s.reason}); he kept using card {x['cardId']}; see swap_log.txt")
            key.append({"txnRef": x["id"], "code": "location_mismatch", "expected": "clear_after_question", "note": note})
        else:
            key.append({"txnRef": x["id"], "code": x["_kind"], "expected": "hold", "note": x["_note"]})
    for t in tolls:
        if t.get("_kind") == "duplicate_toll":
            key.append({"txnRef": t["id"], "code": "duplicate_toll", "expected": "auto_reject",
                        "note": f"second charge at {t['plazaId']} for {t['plate']} {int((t['at'] - t['_dup_of']['at']).total_seconds() // 60)} minutes after {t['_dup_of']['id']}"})
    return cards, tolls, key
