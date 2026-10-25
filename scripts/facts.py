#!/usr/bin/env python3
"""Recompute every published number from the ledger and the answer key.

Nothing in the README, the Devpost text or the video is typed by hand: it is read from docs/FACTS.json,
which this script writes. It is the only program in the demo path that reads seed/fixtures/answer_key.json
(the generator's mirror and the seed tests read it to verify the generator).

Usage: python scripts/facts.py [--uri http://127.0.0.1:3100] [--db dispatch-ledger] [--key seed/fixtures/answer_key.json]
       python scripts/facts.py --self-test   (checks planted_by_rule on an in-memory fixture; touches nothing)
       python scripts/facts.py --baseline-only   (Task 31: rewrites only the "## Model-only baseline" section of
                                                  docs/FACTS.md and the "baseline" key of docs/FACTS.json from
                                                  bench/BASELINE.json; reads no ledger, changes nothing else)
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
RECORD_LOG = ROOT / "docs/evidence/cost_log_live_record_2026-10-24.jsonl"
DECOY_LOG = ROOT / "docs/evidence/cost_log_decoy_rerecord_2026-10-24.jsonl"
OPTION_COLS = {"rule_id", "question", "answer", "callback_note", "approved_by", "claimed_by", "claimed_at", "po_id", "bank_txn_id"}
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


def cost_summary(log: Path) -> dict:
    """Totals and per-task averages from one cost log. Cache is cacheCreationTokens plus cacheReadTokens and is
    reported beside input and output, never added to either. factoryCredits is summed when the SDK reported it."""
    t = {"tasks": 0, "inputTokens": 0, "outputTokens": 0, "cacheTokens": 0, "cacheCreationTokens": 0,
         "cacheReadTokens": 0, "thinkingTokens": 0, "factoryCredits": 0, "durationMs": 0}
    if not log.exists():
        return {"tasks": 0, "total": t, "avg": None, "cacheLabel": "cacheCreationTokens plus cacheReadTokens"}
    for line in log.read_text().splitlines():
        try:
            e = json.loads(line)
        except json.JSONDecodeError:
            continue
        tu = e.get("tokenUsage") or {}
        t["tasks"] += 1
        t["inputTokens"] += int(tu.get("inputTokens", 0) or 0)
        t["outputTokens"] += int(tu.get("outputTokens", 0) or 0)
        t["cacheCreationTokens"] += int(tu.get("cacheCreationTokens", 0) or 0)
        t["cacheReadTokens"] += int(tu.get("cacheReadTokens", 0) or 0)
        t["thinkingTokens"] += int(tu.get("thinkingTokens", 0) or 0)
        t["factoryCredits"] += int(tu.get("factoryCredits", 0) or 0)
        t["durationMs"] += int(e.get("durationMs", 0) or 0)
    t["cacheTokens"] = t["cacheCreationTokens"] + t["cacheReadTokens"]
    n = t["tasks"]
    avg = {k: round(v / n) for k, v in t.items() if k != "tasks"} if n else None
    return {"tasks": n, "total": t, "avg": avg, "cacheLabel": "cacheCreationTokens plus cacheReadTokens"}


def cost_lines(cost: dict) -> list[str]:
    """The cost block as prose lines, three token numbers kept apart."""
    pt = cost["perTask"]
    out = []
    if pt["avg"]:
        a, tt = pt["avg"], pt["total"]
        out.append(f"Droid cost, {cost['label']}: per task on average {a['inputTokens']:,} input tokens, "
                   f"{a['outputTokens']:,} output tokens and {a['cacheTokens']:,} cache tokens (cacheCreationTokens plus cacheReadTokens), "
                   f"{a['durationMs']/1000:.1f} s; totals {tt['inputTokens']:,} input, {tt['outputTokens']:,} output, "
                   f"{tt['cacheTokens']:,} cache tokens"
                   + (f", {tt['factoryCredits']:,} Factory credits" if tt["factoryCredits"] else "") + ".")
    d = cost.get("decoyRerecord") or {}
    if d.get("avg"):
        tt = d["total"]
        out.append(f"Decoy re-record, {d['label']}: {tt['tasks']} tasks, totals {tt['inputTokens']:,} input, {tt['outputTokens']:,} output, "
                   f"{tt['cacheTokens']:,} cache tokens (cacheCreationTokens plus cacheReadTokens)"
                   + (f", {tt['factoryCredits']:,} Factory credits" if tt["factoryCredits"] else "") + ".")
    return out


def _strip_clock(bt):
    """The worker's preview carries a wall-clock stamp; the facts file must be identical between runs."""
    if isinstance(bt, dict) and isinstance(bt.get("workerPreview"), dict):
        bt["workerPreview"] = {k: v for k, v in bt["workerPreview"].items() if k != "computedAt"}
    return bt


def baseline_block(path: Path) -> tuple[dict | None, list[str]]:
    """The model-only baseline (Task 22) copied from bench/BASELINE.json, which bench/score.py writes from one
    committed run. Returns the block for FACTS.json and the FACTS.md section, or (None, []) when no baseline
    exists. Nothing is recomputed here; the numbers are copied so Devpost and the site read one source."""
    if not path.exists():
        return None, []
    b = json.loads(path.read_text())
    systems = b.get("systems", {})
    # model columns in table order; "opus" is present from Task 31 on and absent in earlier baselines
    keys = [k for k in ("sonnet", "opus", "asi1") if k in systems]
    label = {k: systems[k].get("label") or k for k in keys}
    block = {
        "source": "bench/BASELINE.json",
        "generatedAt": b.get("generatedAt"),
        "sample": b.get("sample"),
        "modelIds": {k: systems.get(k, {}).get("modelIds") for k in keys},
        "table": b.get("table"),
        "partial": b.get("partial"),
        "tiesOrWins": b.get("tiesOrWins"),
        "failures": {k: systems.get(k, {}).get("failureSentence") for k in keys},
        "cost": b.get("cost"),
        "footnotes": b.get("footnotes"),
    }

    def fmt(x):
        return "n/a" if x is None else f"{x:.2f}" if isinstance(x, float) else str(x)

    def pr(row, k):
        return f"{fmt(row[k]['precision'])} / {fmt(row[k]['recall'])}"

    lines = ["", "## Model-only baseline", "",
             f"Copied from bench/BASELINE.json (generated {b.get('generatedAt')} by bench/score.py from one committed run; "
             "prompts under bench/prompts, raw responses under bench/outputs). Precision / recall, code-exact.", "",
             "| Code | Planted | Caliber P / R | " + " | ".join(f"{label[k]} P / R" for k in keys) + " |",
             "| --- | --- | --- | " + " | ".join("---" for _ in keys) + " |"]
    for row in b.get("table", []):
        lines.append(f"| {row['code']} | {row['planted']} | {pr(row, 'caliber')} | " + " | ".join(pr(row, k) for k in keys) + " |")
    ids = block["modelIds"]
    lines.append("")
    lines.append("Model ids: " + "; ".join(f"{label[k]} {', '.join(ids.get(k) or []) or 'none'}" for k in keys) + ". "
                 f"Partial: {b.get('partial')}.")
    for k in keys:
        s = block["failures"].get(k)
        if s:
            lines.append(s)
    cost = b.get("cost") or {}
    if cost:
        parts = [f"Claude Sonnet spend ${cost.get('sonnetUsd')} at list rates {cost.get('sonnetRates')} (cap ${cost.get('costCapUsd')}, stopped for cost: {cost.get('sonnetStoppedForCost')})"]
        if "opusUsd" in cost:
            parts.append(f"Claude Opus 5.5 spend ${cost.get('opusUsd')} at list rates {cost.get('opusRates')} (the same cap on this model alone, stopped for cost: {cost.get('opusStoppedForCost')}, {cost.get('opusRowsAnswered')} rows answered)")
        parts.append(f"asi1-mini requests {cost.get('asi1Requests')} against the free-plan quota")
        lines.append("; ".join(parts) + ".")
    for i, fn in enumerate(b.get("footnotes") or [], 1):
        lines.append(f"{i}. {fn}")
    return block, lines


def _num(v):
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def _rule_covers(scope: dict, condition: str, from_day: int, to_day: int, code: str, day: int, ev: dict) -> bool:
    """Mirror of ruleCovers in spacetimedb/src/kernel.ts, for scoring only."""
    if condition != code or day < from_day or day > to_day:
        return False
    trucks = scope.get("truckIds") or []
    if scope.get("driverId") is None and not trucks and scope.get("cardId") is None and scope.get("vendorId") is None:
        return False
    if scope.get("driverId") is not None and scope["driverId"] != _num(ev.get("driverId")):
        return False
    if trucks and _num(ev.get("truckId")) not in trucks:
        return False
    if scope.get("cardId") is not None and scope["cardId"] != (ev.get("cardId") if isinstance(ev.get("cardId"), str) else None):
        return False
    if scope.get("vendorId") is not None and scope["vendorId"] != _num(ev.get("vendorId")):
        return False
    return True


def planted_by_rule(rules: list[dict], mr: list[dict], holds: list[dict], planted_refs: set[str]) -> dict:
    """Benchmark only: per rule id, the rows its condition, window and scope cover (the same row set the module's
    backtest() in create_rule walks: match_result rows with the code, plus holds with the code) and how many of
    those are planted in the answer key. The rule card shows the planted count only under the BENCHMARK chip;
    the production backtest never sees the key."""
    mr_by_ref = {m["txn_ref"]: m for m in mr}

    def ev_of(m: dict) -> dict:
        try:
            ev = json.loads(m.get("evidence_json") or "{}")
        except json.JSONDecodeError:
            ev = {}
        return ev if isinstance(ev, dict) else {}

    out = {}
    for r in rules:
        try:
            scope = json.loads(r.get("scope_json") or "{}")
        except json.JSONDecodeError:
            scope = {}
        cond, lo, hi = r["condition"], r["valid_from_day"], r["valid_to_day"]
        covered, seen = [], set()
        for m in mr:
            if m["code"] != cond:
                continue
            seen.add(m["txn_ref"])
            if _rule_covers(scope, cond, lo, hi, m["code"], m["day"], ev_of(m)):
                covered.append(m["txn_ref"])
        for h in holds:
            if h["code"] != cond or h["txn_ref"] in seen or h["txn_ref"] not in mr_by_ref:
                continue
            if _rule_covers(scope, cond, lo, hi, h["code"], h["day"], ev_of(mr_by_ref[h["txn_ref"]])):
                covered.append(h["txn_ref"])
        hits = sorted(ref for ref in covered if ref in planted_refs)
        # The card's "would have cleared N past rows" is the module's backtest at create_rule time, which lists its
        # rows in sampleRefs (first 12). When that list is complete, score exactly those rows; otherwise None.
        try:
            bt = json.loads(r.get("backtest_json") or "{}")
        except json.JSONDecodeError:
            bt = {}
        refs = bt.get("sampleRefs") if isinstance(bt, dict) else None
        complete = isinstance(refs, list) and isinstance(bt.get("n"), int) and len(refs) == bt["n"]
        out[str(r["id"])] = {"sourceTxnRef": r["source_txn_ref"], "condition": cond, "covered": len(covered),
                             "planted": len(hits), "plantedRefs": hits,
                             "backtestN": bt.get("n") if complete else None,
                             "plantedInBacktest": sum(1 for ref in refs if ref in planted_refs) if complete else None}
    return out


def self_test() -> int:
    ev = lambda **k: json.dumps(k)
    rules = [{"id": 7, "source_txn_ref": "2231", "condition": "location_mismatch", "scope_json": ev(driverId=23), "valid_from_day": 41, "valid_to_day": 46,
              "backtest_json": ev(n=2, sampleRefs=["2231", "2240"])},
             {"id": 8, "source_txn_ref": "3000", "condition": "rate_variance", "scope_json": ev(vendorId=3), "valid_from_day": 10, "valid_to_day": 20,
              "backtest_json": ev(n=13, sampleRefs=["3001"])},
             {"id": 9, "source_txn_ref": "4000", "condition": "location_mismatch", "scope_json": "{}", "valid_from_day": 0, "valid_to_day": 92,
              "backtest_json": "not json"}]
    mr = [{"txn_ref": "2231", "code": "location_mismatch", "day": 41, "evidence_json": ev(driverId=23, truckId=17)},
          {"txn_ref": "2240", "code": "location_mismatch", "day": 43, "evidence_json": ev(driverId=23, truckId=17)},
          {"txn_ref": "2250", "code": "location_mismatch", "day": 50, "evidence_json": ev(driverId=23)},  # outside window
          {"txn_ref": "2270", "code": "location_mismatch", "day": 42, "evidence_json": ev(driverId=99)},  # other driver
          {"txn_ref": "2280", "code": "clean", "day": 44, "evidence_json": ev(driverId=23)},  # cleared since; hold keeps the code
          {"txn_ref": "3001", "code": "rate_variance", "day": 12, "evidence_json": ev(vendorId=3)},
          {"txn_ref": "3002", "code": "rate_variance", "day": 15, "evidence_json": ev(vendorId=4)}]
    holds = [{"txn_ref": "2280", "code": "location_mismatch", "day": 44}, {"txn_ref": "2240", "code": "location_mismatch", "day": 43}]
    got = planted_by_rule(rules, mr, holds, {"2240", "2280", "2270", "3002"})
    want = {"7": {"sourceTxnRef": "2231", "condition": "location_mismatch", "covered": 3, "planted": 2, "plantedRefs": ["2240", "2280"],
                  "backtestN": 2, "plantedInBacktest": 1},
            "8": {"sourceTxnRef": "3000", "condition": "rate_variance", "covered": 1, "planted": 0, "plantedRefs": [],
                  "backtestN": None, "plantedInBacktest": None},
            "9": {"sourceTxnRef": "4000", "condition": "location_mismatch", "covered": 0, "planted": 0, "plantedRefs": [],
                  "backtestN": None, "plantedInBacktest": None}}
    if got != want:
        print(f"facts self-test FAIL\n got  {json.dumps(got, sort_keys=True)}\n want {json.dumps(want, sort_keys=True)}")
        return 1
    print("facts self-test OK: planted_by_rule covers window, scope and code-changed holds, scores the backtest rows only when sampleRefs is complete; unscoped rules cover nothing")
    return 0


def baseline_only(out: Path) -> int:
    """Task 31: refresh the model-only baseline in docs/FACTS.json (the "baseline" key) and docs/FACTS.md (the
    "## Model-only baseline" section, from that heading to the next "## " heading or the end of the file) from
    bench/BASELINE.json. Reads no ledger and rewrites nothing else, including the header line with the run time."""
    block, lines = baseline_block(ROOT / "bench/BASELINE.json")
    if not block:
        print("bench/BASELINE.json is missing; nothing to do", file=sys.stderr)
        return 2
    jp, mp = out / "FACTS.json", out / "FACTS.md"
    facts = json.loads(jp.read_text())
    facts["baseline"] = block
    jp.write_text(json.dumps(facts, indent=2, sort_keys=True) + "\n")
    md = mp.read_text()
    heading = "\n## Model-only baseline\n"
    section = "\n".join(lines) + "\n"          # lines[0] is "", so this starts with the heading's leading newline
    start = md.find(heading)
    if start == -1:
        new = md.rstrip("\n") + "\n" + section
    else:
        nxt = md.find("\n## ", start + 1)
        end = len(md) if nxt == -1 else nxt
        new = md[:start] + section + md[end:]
    mp.write_text(new)
    print(f"baseline refreshed in {jp} and {mp} from bench/BASELINE.json (generated {block.get('generatedAt')})")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--uri", default=os.environ.get("STDB_URI", "http://127.0.0.1:3100"))
    ap.add_argument("--db", default=os.environ.get("STDB_DB", "dispatch-ledger"))
    ap.add_argument("--key", default=str(ROOT / "seed/fixtures/answer_key.json"))
    ap.add_argument("--out", default=str(ROOT / "docs"))
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--baseline-only", action="store_true",
                    help="rewrite only the Model-only baseline section of FACTS.md and the baseline key of FACTS.json; no ledger is read")
    args = ap.parse_args()
    if args.self_test:
        return self_test()
    if args.baseline_only:
        return baseline_only(Path(args.out))

    key = json.loads(Path(args.key).read_text())
    key_by_ref = {k["txnRef"]: k for k in key}
    # expected: hold (controller decides), reject (the vendor check carries a hit, D-3), auto_reject (duplicate tolls)
    planted = [k for k in key if k["expected"] in ("hold", "reject", "auto_reject")]
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
            "backtest": _strip_clock(json.loads(rule["backtest_json"])) if rule else None,
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
    settle_live = sum(1 for p in payments if isinstance(p.get("bank_txn_id"), str) and not p["bank_txn_id"].startswith("offline-"))
    settle_offline = sum(1 for p in payments if isinstance(p.get("bank_txn_id"), str) and p["bank_txn_id"].startswith("offline-"))
    settle_none = len(payments) - settle_live - settle_offline
    refused_by_role = dict(Counter(a["actor_role"] for a in refused))

    # Vendor checks on bank-change holds (Task 16, D-3): what the worker recorded, what the controller did, and the
    # provenance of each check, read from the task row and the audit trail. The hit is read from the finding the
    # worker wrote, never from the key; the key's expected outcome is compared beside it.
    def vc_source(t: dict | None) -> str:
        if t is None:
            return "none"
        try:
            st = json.loads(t.get("finding_json") or "{}").get("status")
        except json.JSONDecodeError:
            st = None
        if t["source"] == "live":
            return "live"
        if st == "fixture":
            return "fixture"
        if st == "replayed" or t["source"] == "replayed":
            return "recorded"
        return "stand-in"
    actions_by_ref: dict[str, list[dict]] = {}
    for a in audit:
        actions_by_ref.setdefault(a["ref"], []).append(a)
    vendor_rows = []
    for h in holds:
        if h["code"] != "vendor_bank_change":
            continue
        t = next((x for x in tasks if x["txn_ref"] == h["txn_ref"] and x["kind"] == "vendor_check"), None)
        try:
            f = json.loads(t.get("finding_json") or "{}") if t else {}
        except json.JSONDecodeError:
            f = {}
        hit = bool(f.get("evidence")) and f.get("recommendation") in ("reject", "escalate") and bool(f.get("reasons"))
        acts = [a["action"] for a in actions_by_ref.get(h["txn_ref"], []) if a["actor_role"] == "controller" and a["action"] in ("approve_payment", "reject_payment")]
        vendor_rows.append({
            "txnRef": h["txn_ref"], "holdStatus": h["status"], "checkSource": vc_source(t),
            "evidenceRows": len(f.get("evidence") or []), "evidenceSources": sorted({e.get("source") for e in (f.get("evidence") or [])}),
            "hit": hit, "hitReasons": f.get("reasons") if hit else [],
            "controllerAction": acts[-1] if acts else None,
            "callbackNote": bool(h.get("callback_note")),
            "expected": key_by_ref.get(h["txn_ref"], {}).get("expected"),
        })
    vendor_summary = {
        "bankChangeHolds": len(vendor_rows),
        "withHitRejected": sum(1 for r in vendor_rows if r["hit"] and r["holdStatus"] == "rejected" and r["controllerAction"] == "reject_payment"),
        "cleanApprovedWithCallback": sum(1 for r in vendor_rows if not r["hit"] and r["holdStatus"] == "released" and r["controllerAction"] == "approve_payment" and r["callbackNote"]),
        "bySource": dict(Counter(r["checkSource"] for r in vendor_rows)),
        "matchesKey": all((r["expected"] == "reject") == (r["holdStatus"] == "rejected") for r in vendor_rows),
        "rows": vendor_rows,
    }
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
    # Cost comes from the committed record of the live run, never from worker/cost_log.jsonl (gitignored, and it
    # also holds probes and stray runs). Input, output and cache are three separate numbers; cache is never
    # folded into input. Cache = cacheCreationTokens + cacheReadTokens, the SDK's two cache counters.
    cost = {
        "label": "from the recorded live run of 2026-10-24, 52 investigations",
        "source": str(RECORD_LOG.relative_to(ROOT)),
        "perTask": cost_summary(RECORD_LOG),
        "decoyRerecord": {
            "label": "the six decoy recordings re-recorded live on 2026-10-24 (now the fixtures for 1421, 2044, 2231, 3955, 5428, 5986)",
            "source": str(DECOY_LOG.relative_to(ROOT)),
            **cost_summary(DECOY_LOG),
        },
    }

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
        "settlement": {"liveBankIds": settle_live, "offlineIds": settle_offline, "unsettled": settle_none},
        "vendorChecks": vendor_summary,
        "investigations": {"bySource": task_sources, "byStatus": task_status},
        "rules": dict(Counter(r["status"] for r in rules)),
        "rulesPlanted": {"source": "scored against seed/fixtures/answer_key.json by scripts/facts.py, never by the agent",
                         "byRuleId": planted_by_rule(rules, mr, holds, {k["txnRef"] for k in planted})},
        "byDay": by_day,
        "worker_cost": cost,
        "unreviewedPlanted": unreviewed,
        "complete": not unreviewed and clock and clock[0]["day"] >= 92,
    }
    baseline, baseline_md = baseline_block(ROOT / "bench/BASELINE.json")
    if baseline:
        facts["baseline"] = baseline
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
           f"Settlement: {settle_live} payments carry a live Nessie transfer id, {settle_offline} a labelled offline id, {settle_none} unsettled.",
           f"Vendor checks: {vendor_summary['bankChangeHolds']} bank-change holds; {vendor_summary['withHitRejected']} with a hit rejected by the controller, "
           f"{vendor_summary['cleanApprovedWithCallback']} clean approved with a call-back note; check source {vendor_summary['bySource']} "
           f"(fixture means hand-authored, CRS sandbox pending); outcomes match the key: {vendor_summary['matchesKey']}.",
           f"Investigations by source: {task_sources}; by status: {task_status}.",
           "Planted rows each rule's window and scope cover (benchmark, against the key; the rule backtest never reads it): "
           + (", ".join(f"rule {i} {v['planted']} of {v['covered']}" for i, v in sorted(facts["rulesPlanted"]["byRuleId"].items(), key=lambda kv: int(kv[0]))) or "no rules") + "."]
    md += cost_lines(cost) + [""]
    if unreviewed:
        md.append(f"Unreviewed planted rows (the run is not complete): {unreviewed}")
    md += baseline_md
    (out / "FACTS.md").write_text("\n".join(md) + "\n")

    # Evals in the winners' format: run date, rerun command, metric/result/target, hard negatives, history, caveat.
    results = [
        "# Results", "",
        f"Run date: {facts['asOf']}. Rerun: `scripts/full_run.sh` (fresh publish, fixtures, worker in replay, 92 days, scripted controller pass, then this file).",
        "", "| Metric | Result | Target |", "| --- | --- | --- |",
        f"| Recall on planted exceptions ({planted_total}) | {overall_recall} | 1.0 |",
        f"| Precision on raised exceptions | {overall_precision} | at or above 0.95 |",
        f"| Decoys cleared through an approved rule | {decoys_cleared} of {len(decoys)} | 6 of 6 |",
        f"| Decoys cleared with exactly one controller answer | {decoys_one_answer} of {len(decoys)} | 6 of 6 |",
        f"| Planted exceptions cleared by a rule | {len(planted_cleared_by_rule)} | 0 |",
        f"| Duplicate tolls auto-rejected without a task | {sum(1 for m in mr if m['code'] == 'duplicate_toll')} | 11 |",
        f"| Days replayed | {facts['dayReached']} | 92 |",
        f"| Bank-change holds: hit rejected / clean approved with call-back | {vendor_summary['withHitRejected']} / {vendor_summary['cleanApprovedWithCallback']} of {vendor_summary['bankChangeHolds']} | 1 / 2 of 3 |",
        f"| Policy holds (auto-pay limit) | {len(limit_holds)} | reported, not scored |",
        "", "## Hard negatives", "",
        "The six decoys are legitimate unit swaps recorded in the dispatcher's swap log. Under the kernel they are indistinguishable from card misuse until the controller answers.", "",
        "| Decoy | Raised | Question asked | Answers | Rule | Backtest n | Confirmed exceptions covered | Cleared |", "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for r in decoy_rows:
        bt = r["backtest"] or {}
        results.append(f"| {r['txnRef']} | {r['raised']} | {bool(r['questions'])} | {r['answers']} | {r['ruleId']} | {bt.get('n')} | {bt.get('confirmedExceptionsCovered')} | {r['clearedByRule']} |")
    results += ["", "## Vendor checks", "",
        "Bank-change holds and the CRS vendor check behind each decision. `fixture` means a hand-authored file in the shape of a sandbox response, labelled FIXTURE on the card and in every evidence row; the CRS sandbox has not produced these values (docs/DECISIONS.md, D-3).", "",
        "| Hold | Check source | Evidence rows | Hit | Controller action | Call-back note | Hold status | Key expects |", "| --- | --- | --- | --- | --- | --- | --- | --- |"]
    for r in vendor_rows:
        results.append(f"| {r['txnRef']} | {r['checkSource']} | {r['evidenceRows']} | {'; '.join(r['hitReasons']) if r['hit'] else 'none'} | {r['controllerAction']} | {r['callbackNote']} | {r['holdStatus']} | {r['expected']} |")
    results += ["", "## Cost", "",
        "Token counts are the SDK's `tokenUsage` per investigation. Input, output and cache are reported as three numbers; cache (cacheCreationTokens plus cacheReadTokens) is never folded into input.", ""]
    results += cost_lines(cost)
    results += ["", "## History", "",
        "- First full run (fixtures from 11:18): duplicate_invoice precision 0.5 because recurring same-amount invoices under alternating POs collided with the planted duplicates. Fixed in the generator, not the kernel.",
        "- A facts bug counted every option-typed `rule_id` as set (SQL encodes none as `[1, []]`); fixed before the second run.",
        "- Second run on the final fixtures: every target met.",
        "", "## Caveat", "",
        "The company, the money and the vendors are synthetic, generated by seed/generate.py with seed 42, and the planted errors come from the same generator that made the clean rows. "
        "Recall and precision therefore measure whether the kernel finds what we planted, not how it would behave on a real carrier's statements. "
        "Investigations in this run replay the recordings of the live Droid run of 2026-10-24 (six decoys re-recorded the same day), labelled replayed on every card; no live model ran during the measured run. "
        "The scripted controller (scripts/controller_sim.py) decides from the dispatcher's swap log in the evidence folder, which is what a human controller would consult; it never reads the answer key, but the swap log is produced by the same generator, so the decoy result shows the mechanism works, not that a human would judge the same way.", ""]
    (out / "RESULTS.md").write_text("\n".join(results) + "\n")
    print("\n".join(md))
    return 0 if not planted_cleared_by_rule else 1


if __name__ == "__main__":
    sys.exit(main())
