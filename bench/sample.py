#!/usr/bin/env python3
"""Stratified, deterministic sample for the model-only baseline (Task 22, step 1).

All planted rows (52), all decoys (6), and 500 clean rows drawn as evenly as the data allows across the three
kinds (card, toll, invoice) and across the 92 business days. Clean means: not in the answer key, not flagged by
the kernel mirror, and not one of the auto-pay limit holds (a policy hold, not an exception, so it is left out
rather than asked about). Seed 42. Writes bench/sample.json.

Run: agent/.venv/bin/python bench/sample.py
"""
from __future__ import annotations

import random
from collections import defaultdict
from pathlib import Path

from common import BENCH, CLEAN_QUOTA, FIXTURES, KINDS, SEED, kind_of, load_fixtures, mirror, write_json


def build_sample() -> dict:
    fx = load_fixtures()
    key = fx["answer_key"]
    planted = [k["txnRef"] for k in key if k["expected"] != "clear_after_question"]
    decoys = [k["txnRef"] for k in key if k["expected"] == "clear_after_question"]
    key_refs = set(planted) | set(decoys)

    verdicts = mirror.run(FIXTURES)
    excluded = set(verdicts["flagged"]) | set(verdicts["limits"]) | key_refs

    day_of: dict[str, int] = {}
    pools: dict[str, dict[int, list[str]]] = {k: defaultdict(list) for k in KINDS}
    for row in fx["card_txns"]:
        day_of[row["id"]] = row["day"]
        if row["id"] not in excluded:
            pools["card"][row["day"]].append(row["id"])
    for row in fx["toll_txns"]:
        day_of[row["id"]] = row["day"]
        if row["id"] not in excluded:
            pools["toll"][row["day"]].append(row["id"])
    for row in fx["invoices"]:
        day_of[row["id"]] = row["receivedDay"]
        if row["id"] not in excluded:
            pools["invoice"][row["receivedDay"]].append(row["id"])

    # Quota per kind: as even as possible, a kind with fewer clean rows gives its shortfall to the others.
    available = {k: sum(len(v) for v in pools[k].values()) for k in KINDS}
    quota = {k: 0 for k in KINDS}
    remaining = CLEAN_QUOTA
    open_kinds = list(KINDS)
    while remaining and open_kinds:
        share = remaining // len(open_kinds)
        extra = remaining % len(open_kinds)
        progressed = False
        for i, k in enumerate(list(open_kinds)):
            want = share + (1 if i < extra else 0)
            take = min(want, available[k] - quota[k])
            quota[k] += take
            remaining -= take
            if take:
                progressed = True
            if quota[k] >= available[k]:
                open_kinds.remove(k)
        if not progressed:
            break

    rng = random.Random(SEED)
    clean: dict[str, list[str]] = {}
    for k in KINDS:
        by_day = {d: sorted(ids) for d, ids in pools[k].items()}
        for ids in by_day.values():
            rng.shuffle(ids)
        days = sorted(by_day)
        picked: list[str] = []
        # round-robin over the days so the 92-day span is covered evenly
        while len(picked) < quota[k]:
            took = False
            for d in days:
                if len(picked) >= quota[k]:
                    break
                if by_day[d]:
                    picked.append(by_day[d].pop())
                    took = True
            if not took:
                break
        clean[k] = sorted(picked, key=lambda r: (day_of[r], r))

    rows = []
    for ref in planted:
        rows.append({"id": ref, "kind": kind_of(ref), "stratum": "planted", "day": day_of[ref]})
    for ref in decoys:
        rows.append({"id": ref, "kind": kind_of(ref), "stratum": "decoy", "day": day_of[ref]})
    for k in KINDS:
        for ref in clean[k]:
            rows.append({"id": ref, "kind": k, "stratum": "clean", "day": day_of[ref]})

    return {
        "seed": SEED,
        "counts": {
            "planted": len(planted), "decoys": len(decoys),
            "clean": {k: len(clean[k]) for k in KINDS}, "cleanTotal": sum(len(v) for v in clean.values()),
            "cleanAvailable": available, "total": len(rows),
        },
        "excludedLimitHolds": sorted(verdicts["limits"]),
        "rows": rows,
    }


def main() -> int:
    sample = build_sample()
    out = BENCH / "sample.json"
    write_json(out, sample)
    c = sample["counts"]
    days_covered = {k: len({r["day"] for r in sample["rows"] if r["kind"] == k and r["stratum"] == "clean"}) for k in KINDS}
    print(f"wrote {out.relative_to(Path.cwd()) if out.is_relative_to(Path.cwd()) else out}: "
          f"{c['planted']} planted, {c['decoys']} decoys, {c['cleanTotal']} clean {c['clean']} "
          f"(available {c['cleanAvailable']}), total {c['total']}; clean days covered {days_covered}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
