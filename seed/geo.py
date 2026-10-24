"""Geography: terminals, corridor waypoints, routes, fuel stations and toll plazas.

Distances use the kernel's haversine (R = 3958.7613 miles). Road miles along a route are the
great-circle polyline length times ROAD_FACTOR, which is what the odometer counts.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

R_MILES = 3958.7613
ROAD_FACTOR = 1.12
STATION_ON_ROUTE_MILES = 1.5
PLAZA_ON_ROUTE_MILES = 3.0


def to_rad(deg: float) -> float:
    return deg * math.pi / 180


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Exact mirror of kernel.ts haversineMiles."""
    d_lat = to_rad(lat2 - lat1)
    d_lon = to_rad(lon2 - lon1)
    a = math.sin(d_lat / 2) ** 2 + math.cos(to_rad(lat1)) * math.cos(to_rad(lat2)) * math.sin(d_lon / 2) ** 2
    return 2 * R_MILES * math.asin(min(1.0, math.sqrt(a)))


# id, code, name, lat, lon
TERMINALS = [
    (1, "SA", "San Antonio", 29.4241, -98.4936),
    (2, "AUS", "Austin", 30.2672, -97.7431),
    (3, "HOU", "Houston", 29.7604, -95.3698),
    (4, "DAL", "Dallas", 32.7767, -96.7970),
    (5, "LAR", "Laredo", 27.5306, -99.4803),
    (6, "CC", "Corpus Christi", 27.8006, -97.3964),
]
TERMINAL_BY_CODE = {t[1]: t for t in TERMINALS}
TERMINAL_ID = {t[1]: t[0] for t in TERMINALS}
TERMINAL_CODE = {t[0]: t[1] for t in TERMINALS}


def terminal_latlon(code: str) -> tuple[float, float]:
    t = TERMINAL_BY_CODE[code]
    return t[3], t[4]


WAYPOINTS: dict[str, tuple[float, float]] = {
    "SA": (29.4241, -98.4936), "AUS": (30.2672, -97.7431), "HOU": (29.7604, -95.3698),
    "DAL": (32.7767, -96.7970), "LAR": (27.5306, -99.4803), "CC": (27.8006, -97.3964),
    "new_braunfels": (29.7030, -98.1245), "san_marcos": (29.8833, -97.9414), "kyle": (29.9890, -97.8770),
    "buda": (30.0852, -97.8403), "seguin": (29.5688, -97.9647), "luling": (29.6805, -97.6475),
    "flatonia": (29.6877, -97.1086), "schulenburg": (29.6816, -96.9036), "columbus": (29.7066, -96.5397),
    "sealy": (29.7808, -96.1572), "katy": (29.7858, -95.8245), "georgetown": (30.6333, -97.6780),
    "salado": (30.9474, -97.5386), "temple": (31.0982, -97.3428), "waco": (31.5493, -97.1467),
    "hillsboro": (32.0110, -97.1300), "waxahachie": (32.3865, -96.8483), "pearsall": (28.8922, -99.0950),
    "dilley": (28.6675, -99.1706), "cotulla": (28.4369, -99.2350), "encinal": (28.0405, -99.3540),
    "pleasanton": (28.9672, -98.4786), "three_rivers": (28.4597, -98.1825), "mathis": (28.0947, -97.8281),
    "bastrop": (30.1105, -97.3153), "giddings": (30.1827, -96.9364), "brenham": (30.1669, -96.3977),
    "hempstead": (30.0974, -96.0783), "cypress": (29.9691, -95.6972), "conroe": (30.3119, -95.4561),
    "huntsville": (30.7235, -95.5508), "madisonville": (30.9499, -95.9116), "buffalo": (31.4638, -96.0581),
    "corsicana": (32.0954, -96.4689), "ennis": (32.3293, -96.6253), "rosenberg": (29.5572, -95.8086),
    "wharton": (29.3116, -96.1027), "el_campo": (29.1966, -96.2697), "victoria": (28.8053, -97.0036),
    "goliad": (28.6686, -97.3886), "beeville": (28.4008, -97.7486), "george_west": (28.3325, -98.1178),
    "freer": (27.8828, -98.6178), "refugio": (28.3053, -97.2753), "sinton": (28.0367, -97.5092),
    "alice": (27.7522, -98.0697), "robstown": (27.7903, -97.6689),
}

_I35_S = ["SA", "pearsall", "dilley", "cotulla", "encinal", "LAR"]
_I35_SA_AUS = ["SA", "new_braunfels", "san_marcos", "kyle", "buda", "AUS"]
_I35_AUS_DAL = ["AUS", "georgetown", "salado", "temple", "waco", "hillsboro", "waxahachie", "DAL"]
_I37 = ["SA", "pleasanton", "three_rivers", "mathis", "CC"]

ROUTE_DEFS: dict[tuple[str, str], list[str]] = {
    ("SA", "AUS"): _I35_SA_AUS,
    ("SA", "HOU"): ["SA", "seguin", "luling", "flatonia", "schulenburg", "columbus", "sealy", "katy", "HOU"],
    ("SA", "DAL"): _I35_SA_AUS + _I35_AUS_DAL[1:],
    ("SA", "LAR"): _I35_S,
    ("SA", "CC"): _I37,
    ("AUS", "HOU"): ["AUS", "bastrop", "giddings", "brenham", "hempstead", "cypress", "HOU"],
    ("AUS", "DAL"): _I35_AUS_DAL,
    ("AUS", "LAR"): list(reversed(_I35_SA_AUS)) + _I35_S[1:],
    ("AUS", "CC"): list(reversed(_I35_SA_AUS)) + _I37[1:],
    ("HOU", "DAL"): ["HOU", "conroe", "huntsville", "madisonville", "buffalo", "corsicana", "ennis", "DAL"],
    ("HOU", "LAR"): ["HOU", "rosenberg", "wharton", "el_campo", "victoria", "goliad", "beeville", "george_west", "freer", "LAR"],
    ("HOU", "CC"): ["HOU", "rosenberg", "wharton", "el_campo", "victoria", "refugio", "sinton", "CC"],
    ("DAL", "LAR"): list(reversed(_I35_AUS_DAL)) + list(reversed(_I35_SA_AUS))[1:] + _I35_S[1:],
    ("DAL", "CC"): list(reversed(_I35_AUS_DAL)) + list(reversed(_I35_SA_AUS))[1:] + _I37[1:],
    ("LAR", "CC"): ["LAR", "freer", "alice", "robstown", "CC"],
}


@dataclass(frozen=True)
class Station:
    name: str
    city: str
    lat: float
    lon: float
    merchant: str
    address: str
    yard_of: str | None = None  # terminal code when this is the yard station next to a terminal


def _st(name, city, wp, merchant, address, yard_of=None, lat=None, lon=None):
    if wp is not None:
        lat, lon = WAYPOINTS[wp]
    return Station(name, city, lat, lon, merchant, address, yard_of)


STATIONS: list[Station] = [
    _st("Flying J 731, San Antonio TX", "San Antonio", None, "FLYING J #731", "1855 N Foster Rd, San Antonio TX 78244", "SA", 29.4330, -98.4080),
    _st("Love's 851, Austin TX", "Austin", None, "LOVES #851", "4800 S IH-35 Frontage, Austin TX 78745", "AUS", 30.2070, -97.7560),
    _st("Pilot 1196, Houston TX", "Houston", None, "PILOT #1196", "6100 Clinton Dr, Houston TX 77020", "HOU", 29.7760, -95.3250),
    _st("TA Dallas South, Dallas TX", "Dallas", None, "TA DALLAS SOUTH", "7751 Bonnie View Rd, Dallas TX 75241", "DAL", 32.7180, -96.7920),
    _st("Pilot 405, Laredo TX", "Laredo", None, "PILOT #405", "1 Pilot Dr, Laredo TX 78045", "LAR", 27.5760, -99.4580),
    _st("Stripes 2167, Corpus Christi TX", "Corpus Christi", None, "STRIPES #2167", "4702 Leopard St, Corpus Christi TX 78408", "CC", 27.8210, -97.4300),
    _st("Buc-ee's, New Braunfels TX", "New Braunfels", "new_braunfels", "BUC-EES", "2760 IH-35 N, New Braunfels TX 78130"),
    _st("Love's 606, San Marcos TX", "San Marcos", "san_marcos", "LOVES #606", "4790 IH-35 S, San Marcos TX 78666"),
    _st("Love's 420, Seguin TX", "Seguin", "seguin", "LOVES #420", "2585 IH-10 W, Seguin TX 78155"),
    _st("Pilot 1126, Luling TX", "Luling", "luling", "PILOT #1126", "1715 S Magnolia Ave, Luling TX 78648"),
    _st("Love's 412, Schulenburg TX", "Schulenburg", "schulenburg", "LOVES #412", "I-10 Exit 674, Schulenburg TX 78956"),
    _st("TA Express, Columbus TX", "Columbus", "columbus", "TA EXPRESS", "2810 Hwy 71 S, Columbus TX 78934"),
    _st("Flying J 754, Sealy TX", "Sealy", "sealy", "FLYING J #754", "2300 Hwy 36 S, Sealy TX 77474"),
    _st("Love's 806, Georgetown TX", "Georgetown", "georgetown", "LOVES #806", "3300 IH-35 N, Georgetown TX 78626"),
    _st("Flying J 713, Temple TX", "Temple", "temple", "FLYING J #713", "6601 S General Bruce Dr, Temple TX 76502"),
    _st("Pilot 1115, Waco TX", "Waco", "waco", "PILOT #1115", "2409 S New Rd, Waco TX 76711"),
    _st("Love's 405, Hillsboro TX", "Hillsboro", "hillsboro", "LOVES #405", "1601 S IH-35 E, Hillsboro TX 76645"),
    _st("Pilot 283, Waxahachie TX", "Waxahachie", "waxahachie", "PILOT #283", "1100 N IH-35 E, Waxahachie TX 75165"),
    _st("Pilot 1029, Pearsall TX", "Pearsall", "pearsall", "PILOT #1029", "1730 S Oak St, Pearsall TX 78061"),
    _st("Love's 229, Cotulla TX", "Cotulla", "cotulla", "LOVES #229", "1120 N IH-35 Access Rd, Cotulla TX 78014"),
    _st("Flying J 758, Encinal TX", "Encinal", "encinal", "FLYING J #758", "1 Flying J Rd, Encinal TX 78019"),
    _st("Love's 228, Pleasanton TX", "Pleasanton", "pleasanton", "LOVES #228", "1301 W Oaklawn Rd, Pleasanton TX 78064"),
    _st("Stripes 1150, Three Rivers TX", "Three Rivers", "three_rivers", "STRIPES #1150", "1000 N Harborth Ave, Three Rivers TX 78071"),
    _st("Pilot 389, Mathis TX", "Mathis", "mathis", "PILOT #389", "4440 IH-37 Access Rd, Mathis TX 78368"),
    _st("Buc-ee's, Bastrop TX", "Bastrop", "bastrop", "BUC-EES", "1700 Hwy 71 W, Bastrop TX 78602"),
    _st("Shell Travel Center, Giddings TX", "Giddings", "giddings", "SHELL TRAVEL CTR", "2100 E Austin St, Giddings TX 78942"),
    _st("Love's 402, Brenham TX", "Brenham", "brenham", "LOVES #402", "2500 Hwy 290 E, Brenham TX 77833"),
    _st("Flying J 611, Hempstead TX", "Hempstead", "hempstead", "FLYING J #611", "53850 Hwy 290, Hempstead TX 77445"),
    _st("Pilot 1207, Cypress TX", "Cypress", "cypress", "PILOT #1207", "22000 Hwy 290, Cypress TX 77429"),
    _st("Love's 307, Conroe TX", "Conroe", "conroe", "LOVES #307", "1801 N Frazier St, Conroe TX 77301"),
    _st("Flying J 729, Huntsville TX", "Huntsville", "huntsville", "FLYING J #729", "221 IH-45 N, Huntsville TX 77320"),
    _st("Buc-ee's, Madisonville TX", "Madisonville", "madisonville", "BUC-EES", "1 Buc-ee's Blvd, Madisonville TX 77864"),
    _st("Love's 612, Buffalo TX", "Buffalo", "buffalo", "LOVES #612", "1108 N Hill St, Buffalo TX 75831"),
    _st("Pilot 299, Corsicana TX", "Corsicana", "corsicana", "PILOT #299", "3101 S IH-45, Corsicana TX 75110"),
    _st("Love's 285, Ennis TX", "Ennis", "ennis", "LOVES #285", "1105 S IH-45, Ennis TX 75119"),
    _st("Love's 380, Rosenberg TX", "Rosenberg", "rosenberg", "LOVES #380", "27905 Southwest Fwy, Rosenberg TX 77471"),
    _st("Stripes 2203, Wharton TX", "Wharton", "wharton", "STRIPES #2203", "1820 N Richmond Rd, Wharton TX 77488"),
    _st("Love's 611, El Campo TX", "El Campo", "el_campo", "LOVES #611", "1515 W Loop, El Campo TX 77437"),
    _st("Pilot 1110, Victoria TX", "Victoria", "victoria", "PILOT #1110", "7707 N Navarro St, Victoria TX 77904"),
    _st("Love's 221, Goliad TX", "Goliad", "goliad", "LOVES #221", "1902 N Jefferson St, Goliad TX 77963"),
    _st("Love's 244, Beeville TX", "Beeville", "beeville", "LOVES #244", "2601 N Hwy 181, Beeville TX 78102"),
    _st("Stripes 3310, George West TX", "George West", "george_west", "STRIPES #3310", "805 Houston St, George West TX 78022"),
    _st("Stripes 1204, Freer TX", "Freer", "freer", "STRIPES #1204", "600 E Hwy 44, Freer TX 78357"),
    _st("Stripes 1183, Refugio TX", "Refugio", "refugio", "STRIPES #1183", "1008 S Alamo St, Refugio TX 78377"),
    _st("Love's 309, Alice TX", "Alice", "alice", "LOVES #309", "3251 E Hwy 44, Alice TX 78332"),
    _st("Pilot 1178, Robstown TX", "Robstown", "robstown", "PILOT #1178", "5002 Hwy 77 S, Robstown TX 78380"),
]
STATION_BY_NAME = {s.name: s for s in STATIONS}
YARD = {s.yard_of: s for s in STATIONS if s.yard_of}


@dataclass(frozen=True)
class Plaza:
    id: str
    authority: str
    name: str
    lat: float
    lon: float
    cents: int


def _between(a: str, b: str, frac: float) -> tuple[float, float]:
    (la, oa), (lb, ob) = WAYPOINTS[a], WAYPOINTS[b]
    return round(la + (lb - la) * frac, 5), round(oa + (ob - oa) * frac, 5)


def _pl(pid, authority, name, a, b, frac, cents):
    lat, lon = _between(a, b, frac)
    return Plaza(pid, authority, name, lat, lon, cents)


PLAZAS: list[Plaza] = [
    _pl("TXTAG-SH130-01", "TxTag", "SH 130 Mainlane Plaza 1, Hutto", "AUS", "georgetown", 0.45, 975),
    _pl("TXTAG-SH45N-01", "TxTag", "SH 45 N Mainlane, Round Rock", "AUS", "georgetown", 0.18, 650),
    _pl("TXTAG-SH130-04", "TxTag", "SH 130 Plaza 4, Mustang Ridge", "buda", "AUS", 0.50, 850),
    _pl("TXTAG-SH71-01", "TxTag", "SH 71 Toll Lane, Austin-Bergstrom", "AUS", "bastrop", 0.25, 425),
    _pl("TXTAG-SH45SE-01", "TxTag", "SH 45 SE Plaza, Creedmoor", "kyle", "buda", 0.50, 575),
    _pl("HCTRA-SHT-W", "HCTRA", "Sam Houston Tollway West, Katy", "katy", "HOU", 0.45, 1200),
    _pl("HCTRA-SHT-N", "HCTRA", "Sam Houston Tollway North, Spring", "conroe", "HOU", 0.75, 1050),
    _pl("HCTRA-HARDY-01", "HCTRA", "Hardy Toll Road, Aldine", "conroe", "HOU", 0.55, 725),
    _pl("HCTRA-FBT-01", "HCTRA", "Fort Bend Tollway, Missouri City", "rosenberg", "HOU", 0.60, 550),
    _pl("HCTRA-SHT-NW", "HCTRA", "Sam Houston Tollway NW, Jersey Village", "cypress", "HOU", 0.55, 1100),
    _pl("NTTA-MCLB-01", "NTTA", "Mountain Creek Lake Bridge, Grand Prairie", "waxahachie", "DAL", 0.55, 625),
    _pl("NTTA-DNT-01", "NTTA", "Dallas North Tollway, Dallas", "waxahachie", "DAL", 0.85, 1850),
    _pl("NTTA-SRT-01", "NTTA", "Sam Rayburn Tollway, Dallas", "ennis", "DAL", 0.70, 1425),
    _pl("NTTA-PGBT-01", "NTTA", "President George Bush Turnpike, Irving", "ennis", "DAL", 0.90, 1150),
]
PLAZA_BY_ID = {p.id: p for p in PLAZAS}


def _project(p0: tuple[float, float], p1: tuple[float, float], q: tuple[float, float]) -> tuple[float, float]:
    """Return (fraction along segment, great-circle miles from q to that closest point)."""
    k = math.cos(to_rad((p0[0] + p1[0]) / 2))
    x0, y0 = p0[1] * k, p0[0]
    x1, y1 = p1[1] * k, p1[0]
    xq, yq = q[1] * k, q[0]
    dx, dy = x1 - x0, y1 - y0
    denom = dx * dx + dy * dy
    t = 0.0 if denom == 0 else max(0.0, min(1.0, ((xq - x0) * dx + (yq - y0) * dy) / denom))
    clat = p0[0] + (p1[0] - p0[0]) * t
    clon = p0[1] + (p1[1] - p0[1]) * t
    return t, haversine(q[0], q[1], clat, clon)


@dataclass
class Route:
    a: str
    b: str
    names: list[str]
    pts: list[tuple[float, float]] = field(default_factory=list)
    cum: list[float] = field(default_factory=list)  # road miles at each point
    stations: list[tuple[float, Station]] = field(default_factory=list)
    plazas: list[tuple[float, Plaza]] = field(default_factory=list)

    @property
    def code(self) -> str:
        return f"{self.a}-{self.b}"

    @property
    def miles(self) -> float:
        return self.cum[-1]

    def pos(self, mile: float) -> tuple[float, float]:
        mile = max(0.0, min(self.miles, mile))
        for i in range(len(self.pts) - 1):
            if mile <= self.cum[i + 1] or i == len(self.pts) - 2:
                seg = self.cum[i + 1] - self.cum[i]
                t = 0.0 if seg == 0 else (mile - self.cum[i]) / seg
                la = self.pts[i][0] + (self.pts[i + 1][0] - self.pts[i][0]) * t
                lo = self.pts[i][1] + (self.pts[i + 1][1] - self.pts[i][1]) * t
                return la, lo
        return self.pts[-1]

    def project(self, lat: float, lon: float) -> tuple[float, float]:
        """(miles off route, road mile of closest approach)."""
        best = (1e9, 0.0)
        for i in range(len(self.pts) - 1):
            t, d = _project(self.pts[i], self.pts[i + 1], (lat, lon))
            if d < best[0]:
                best = (d, self.cum[i] + (self.cum[i + 1] - self.cum[i]) * t)
        return best


def _build_route(a: str, b: str, names: list[str]) -> Route:
    r = Route(a, b, names)
    r.pts = [WAYPOINTS[n] for n in names]
    r.cum = [0.0]
    for i in range(len(r.pts) - 1):
        d = haversine(*r.pts[i], *r.pts[i + 1]) * ROAD_FACTOR
        r.cum.append(r.cum[-1] + d)
    for s in STATIONS:
        if s.yard_of:
            continue
        off, mile = r.project(s.lat, s.lon)
        if off <= STATION_ON_ROUTE_MILES:
            r.stations.append((round(mile, 3), s))
    r.stations.sort(key=lambda x: (x[0], x[1].name))
    for p in PLAZAS:
        off, mile = r.project(p.lat, p.lon)
        if off <= PLAZA_ON_ROUTE_MILES:
            r.plazas.append((round(mile, 3), p))
    r.plazas.sort(key=lambda x: (x[0], x[1].id))
    return r


ROUTES: dict[tuple[str, str], Route] = {k: _build_route(k[0], k[1], v) for k, v in ROUTE_DEFS.items()}


def route_between(a: str, b: str) -> tuple[Route, bool]:
    """Route object and whether travelling a -> b is the forward direction."""
    if (a, b) in ROUTES:
        return ROUTES[(a, b)], True
    return ROUTES[(b, a)], False


def routes_from(code: str) -> list[tuple[str, Route, bool]]:
    out = []
    for (a, b), r in ROUTES.items():
        if a == code:
            out.append((b, r, True))
        elif b == code:
            out.append((a, r, False))
    out.sort(key=lambda x: x[0])
    return out


@dataclass
class Leg:
    """A day's driving: one or more runs over routes. A round trip is [forward, backward]."""
    origin: str
    runs: list[tuple[Route, bool]]
    kind: str  # "round_trip", "one_way", "double_round_trip"

    def __post_init__(self):
        self.offsets = [0.0]
        for r, _ in self.runs:
            self.offsets.append(self.offsets[-1] + r.miles)
        self.miles = self.offsets[-1]

    @property
    def destination(self) -> str:
        r, fwd = self.runs[-1]
        return r.b if fwd else r.a

    def terminal_at_run_end(self, i: int) -> str:
        r, fwd = self.runs[i]
        return r.b if fwd else r.a

    def pos(self, mile: float) -> tuple[float, float]:
        mile = max(0.0, min(self.miles, mile))
        for i, (r, fwd) in enumerate(self.runs):
            if mile <= self.offsets[i + 1] or i == len(self.runs) - 1:
                local = mile - self.offsets[i]
                return r.pos(local if fwd else r.miles - local)
        return self.runs[-1][0].pos(0)

    def stations(self) -> list[tuple[float, Station, str]]:
        """(leg mile, station, kind) sorted by mile. kind is 'yard' or 'corridor'."""
        out: list[tuple[float, Station, str]] = [(0.0, YARD[self.origin], "yard")]
        for i, (r, fwd) in enumerate(self.runs):
            off = self.offsets[i]
            for mile, s in r.stations:
                out.append((round(off + (mile if fwd else r.miles - mile), 3), s, "corridor"))
            out.append((round(self.offsets[i + 1], 3), YARD[self.terminal_at_run_end(i)], "yard"))
        out.sort(key=lambda x: (x[0], x[1].name))
        return out

    def plazas(self) -> list[tuple[float, Plaza]]:
        out: list[tuple[float, Plaza]] = []
        for i, (r, fwd) in enumerate(self.runs):
            off = self.offsets[i]
            for mile, p in r.plazas:
                out.append((round(off + (mile if fwd else r.miles - mile), 3), p))
        out.sort(key=lambda x: (x[0], x[1].id))
        return out


def make_leg(origin: str, dest: str, kind: str) -> Leg:
    r, fwd = route_between(origin, dest)
    if kind == "one_way":
        return Leg(origin, [(r, fwd)], kind)
    if kind == "round_trip":
        return Leg(origin, [(r, fwd), (r, not fwd)], kind)
    if kind == "double_round_trip":
        return Leg(origin, [(r, fwd), (r, not fwd), (r, fwd), (r, not fwd)], kind)
    raise ValueError(kind)


ONE_WAY_MIN_MILES = 230.0
DOUBLE_MAX_MILES = 120.0


def leg_kind_for(route: Route) -> str:
    if route.miles > ONE_WAY_MIN_MILES:
        return "one_way"
    if route.miles < DOUBLE_MAX_MILES:
        return "double_round_trip"
    return "round_trip"
