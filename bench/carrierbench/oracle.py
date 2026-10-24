#!/usr/bin/env python3
"""The oracle run: the ceiling a perfect clerk reaches on CarrierBench, computed from the fixtures with the mirror.

    python3 bench/carrierbench/oracle.py

The oracle is the kernel handed the answer key: every planted exception is held (duplicate tolls auto-rejected, as
the kernel does), every decoy is cleared at once with no question, every clean row is posted subject to the same
auto-pay policy limits the kernel enforces (a perfect clerk still cannot post above the per-transaction or daily
cap without a person). Precision and recall are 1.0 by construction; the point is the end-to-end counts it
produces over the 92 days: postings, holds, questions, wrong postings. The measured run (docs/FACTS.json) is
placed beside it so the gap is the cost of not knowing the key.

No ledger, no process, no model: fixtures in, oracle.json out.
"""
from __future__ import annotations

import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
from carrierbench import CODES, FIXTURES, load_all, mirror, verdicts_with_evidence  # noqa: E402

FACTS = ROOT / "docs" / "FACTS.json"


def main() -> int:
    fx = load_all()
    verdicts = verdicts_with_evidence(fx)
    key = {r["txnRef"]: r for r in fx["answer_key"]}
    planted = {r for r, k in key.items() if k["expected"] != "clear_after_question"}
    decoys = {r for r, k in key.items() if k["expected"] == "clear_after_question"}

    # Oracle decisions, row by row, in the kernel's order (day, then ref) so the daily cap behaves the same way.
    decision: dict[str, str] = {}
    day_paid: dict[int, int] = {}
    for ref in sorted(verdicts, key=lambda r: (verdicts[r]["day"], r)):
        v = verdicts[ref]
        if ref in planted:
            decision[ref] = "auto_reject" if key[ref]["expected"] == "auto_reject" else "hold"
            continue
        if ref in decoys:
            pay = True  # the oracle knows the swap log is right; no question
        else:
            assert v["code"] == "matched", (ref, v["code"])  # the key is complete: every other row is clean
            pay = True
        if pay:
            if mirror.auto_pay_decision(v["cents"], day_paid.get(v["day"], 0)) == "limit":
                decision[ref] = "limit"
            else:
                decision[ref] = "pay"
                day_paid[v["day"]] = day_paid.get(v["day"], 0) + v["cents"]

    def cents_of(refs) -> int:
        return sum(verdicts[r]["cents"] for r in refs)

    posted = [r for r, d in decision.items() if d == "pay"]
    held = [r for r, d in decision.items() if d == "hold"]
    rejected = [r for r, d in decision.items() if d == "auto_reject"]
    limits = [r for r, d in decision.items() if d == "limit"]
    wrong_postings = [r for r in posted if r in planted]
    wrong_holds = [r for r in held if r not in key]
    by_code = []
    for c in CODES:
        rows = [r for r in key if key[r]["code"] == c]
        tp = [r for r in rows if decision[r] in ("hold", "auto_reject") or (r in decoys and decision[r] == "pay")]
        by_code.append({"code": c, "planted": len(rows), "raised": len([r for r in rows if r not in decoys]),
                        "decoysClearedWithoutQuestion": len([r for r in rows if r in decoys]),
                        "truePositives": len(tp), "falsePositives": 0, "precision": 1.0, "recall": 1.0})

    oracle = {
        "definition": "the kernel handed the answer key: planted rows held (duplicate tolls auto-rejected), decoys cleared with no "
                      "question, clean rows posted under the same auto-pay limits; nothing is learned, nothing is asked",
        "rowsEvaluated": len(verdicts),
        "posted": {"count": len(posted), "cents": cents_of(posted), "decoysIncluded": len([r for r in posted if r in decoys])},
        "exceptionHolds": {"count": len(held), "cents": cents_of(held), "byCode": dict(Counter(key[r]["code"] for r in held))},
        "autoRejected": {"count": len(rejected), "cents": cents_of(rejected)},
        "policyHolds": {"count": len(limits), "cents": cents_of(limits), "refs": limits},
        "questionsAsked": 0, "rulesNeeded": 0,
        "wrongPostings": {"count": len(wrong_postings), "refs": wrong_postings},
        "wrongHolds": {"count": len(wrong_holds), "refs": wrong_holds},
        "humanDecisionsRequired": len(held) + len(limits),
        "overall": {"precision": 1.0, "recall": 1.0, "truePositives": len(key), "falsePositives": 0},
        "byCode": by_code,
        "maxDayAutoPaidCents": max(day_paid.values()) if day_paid else 0,
    }

    measured = None
    if FACTS.exists():
        f = json.loads(FACTS.read_text())
        measured = {
            "source": "docs/FACTS.json", "asOf": f["asOf"], "rowsEvaluated": f["transactionsMatched"],
            "autoPaid": f["autoPaid"], "controllerReleased": f["controllerReleased"], "policyHolds": f["limitHolds"],
            "overall": f["overall"], "decoys": f["decoys"], "decoysClearedWithOneAnswer": f["decoysClearedWithOneAnswer"],
            "questionsAsked": sum(r["questions"] for r in f["decoyRows"]), "rulesApproved": len(f["decoyRows"]),
            "plantedClearedByRule": len(f["plantedClearedByRule"]), "refusals": f["refusals"],
            "autoRejected": sum(d["autoRejected"] for d in f["byDay"]),
            "exceptionHolds": sum(d["holds"] for d in f["byDay"]) - f["limitHolds"]["count"],
        }
    out = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "command": "python3 bench/carrierbench/oracle.py",
        "fixtures": str(FIXTURES.relative_to(ROOT)),
        "oracle": oracle,
        "measured": measured,
        "gap": None if measured is None else {
            "postedWithoutAPerson": {"oracle": oracle["posted"]["count"], "measured": measured["autoPaid"]["count"],
                                     "note": "the measured count includes the decoys cleared by an approved rule (releasedRole rule)"},
            "questionsAsked": {"oracle": 0, "measured": measured["questionsAsked"]},
            "wrongPostings": {"oracle": oracle["wrongPostings"]["count"], "measured": measured["plantedClearedByRule"]},
            "policyHolds": {"oracle": oracle["policyHolds"]["count"], "measured": measured["policyHolds"]["count"]},
            "autoRejected": {"oracle": oracle["autoRejected"]["count"], "measured": measured["autoRejected"]},
            "exceptionHolds": {"oracle": oracle["exceptionHolds"]["count"], "measured": measured["exceptionHolds"]},
        },
    }
    (HERE / "oracle.json").write_text(json.dumps(out, indent=2, sort_keys=True) + "\n")
    print(json.dumps({"oracle": {k: oracle[k] for k in ("posted", "exceptionHolds", "autoRejected", "policyHolds", "wrongPostings", "humanDecisionsRequired")},
                      "gap": out["gap"]}, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
