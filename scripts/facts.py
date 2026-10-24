#!/usr/bin/env python3
"""Recompute every published number from the ledger and the answer key.

Nothing in the README, the Devpost text or the video is typed by hand: it is read from docs/FACTS.json,
which this script writes. It is the only program in the repository that reads seed/fixtures/answer_key.json.

Usage: python scripts/facts.py [--uri http://127.0.0.1:3100] [--db dispatch-ledger] [--key seed/fixtures/answer_key.json]
Reads public tables anonymously over the SQL endpoint.
"""
import argparse
import json
import os
import sys
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OPTION_COLS = {"rule_id", "question", "answer", "callback_note", "approved_by", "claimed_by", "claimed_at", "po_id"}
EXCEPTION_CODES = ["location_mismatch", "capacity_exceeded", "rate_variance", "duplicate_toll",
                   "duplicate_invoice", "vendor_bank_change", "short_received"]


def sql(uri: str, db: str, query: str) -> list[dict]:
    req = urllib.request.Request(f"{uri}/v1/database/{db}/sql", data=query.encode(), method="POST")
    with urllib.request.urlopen(req, timeout=60) as r:
        res = json.loads(r.read().decode())[0]
    names = [e["name"]["some"] for e in res["schema"]["elements"]]
    rows = []
    for raw in res["rows"]:
        row = {}
        for k, v in zip(names, raw):
            if isinstance(v, dict) and "some" in v:
                v = v["some"]
            elif isinstance(v, dict) and "none" in v:
                v = None
            elif isinstance(v, list) and len(v) == 2 and v[0] == 1 and v[1] == [] and k in OPTION_COLS:
                v = None
            elif isinstance(v, list) and len(v) == 2 and v[0] == 0 and k in OPTION_COLS:
                v = v[1]
            elif isinstance(v, list) and len(v) == 1 and k in ("at", "decided_at", "updated_at", "created_at", "claimed_at", "actor", "requested_by", "released_by", "created_by", "approved_by", "claimed_by"):
                v = v[0]
            row[k] = v
        rows.append(row)
    return rows


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--uri", default=os.environ.get("STDB_URI", "http://127.0.0.1:3100"))
    ap.add_argument("--db", default=os.environ.get("STDB_DB", "dispatch-ledger"))
    ap.add_argument("--key", default=str(ROOT / "seed/fixtures/answer_key.json"))
    ap.add_argument("--out", default=str(ROOT / "docs"))
    args = ap.parse_args()

    key = json.loads(Path(args.key).read_text())
    key_by_ref = {k["txnRef"]: k for k in key}
    planted = [k for k in key if k["expected"] in ("hold", "auto_reject")]
    decoys = [k for k in key if k["expected"] == "clear_after_question"]

    mr = sql(args.uri, args.db, "SELECT * FROM match_result")
    holds = sql(args.uri, args.db, "SELECT * FROM hold")
    payments = sql(args.uri, args.db, "SELECT * FROM payment")
    rules = sql(args.uri, args.db, "SELECT * FROM rule")
    tasks = sql(args.uri, args.db, "SELECT * FROM agent_task")
    totals = sql(args.uri, args.db, "SELECT * FROM day_total")
    clock = sql(args.uri, args.db, "SELECT * FROM business_day")
    audit = sql(args.uri, args.db, "SELECT action, actor_role, ref FROM audit_event")

    hold_by_ref = {h["txn_ref"]: h for h in holds}
    mr_by_ref = {m["txn_ref"]: m for m in mr}

    # Raised exceptions: every hold with an exception code (a hold row survives release or clearing),
    # plus duplicate tolls, which are auto-rejected without a hold.
    raised: dict[str, str] = {}
    for h in holds:
        if h["code"] in EXCEPTION_CODES:
            raised[h["txn_ref"]] = h["code"]
    for m in mr:
        if m["code"] == "duplicate_toll":
            raised[m["txn_ref"]] = "duplicate_toll"

    by_code = []
    tp_total = fp_total = planted_total = 0
    for code in EXCEPTION_CODES:
        planted_refs = {k["txnRef"] for k in key if k["code"] == code}
        raised_refs = {r for r, c in raised.items() if c == code}
        tp = len(planted_refs & raised_refs)
        fp = len(raised_refs - planted_refs)
        fn = len(planted_refs - raised_refs)
        by_code.append({
            "code": code, "planted": len(planted_refs), "raised": len(raised_refs), "truePositives": tp,
            "falsePositives": fp, "missed": sorted(planted_refs - raised_refs),
            "precision": round(tp / len(raised_refs), 4) if raised_refs else None,
            "recall": round(tp / len(planted_refs), 4) if planted_refs else None,
        })
        tp_total += tp; fp_total += fp; planted_total += len(planted_refs)
    overall_precision = round(tp_total / (tp_total + fp_total), 4) if tp_total + fp_total else None
    overall_recall = round(tp_total / planted_total, 4) if planted_total else None

    # Decoys: cleared through an approved rule after exactly one controller answer.
    decoy_rows = []
    for d in decoys:
        h = hold_by_ref.get(d["txnRef"])
        drafts = [t for t in tasks if t["txn_ref"] == d["txnRef"] and t["kind"] == "draft_rule"]
        rule = next((r for r in rules if r["source_txn_ref"] == d["txnRef"] and r["status"] in ("approved", "expired")), None)
        decoy_rows.append({
            "txnRef": d["txnRef"], "raised": h is not None, "status": h["status"] if h else None,
            "questions": 1 if (h and h.get("question")) else 0, "answers": 1 if (h and h.get("answer")) else 0,
            "draftTasks": len(drafts), "clearedByRule": bool(h and h["status"] == "cleared_by_rule"),
            "ruleId": rule["id"] if rule else None,
            "backtest": json.loads(rule["backtest_json"]) if rule else None,
        })
    decoys_cleared = sum(1 for r in decoy_rows if r["clearedByRule"])
    decoys_one_answer = sum(1 for r in decoy_rows if r["clearedByRule"] and r["answers"] == 1 and r["draftTasks"] == 1)

    # The claim that matters: no planted exception was ever cleared by a rule.
    planted_cleared_by_rule = [k["txnRef"] for k in planted
                               if (hold_by_ref.get(k["txnRef"], {}).get("status") == "cleared_by_rule")
                               or (mr_by_ref.get(k["txnRef"], {}).get("rule_id") not in (None, 0))]

    limit_holds = [h for h in holds if h["code"] == "limit"]
    auto_paid = [p for p in payments if p["released_role"] in ("kernel", "rule")]
    controller_paid = [p for p in payments if p["released_role"] == "controller"]
    refused = [a for a in audit if a["action"] == "refused"]
    refused_by_role = dict(Counter(a["actor_role"] for a in refused))
    task_sources = dict(Counter(t["source"] for t in tasks if t["kind"] == "investigate"))
    task_status = dict(Counter(t["status"] for t in tasks if t["kind"] == "investigate"))

    by_day = []
    holds_per_day = Counter(h["day"] for h in holds if h["code"] in EXCEPTION_CODES)
    dups_per_day = Counter(m["day"] for m in mr if m["code"] == "duplicate_toll")
    for t in sorted(totals, key=lambda x: x["day"]):
        by_day.append({"day": t["day"], "exceptions": holds_per_day.get(t["day"], 0) + dups_per_day.get(t["day"], 0),
                       "autoPaid": t["auto_paid_count"], "autoPaidCents": int(t["auto_paid_cents"]),
                       "holds": t["hold_count"], "autoRejected": t["rejected_count"], "txns": t["txn_count"]})

    unreviewed = [k["txnRef"] for k in planted if k["txnRef"] not in raised]
    cost = {"tasks": 0, "inputTokens": 0, "outputTokens": 0, "durationMs": 0}
    cost_log = ROOT / "worker/cost_log.jsonl"
    if cost_log.exists():
        for line in cost_log.read_text().splitlines():
            try:
                e = json.loads(line)
            except json.JSONDecodeError:
                continue
            cost["tasks"] += 1
            cost["inputTokens"] += int(e.get("inputTokens", 0))
            cost["outputTokens"] += int(e.get("outputTokens", 0))
            cost["durationMs"] += int(e.get("durationMs", 0))

    facts = {
        "asOf": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "dayReached": clock[0]["day"] if clock else 0,
        "transactionsMatched": len(mr),
        "plantedExceptions": planted_total,
        "decoys": len(decoys),
        "overall": {"precision": overall_precision, "recall": overall_recall, "truePositives": tp_total, "falsePositives": fp_total},
        "byCode": by_code,
        "decoyRows": decoy_rows,
        "decoysCleared": decoys_cleared,
        "decoysClearedWithOneAnswer": decoys_one_answer,
        "plantedClearedByRule": planted_cleared_by_rule,
        "limitHolds": {"count": len(limit_holds), "cents": sum(int(h["cents"]) for h in limit_holds)},
        "autoPaid": {"count": len(auto_paid), "cents": sum(int(p["cents"]) for p in auto_paid)},
        "controllerReleased": {"count": len(controller_paid), "cents": sum(int(p["cents"]) for p in controller_paid)},
        "refusals": {"count": len(refused), "byRole": refused_by_role},
        "investigations": {"bySource": task_sources, "byStatus": task_status},
        "rules": dict(Counter(r["status"] for r in rules)),
        "byDay": by_day,
        "worker_cost": cost,
        "unreviewedPlanted": unreviewed,
        "complete": not unreviewed and clock and clock[0]["day"] >= 92,
    }
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    (out / "FACTS.json").write_text(json.dumps(facts, indent=2, sort_keys=True) + "\n")
    web_public = ROOT / "web/public"
    if web_public.exists():
        (web_public / "FACTS.json").write_text(json.dumps(facts, indent=2, sort_keys=True) + "\n")

    md = ["# Facts", "", f"Written by scripts/facts.py at {facts['asOf']}. Nothing in it is typed by hand.", "",
          f"Day reached: {facts['dayReached']} of 92. Transactions matched: {len(mr)}.", "",
          "| Code | Planted | Raised | True positives | False positives | Precision | Recall |", "| --- | --- | --- | --- | --- | --- | --- |"]
    for b in by_code:
        md.append(f"| {b['code']} | {b['planted']} | {b['raised']} | {b['truePositives']} | {b['falsePositives']} | {b['precision']} | {b['recall']} |")
    md += ["", f"Overall precision {overall_precision}, recall {overall_recall}.",
           f"Decoys cleared through an approved rule: {decoys_cleared} of {len(decoys)} ({decoys_one_answer} with exactly one controller answer).",
           f"Planted exceptions cleared by a rule: {len(planted_cleared_by_rule)} (must be 0).",
           f"Policy holds (auto-pay limit, not exceptions): {len(limit_holds)}.",
           f"Auto-paid by the kernel or a rule: {facts['autoPaid']['count']} payments, ${facts['autoPaid']['cents']/100:,.2f}.",
           f"Released by the controller: {facts['controllerReleased']['count']} payments, ${facts['controllerReleased']['cents']/100:,.2f}.",
           f"Refusals recorded in the audit trail: {len(refused)} ({refused_by_role}).",
           f"Investigations by source: {task_sources}; by status: {task_status}.", ""]
    if unreviewed:
        md.append(f"Unreviewed planted rows (the run is not complete): {unreviewed}")
    (out / "FACTS.md").write_text("\n".join(md) + "\n")
    print("\n".join(md))
    return 0 if not planted_cleared_by_rule else 1


if __name__ == "__main__":
    sys.exit(main())
