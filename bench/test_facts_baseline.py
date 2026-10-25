"""Unit-style check (Task 22, step 6): scripts/facts.py emits the baseline block from a fixture BASELINE.json
and emits nothing when the file is absent. No ledger is touched; facts.main() is never called.

Run: agent/.venv/bin/python -m pytest -q bench/test_facts_baseline.py
"""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

FIXTURE = {
    "generatedAt": "2026-10-24T23:00:00+00:00",
    "sample": {"seed": 42, "planted": 52, "decoys": 6, "cleanTotal": 500},
    "systems": {
        "caliber": {"label": "Caliber (kernel + Droid)"},
        "sonnet": {"label": "Claude Sonnet", "modelIds": ["claude-sonnet-5-5"], "failureSentence": "Claude Sonnet missed 1 of 3 vendor_bank_change."},
        "asi1": {"label": "asi1-mini", "modelIds": ["asi1-mini"], "failureSentence": "asi1-mini raised 5 false holds (5 as duplicate_toll)."},
    },
    "table": [
        {"code": "location_mismatch", "planted": 20,
         "caliber": {"precision": 1.0, "recall": 1.0}, "sonnet": {"precision": 0.9, "recall": 0.75}, "asi1": {"precision": None, "recall": 0.0}},
        {"code": "overall", "planted": 58,
         "caliber": {"precision": 1.0, "recall": 1.0}, "sonnet": {"precision": 0.95, "recall": 0.6}, "asi1": {"precision": 0.2, "recall": 0.1}},
    ],
    "partial": {"caliber": False, "sonnet": False, "asi1": False},
    "tiesOrWins": [],
    "cost": {"sonnetUsd": 6.5, "sonnetRates": {"input": 2.0, "output": 10.0}, "costCapUsd": 15.0, "sonnetStoppedForCost": False, "asi1Requests": 558},
    "footnotes": ["Synthetic data from the same generator; identical inputs; no fine-tuning."],
}


def load_facts_module():
    spec = importlib.util.spec_from_file_location("facts_under_test", ROOT / "scripts" / "facts.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_block_emitted_from_fixture(tmp_path: Path):
    facts = load_facts_module()
    p = tmp_path / "BASELINE.json"
    p.write_text(json.dumps(FIXTURE))
    block, lines = facts.baseline_block(p)
    assert block is not None
    assert block["source"] == "bench/BASELINE.json"
    assert block["table"] == FIXTURE["table"]
    assert block["modelIds"] == {"sonnet": ["claude-sonnet-5-5"], "asi1": ["asi1-mini"]}
    assert block["failures"]["asi1"].startswith("asi1-mini raised 5")
    text = "\n".join(lines)
    assert "## Model-only baseline" in text
    assert "| location_mismatch | 20 | 1.00 / 1.00 | 0.90 / 0.75 | n/a / 0.00 |" in text
    assert "| overall | 58 | 1.00 / 1.00 | 0.95 / 0.60 | 0.20 / 0.10 |" in text
    assert "claude-sonnet-5-5" in text and "$6.5" in text
    assert chr(0x2014) not in text  # no em dash anywhere in the emitted block


def test_nothing_without_file(tmp_path: Path):
    facts = load_facts_module()
    block, lines = facts.baseline_block(tmp_path / "missing.json")
    assert block is None and lines == []
