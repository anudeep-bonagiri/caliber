"""The carrier: terminals, trucks, drivers, vendors. Fixed rosters with a seeded shuffle for assignments."""
from __future__ import annotations

import random
from dataclasses import dataclass

from geo import TERMINALS, TERMINAL_CODE

DRIVER_NAMES = [
    "Luis Hernandez", "Dwayne Mitchell", "Javier Castillo", "Travis Boyd", "Miguel Salinas", "Carl Whitaker",
    "Eduardo Reyes", "Brandon Pruitt", "Hector Villarreal", "Jerome Watkins", "Alejandro Garza", "Kyle Henderson",
    "Oscar Mendoza", "Terrence Hall", "Rafael Guerrero", "Wesley Crane", "Andres Trevino", "Marcus Dillard",
    "Felipe Cantu", "Dustin Pearce", "Rodrigo Pena", "Clayton Burks", "Ramon Ortiz", "Isaac Delgado",
    "Gregory Nolan", "Arturo Vela", "Tyler McBride", "Sergio Lozano", "Darnell Price", "Emilio Soto",
    "Chad Reeves", "Noe Salazar", "Jared Whitfield", "Gabriel Zamora", "Derrick Osborne", "Mateo Ybarra",
    "Cody Lambert", "Ruben Carrillo", "Anthony Fischer", "Victor Esparza", "Lorenzo Ruiz", "Shawn Kimble",
    "Ismael Benavides", "Patrick Dorsey", "Julio Maldonado", "Blake Sutton", "Cesar Olivares", "Jonah Trammell",
]
assert len(DRIVER_NAMES) == 48 and DRIVER_NAMES[22] == "Ramon Ortiz"

# terminal id -> number of trucks based there
TERMINAL_FLEET = {1: 9, 3: 9, 4: 7, 2: 6, 5: 5, 6: 4}
TANK_MIX = [100] * 14 + [120] * 10 + [150] * 7 + [200] * 4 + [250] * 3 + [300] * 2
RELIEF_HOME = [1, 1, 3, 3, 4, 2, 5, 6]  # home terminals of drivers 41..48

VENDORS = [
    (1, "Alamo Fleet Service", "San Antonio", "4471", "2214"),
    (2, "Lone Star Tire", "Austin", "2098", "6630"),
    (3, "Gulf Coast Diesel", "Houston", "7730", "5518"),
    (4, "Metroplex Truck Center", "Dallas", "1156", "9042"),
    (5, "Border Fleet Repair", "Laredo", "8823", "3367"),
]
# vendor id -> terminal ids it mostly serves
VENDOR_REGION = {1: [1], 2: [2], 3: [3], 4: [4], 5: [5, 6]}


@dataclass
class Truck:
    id: int
    plate: str
    tankGal: int
    fuelCardId: str
    terminalId: int

    @property
    def code(self) -> str:
        return TERMINAL_CODE[self.terminalId]


@dataclass
class Driver:
    id: int
    name: str
    homeTerminal: int
    truckId: int


@dataclass
class Vendor:
    id: int
    name: str
    city: str
    bankLast4: str
    previousBankLast4: str
    bankChangedDay: int = 0


@dataclass
class Company:
    terminals: list[tuple[int, str, str, float, float]]
    trucks: list[Truck]
    drivers: list[Driver]
    vendors: list[Vendor]

    def truck(self, tid: int) -> Truck:
        return self.trucks[tid - 1]

    def driver_of_truck(self, tid: int) -> Driver:
        return next(d for d in self.drivers if d.truckId == tid)

    def driver(self, did: int) -> Driver:
        return self.drivers[did - 1]

    def relief_drivers_at(self, terminal_id: int) -> list[Driver]:
        return [d for d in self.drivers if d.truckId == 0 and d.homeTerminal == terminal_id]

    def trucks_at(self, terminal_id: int) -> list[Truck]:
        return [t for t in self.trucks if t.terminalId == terminal_id]


def _force_value(values: list, index: int, wanted, protect: set[int]) -> None:
    """Swap so values[index] == wanted without touching protected indexes."""
    if values[index] == wanted:
        return
    for j, v in enumerate(values):
        if v == wanted and j not in protect:
            values[index], values[j] = values[j], values[index]
            return
    raise RuntimeError("cannot force value")


def build_company(seed: int) -> Company:
    rng = random.Random(f"{seed}:company")
    terminal_ids = []
    for tid in sorted(TERMINAL_FLEET):
        terminal_ids += [tid] * TERMINAL_FLEET[tid]
    rng.shuffle(terminal_ids)
    tanks = list(TANK_MIX)
    rng.shuffle(tanks)
    # Truck 17 (Ramon Ortiz) and relief truck 22 are both San Antonio; tanks 150 and 200.
    _force_value(terminal_ids, 16, 1, {21})
    _force_value(terminal_ids, 21, 1, {16})
    _force_value(tanks, 16, 150, {21})
    _force_value(tanks, 21, 200, {16})
    trucks = [Truck(i, f"TX-{1000 + i}", tanks[i - 1], f"FC-{1000 + i}", terminal_ids[i - 1]) for i in range(1, 41)]

    truck_for_driver = list(range(1, 41))
    rng.shuffle(truck_for_driver)
    _force_value(truck_for_driver, 22, 17, set())
    drivers = []
    for i in range(1, 49):
        if i <= 40:
            tid = truck_for_driver[i - 1]
            drivers.append(Driver(i, DRIVER_NAMES[i - 1], trucks[tid - 1].terminalId, tid))
        else:
            drivers.append(Driver(i, DRIVER_NAMES[i - 1], RELIEF_HOME[i - 41], 0))
    vendors = [Vendor(v[0], v[1], v[2], v[3], v[4]) for v in VENDORS]
    return Company(list(TERMINALS), trucks, drivers, vendors)
