"""Day-by-day trip simulator: pings, fuel stops (card transactions) and toll passes.

Everything is driven by named random.Random streams so output is byte-stable for a seed.
Local time is minutes after local midnight; calendar.local_to_utc turns it into UTC.
"""
from __future__ import annotations

import datetime as dt
import random
from dataclasses import dataclass, field

import simcal as cal
import geo
from company import Company, Truck

ACTIVE_P = 0.72
RELIEF_DRIVER_P = 0.08
TOLL_ROAD_P = 0.20
PING_MIN = 15
MPG_RANGE = (3.0, 3.8)
FILL_FRAC = (0.22, 0.55, 1.2)  # low, high, skew power: share of tank bought per stop
THRESHOLD_RANGE = (0.30, 0.42)
PRICE_RANGE = (3.20, 3.90)
IDLE_GAL_PER_HOUR = 0.8
JITTER_DRIVING = 0.0015
JITTER_PARKED = 0.0003


@dataclass
class TruckState:
    truck: Truck
    loc: str  # terminal code where the truck currently sits
    fuel: float
    odometer: float
    mpg: float
    threshold: float


@dataclass
class Constraints:
    force_inactive: set[tuple[int, int]] = field(default_factory=set)
    force_active: set[tuple[int, int]] = field(default_factory=set)
    home_required: dict[int, set[int]] = field(default_factory=dict)
    no_one_way: set[tuple[int, int]] = field(default_factory=set)
    force_route: dict[tuple[int, int], tuple[str, str]] = field(default_factory=dict)  # (truck, day) -> (dest, kind)
    forced_stop: dict[tuple[int, int], dict] = field(default_factory=dict)
    driver_override: dict[tuple[int, int], int] = field(default_factory=dict)


@dataclass
class SimResult:
    pings: list[dict]
    card_txns: list[dict]
    tolls: list[dict]
    legs: list[dict]
    price_at: object = None


def _r5(x: float) -> float:
    return round(x, 5)


class Simulator:
    def __init__(self, seed: int, company: Company, constraints: Constraints):
        self.company = company
        self.c = constraints
        self.rng_act = random.Random(f"{seed}:activity")
        self.rng_leg = random.Random(f"{seed}:legs")
        self.rng_fuel = random.Random(f"{seed}:fuel")
        self.rng_toll = random.Random(f"{seed}:tolls")
        self.rng_ping = random.Random(f"{seed}:pings")
        self.rng_init = random.Random(f"{seed}:init")
        self.rng_price = random.Random(f"{seed}:prices")
        self.states: dict[int, TruckState] = {}
        for t in company.trucks:
            self.states[t.id] = TruckState(
                truck=t, loc=t.code,
                fuel=round(t.tankGal * self.rng_init.uniform(0.45, 0.95), 1),
                odometer=round(self.rng_init.uniform(118_000, 412_000), 1),
                mpg=round(self.rng_init.uniform(*MPG_RANGE), 2),
                threshold=round(self.rng_init.uniform(*THRESHOLD_RANGE), 3),
            )
        # weekly diesel price per station: base drifts by week, station offset fixed
        self.station_offset = {s.name: self.rng_price.uniform(-0.12, 0.12) for s in geo.STATIONS}
        self.week_base = {w: self.rng_price.uniform(3.42, 3.68) for w in range(1, 20)}
        self.pings: list[dict] = []
        self.card_txns: list[dict] = []
        self.tolls: list[dict] = []
        self.legs: list[dict] = []

    # ---------------------------------------------------------------- helpers
    def price_at(self, station: geo.Station, day: int) -> float:
        p = self.week_base[cal.week_of(day)] + self.station_offset[station.name]
        return round(min(PRICE_RANGE[1], max(PRICE_RANGE[0], p)), 3)

    def _ping(self, truck_id: int, day: int, t: dt.datetime, lat: float, lon: float, odo: float, on: bool, jitter: float):
        self.pings.append({
            "truckId": truck_id, "day": day, "at": t,
            "lat": _r5(lat + self.rng_ping.uniform(-jitter, jitter)),
            "lon": _r5(lon + self.rng_ping.uniform(-jitter, jitter)),
            "odometer": round(odo, 1), "engineOn": on,
        })

    def _parked_day(self, st: TruckState, day: int):
        lat, lon = geo.terminal_latlon(st.loc)
        for h in range(24):
            self._ping(st.truck.id, day, cal.local_to_utc(day, h * 60), lat, lon, st.odometer, False, JITTER_PARKED)

    def _driver_for(self, truck: Truck, day: int) -> int:
        key = (truck.id, day)
        if key in self.c.driver_override:
            return self.c.driver_override[key]
        regular = self.company.driver_of_truck(truck.id)
        if self.rng_act.random() < RELIEF_DRIVER_P:
            relief = self.company.relief_drivers_at(truck.terminalId)
            if relief:
                return self.rng_act.choice(relief).id
        return regular.id

    # ---------------------------------------------------------------- daily loop
    def run(self) -> SimResult:
        for day in range(1, cal.TOTAL_DAYS + 1):
            for truck in self.company.trucks:
                self._truck_day(self.states[truck.id], day)
        self.pings.sort(key=lambda p: (p["truckId"], p["at"]))
        return SimResult(self.pings, self.card_txns, self.tolls, self.legs, self.price_at)

    def _truck_day(self, st: TruckState, day: int):
        t = st.truck
        home = t.code
        key = (t.id, day)
        next_home = (day + 1) in self.c.home_required.get(t.id, set())
        roll = self.rng_act.random()  # always consume one draw so plans do not shift the stream
        if key in self.c.force_inactive:
            active = False
        elif key in self.c.force_active:
            active = True
        elif st.loc != home and next_home:
            active = True
        else:
            active = roll < ACTIVE_P
        if not active:
            self._parked_day(st, day)
            return
        if st.loc != home:
            leg = geo.make_leg(st.loc, home, "one_way")
        elif key in self.c.force_route:
            dest, kind = self.c.force_route[key]
            leg = geo.make_leg(home, dest, kind)
        else:
            options = geo.routes_from(home)
            allow_one_way = not (next_home or key in self.c.no_one_way or day == cal.TOTAL_DAYS)
            choices = []
            for dest, r, _ in options:
                kind = geo.leg_kind_for(r)
                if kind == "one_way" and not allow_one_way:
                    continue
                choices.append((dest, kind))
            weights = [geo.route_between(home, d)[0].miles for d, _ in choices]
            dest, kind = self.rng_leg.choices(choices, weights=weights, k=1)[0]
            leg = geo.make_leg(home, dest, kind)
        self._drive(st, day, leg)

    # ---------------------------------------------------------------- one leg
    def _drive(self, st: TruckState, day: int, leg: geo.Leg):
        truck = st.truck
        tank = truck.tankGal
        driver_id = self._driver_for(truck, day)
        depart = 330 + 5 * self.rng_leg.randint(0, 36)  # 05:30 .. 08:30 local
        speed = self.rng_leg.uniform(56.0, 63.0)
        forced = self.c.forced_stop.get((truck.id, day))

        # ---- plan stops along the leg (mile, kind, duration_min, payload)
        stops: list[tuple[float, str, float, dict | None]] = []
        candidates = leg.stations()
        fuel0 = st.fuel  # virtual fuel at mile 0: fuel at mile m is fuel0 - m / mpg (fills raise fuel0)
        forced_done = forced is None
        for idx, (mile, station, skind) in enumerate(candidates):
            fuel_here = fuel0 - mile / st.mpg - (IDLE_GAL_PER_HOUR * 0.5 if idx > 0 else 0.0)
            next_mile = candidates[idx + 1][0] if idx + 1 < len(candidates) else leg.miles
            fuel_next = fuel_here - (next_mile - mile) / st.mpg
            want = False
            payload = None
            if not forced_done:
                hit = (forced.get("station") == station.name) if forced.get("station") else (skind == "corridor" and mile >= 40.0)
                if hit:
                    want, forced_done, payload = True, True, forced
            if not want and mile >= leg.miles - 0.01:
                break  # never fuel at the final yard; the next leg starts there if the tank is low
            if not want and (fuel_here / tank < st.threshold or fuel_next / tank < 0.08):
                want = True
            if want:
                gallons = self._fill_gallons(tank, fuel_here, payload)
                fuel0 += gallons
                if fuel0 - mile / st.mpg > tank:
                    fuel0 = tank + mile / st.mpg
                stops.append((mile, "fuel", self.rng_fuel.uniform(14.0, 24.0), {"station": station, "gallons": gallons, "payload": payload}))
        end_fuel = max(2.0, fuel0 - leg.miles / st.mpg - IDLE_GAL_PER_HOUR * 0.5)
        assert forced_done, (truck.id, day, forced)
        # dwell at far terminals on round trips, a break on long single runs
        for i in range(len(leg.runs) - 1):
            stops.append((leg.offsets[i + 1], "dwell", self.rng_leg.uniform(45.0, 90.0), None))
        drive_hours = leg.miles / speed
        if drive_hours > 4.5:
            mid = leg.miles / 2
            if not any(abs(m - mid) < 40 for m, k, _, _ in stops if k == "fuel"):
                stops.append((mid, "break", self.rng_leg.uniform(30.0, 45.0), None))
        stops.sort(key=lambda s: s[0])

        # ---- timeline: (t0, t1, m0, m1, override_latlon)
        timeline: list[tuple[float, float, float, float, tuple[float, float] | None]] = []
        events: list[tuple[float, float, tuple[float, float], str, dict | None]] = []  # (minute, mile, latlon, kind, payload)
        t = float(depart)
        m = 0.0
        for mile, kind, dur, payload in stops:
            if mile > m:
                t1 = t + (mile - m) / speed * 60
                timeline.append((t, t1, m, mile, None))
                t, m = t1, mile
            if kind == "fuel":
                loc = (payload["station"].lat, payload["station"].lon)
            else:
                loc = leg.pos(mile)
            events.append((t, m, loc, kind + "_arrive", payload))
            timeline.append((t, t + dur, m, m, loc))
            t += dur
            events.append((t, m, loc, kind + "_depart", None))
        if leg.miles > m:
            t1 = t + (leg.miles - m) / speed * 60
            timeline.append((t, t1, m, leg.miles, None))
            t = t1
        arrive = t

        def at_minute(minute: float) -> tuple[float, tuple[float, float] | None]:
            for t0, t1, m0, m1, override in timeline:
                if minute <= t1 + 1e-9:
                    if override is not None:
                        return m0, override
                    frac = 0.0 if t1 == t0 else (minute - t0) / (t1 - t0)
                    return m0 + (m1 - m0) * frac, None
            return leg.miles, None

        tid = truck.id
        odo0 = st.odometer
        # parked pings before departure (origin) and after arrival (destination)
        o_lat, o_lon = geo.terminal_latlon(leg.origin)
        d_lat, d_lon = geo.terminal_latlon(leg.destination)
        for h in range(24):
            minute = h * 60
            if minute < depart:
                self._ping(tid, day, cal.local_to_utc(day, minute), o_lat, o_lon, odo0, False, JITTER_PARKED)
            elif minute > arrive:
                self._ping(tid, day, cal.local_to_utc(day, minute), d_lat, d_lon, odo0 + leg.miles, False, JITTER_PARKED)
        # driving ticks every 15 minutes
        minute = float(depart)
        while minute <= arrive:
            mile, override = at_minute(minute)
            if override is not None:
                lat, lon = override
                jit = JITTER_PARKED
            else:
                lat, lon = leg.pos(mile)
                jit = JITTER_DRIVING
            self._ping(tid, day, cal.local_to_utc(day, minute), lat, lon, odo0 + mile, True, jit)
            minute += PING_MIN
        # event pings and fuel transactions
        for minute, mile, loc, kind, payload in events:
            if not kind.endswith("_arrive"):
                continue
            self._ping(tid, day, cal.local_to_utc(day, minute), loc[0], loc[1], odo0 + mile, True, JITTER_PARKED)
            if kind == "fuel_arrive":
                self._card_txn(truck, driver_id, day, minute, payload)
        # final arrival ping
        self._ping(tid, day, cal.local_to_utc(day, arrive), d_lat, d_lon, odo0 + leg.miles, True, JITTER_PARKED)
        # tolls
        for mile, plaza in leg.plazas():
            if self.rng_toll.random() >= TOLL_ROAD_P:
                continue
            # time of passing: invert the timeline
            when = None
            for t0, t1, m0, m1, override in timeline:
                if override is None and m0 <= mile <= m1 and m1 > m0:
                    when = t0 + (t1 - t0) * (mile - m0) / (m1 - m0)
                    break
            if when is None:
                continue
            self.tolls.append({
                "plate": truck.plate, "truckId": tid, "day": day,
                "at": cal.local_to_utc(day, when, self.rng_toll.randint(0, 59)),
                "plazaId": plaza.id, "plazaName": plaza.name, "cents": plaza.cents,
            })
        self.legs.append({"truckId": tid, "day": day, "origin": leg.origin, "destination": leg.destination,
                          "kind": leg.kind, "miles": round(leg.miles, 1), "driverId": driver_id,
                          "depart": depart, "arrive": round(arrive, 1)})
        st.fuel = round(end_fuel, 1)
        st.odometer = round(odo0 + leg.miles, 1)
        st.loc = leg.destination

    def _fill_gallons(self, tank: int, fuel_now: float, payload: dict | None) -> float:
        if payload and payload.get("gallons"):
            return float(payload["gallons"])
        space = tank * 0.97 - max(0.0, fuel_now)
        lo, hi, power = FILL_FRAC
        frac = lo + (hi - lo) * (self.rng_fuel.random() ** power)
        gallons = min(space, tank * frac)
        gallons = max(gallons, min(space, lo * tank))
        return round(max(10.0, gallons), 1)

    def _card_txn(self, truck: Truck, driver_id: int, day: int, arrive_minute: float, payload: dict):
        station: geo.Station = payload["station"]
        forced = payload.get("payload") or {}
        price = forced.get("price") or self.price_at(station, day)
        gallons = payload["gallons"]
        cents = int(gallons * price * 100 + 0.5 + 1e-9)
        card_truck = self.company.truck(forced["card_truck"]) if forced.get("card_truck") else truck
        drv = forced.get("driver") or driver_id
        at = cal.local_to_utc(day, arrive_minute + self.rng_fuel.uniform(2.0, 6.0), self.rng_fuel.randint(0, 59))
        self.card_txns.append({
            "cardId": card_truck.fuelCardId, "truckId": card_truck.id, "driverId": drv, "at": at, "day": day,
            "stationName": station.name, "stationLat": station.lat, "stationLon": station.lon,
            "gallons": gallons, "cents": cents, "merchant": station.merchant,
            "_price": price, "_kind": forced.get("kind", "clean"), "_fixed_id": forced.get("fixed_id"),
            "_pump_truck": truck.id,
        })


def simulate(seed: int, company: Company, constraints: Constraints) -> SimResult:
    return Simulator(seed, company, constraints).run()
