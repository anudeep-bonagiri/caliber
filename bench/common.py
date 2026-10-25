"""Shared paths and fixture loading for the model-only baseline (Task 22).

The bench is the scorer, not agent code: score.py reads the answer key. sample.py and inputs.py read it only to
know which rows are planted or decoys; nothing from it is ever written into bench/inputs/.
Lookups (nearest ping, contract, PO, earlier rows) come from seed/mirror.py, the Python mirror of the kernel.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BENCH = ROOT / "bench"
FIXTURES = ROOT / "seed" / "fixtures"
SEED_DIR = ROOT / "seed"
if str(SEED_DIR) not in sys.path:
    sys.path.insert(0, str(SEED_DIR))

import mirror  # noqa: E402  (seed/mirror.py)
import simcal  # noqa: E402

SEED = 42
KINDS = ("card", "toll", "invoice")
CLEAN_QUOTA = 500
CODES = ["location_mismatch", "capacity_exceeded", "rate_variance", "duplicate_toll",
         "duplicate_invoice", "vendor_bank_change", "short_received"]


def load_fixtures() -> dict:
    fx = {name: mirror.load_table(FIXTURES, name) for name in
          ("trucks", "trip_pings", "card_txns", "toll_txns", "vendors", "contracts", "pos", "invoices")}
    fx["answer_key"] = json.loads((FIXTURES / "answer_key.json").read_text())
    return fx


def kind_of(ref: str) -> str:
    if ref.startswith("INV-"):
        return "invoice"
    if ref.startswith("T"):
        return "toll"
    return "card"


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n")


def iso_to_micros(s: str) -> int:
    return simcal.iso_to_micros(s)
