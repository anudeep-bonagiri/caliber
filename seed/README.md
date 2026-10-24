# seed: the synthetic carrier and its answer key

Generates every fixture in `docs/CONTRACT.md` "Fixture files" for a 40-truck Texas carrier over 92 business days
(2026-07-01 to 2026-11-05, weekdays only), plus the evidence folder and `answer_key.json`.

Run it (Python 3.12+, standard library only; pytest for the tests):

    cd seed
    python3 -m venv .venv && .venv/bin/pip install pytest
    .venv/bin/python generate.py --seed 42 --out fixtures
    .venv/bin/python mirror.py fixtures        # re-derive every verdict with the kernel rules
    .venv/bin/python -m pytest -q             # or `pytest seed/` from the repo root

Output is byte-stable for a seed: named `random.Random` streams per subsystem, no wall clock, sorted JSON keys.
`trip_pings` is written as `trip_pings.json` (one row per line inside the array); it switches to `trip_pings.jsonl`
only if the array would exceed 40 MB. `fixtures/summary.json` has the counts, dollars per day and planted totals.

Files: `calendar.py` (business calendar, mirrors `spacetimedb/src/calendar.ts`; implementation in `simcal.py`),
`geo.py` (terminals, corridors, 46 stations, 14 plazas), `company.py` (trucks, drivers, vendors), `sim.py` (trips,
pings, fuel stops, tolls), `plant.py` (fuel and toll plants, truck-swap decoys), `maintenance.py` (contracts, POs,
invoices and the invoice plants), `render_docs.py` (evidence), `mirror.py` (Python copy of the kernel).

Planted, and asserted by the mirror to be the only exceptions: 14 location_mismatch, 6 capacity_exceeded,
9 rate_variance, 11 duplicate_toll, 4 duplicate_invoice, 3 vendor_bank_change (INV-1077 is the fixed one),
5 short_received, plus 6 decoys (legitimate truck swaps in `evidence/swap_log.txt`; card transaction 2231 on day 41
is Ramon Ortiz on relief unit 22). Clean invoices above $2,500 become `limit` policy holds, not exceptions.

Modelling note: to reach about 5,500 card transactions with 70 percent of trucks active, trucks burn 3.0 to 3.8 mpg
and drivers buy 22 to 55 percent of the tank per stop (fuel-optimizer style partial fills) when the tank drops below
about 35 percent. Local time is UTC-5 for all 92 days. No code outside `scripts/facts.py` may read `answer_key.json`.
