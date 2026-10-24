#!/usr/bin/env python3
"""Evidence for a live worker run (WORKER_MODE=record or live).

Reads the worker log, worker/cost_log.jsonl, the public agent_task table and seed/fixtures/investigations/
and prints: the tool ids listTools() returned, the tool_call steps for one task (default 2231), token and
time per task, and every investigate task whose finding is still a scripted stand-in, by id.

Usage: python3 scripts/live_report.py [--txn 2231] [--log logs/worker.log]
"""
import argparse
import json
import os
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def env():
    e = dict(os.environ)
    p = ROOT / ".env"
    if p.exists():
        for line in p.read_text().splitlines():
            if "=" in line and not line.strip().startswith("#"):
                k, v = line.split("=", 1)
                e.setdefault(k.strip(), v.strip())
    return e


def sql(uri, db, q):
    r = urllib.request.urlopen(urllib.request.Request(f"{uri}/v1/database/{db}/sql", data=q.encode(), method="POST"), timeout=60)
    res = json.loads(r.read())[0]
    names = [x["name"]["some"] for x in res["schema"]["elements"]]
    return [dict(zip(names, row)) for row in res["rows"]]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--txn", default="2231")
    ap.add_argument("--log", default=str(ROOT / "logs/worker.log"))
    a = ap.parse_args()
    e = env()
    uri, db = e.get("STDB_URI", "http://127.0.0.1:3100"), e.get("STDB_DB", "dispatch-ledger")

    print("## listTools() ids (from the worker log)")
    log = Path(a.log).read_text() if Path(a.log).exists() else ""
    tools = [l for l in log.splitlines() if "droid tools:" in l or "disabling additional write tools" in l]
    print("\n".join(tools[-3:]) if tools else "(no listTools line in the log; the worker prints it once per process when a session opens)")

    tasks = sql(uri, db, "SELECT * FROM agent_task")
    inv = [t for t in tasks if t["kind"] == "investigate"]
    by_src = {}
    for t in inv:
        by_src[t["source"]] = by_src.get(t["source"], 0) + 1
    print(f"\n## investigate tasks by source: {by_src}")

    print(f"\n## tool_call steps for {a.txn}")
    for t in inv:
        if t["txn_ref"] == a.txn:
            try:
                steps = json.loads(t["steps_json"])
            except json.JSONDecodeError:
                steps = []
            for s in steps:
                if s.get("type") == "tool_call":
                    print(f"  {s.get('name')}  {json.dumps(s.get('input'))[:160]}")
                elif s.get("type") == "tool_result":
                    print(f"    -> {s.get('toolName')}: {str(s.get('content'))[:120]}")
            try:
                f = json.loads(t["finding_json"])
                print(f"  finding: {f.get('finding', '')[:200]}")
                print(f"  recommendation: {f.get('recommendation')}  confidence: {f.get('confidence')}  status: {f.get('status')}  source: {t['source']}")
            except json.JSONDecodeError:
                pass

    print("\n## token and time per task (worker/cost_log.jsonl)")
    cost = ROOT / "worker/cost_log.jsonl"
    rows = []
    if cost.exists():
        for line in cost.read_text().splitlines():
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    if rows:
        print(f"{'subtype':>12} {'txn':>10} {'in':>7} {'out':>6} {'ms':>7}")
        tot_in = tot_out = tot_ms = 0
        for r in rows:
            tu = r.get("tokenUsage") or {}
            i, o, ms = int(tu.get("inputTokens", 0) or 0), int(tu.get("outputTokens", 0) or 0), int(r.get("durationMs", 0) or 0)
            tot_in += i; tot_out += o; tot_ms += ms
            print(f"{str(r.get('subtype', '')):>12} {str(r.get('txnRef', '')):>10} {i:>7} {o:>6} {ms:>7}")
        print(f"{'total':>6} {len(rows):>10} {tot_in:>7} {tot_out:>6} {tot_ms:>7}  (avg {tot_ms // max(1, len(rows))} ms)")
    else:
        print("(no cost_log.jsonl; no live Droid session has run)")

    print("\n## investigate tasks still scripted stand-ins (source none), by txn_ref")
    stand = sorted(t["txn_ref"] for t in inv if t["source"] == "none")
    print(", ".join(stand) if stand else "none")
    fixtures = sorted(p.stem for p in (ROOT / "seed/fixtures/investigations").glob("*.json"))
    print(f"\n## recorded fixtures on disk ({len(fixtures)}): {', '.join(fixtures)}")


if __name__ == "__main__":
    main()
