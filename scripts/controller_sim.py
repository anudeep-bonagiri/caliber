#!/usr/bin/env python3
"""A scripted fleet controller for the offline run.

It does what the human controller does at the table, using only what a controller would have:
the public tables and the dispatcher's swap log in the evidence folder. It never reads the answer key.

For every hold waiting on the controller it decides from the swap log whether a location mismatch was a
legitimate unit swap (answer yes, which lets the worker draft a scoped rule) or card misuse (reject).
Other exception codes are rejected with a reason. Bank-change holds are released with a call-back note.
Policy holds (`limit`) are released. Candidate rules are approved. It loops until nothing is pending.

Usage: python scripts/controller_sim.py [--rounds 30] [--sleep 3] [--dry-run]
"""
import argparse
import json
import os
import re
import sys
import time
import urllib.request
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SWAP_LOG = ROOT / "seed/fixtures/evidence/swap_log.txt"
START = date(2026, 7, 1)


def load_env():
    env = dict(os.environ)
    p = ROOT / ".env"
    if p.exists():
        for line in p.read_text().splitlines():
            if "=" in line and not line.strip().startswith("#"):
                k, v = line.split("=", 1)
                env.setdefault(k.strip(), v.strip())
    return env


ENV = load_env()
URI, DB = ENV.get("STDB_URI", "http://127.0.0.1:3100"), ENV.get("STDB_DB", "dispatch-ledger")
TOKEN = ENV.get("STDB_CONTROLLER_TOKEN", "")


def day_for_date(d: date) -> int:
    n, cur = 0, START
    while cur <= d:
        if cur.weekday() < 5:
            n += 1
        cur += timedelta(days=1)
    return n


def sql(query: str) -> list[dict]:
    req = urllib.request.Request(f"{URI}/v1/database/{DB}/sql", data=query.encode(), method="POST")
    with urllib.request.urlopen(req, timeout=60) as r:
        res = json.loads(r.read().decode())[0]
    names = [e["name"]["some"] for e in res["schema"]["elements"]]
    out = []
    for raw in res["rows"]:
        row = {}
        for k, v in zip(names, raw):
            if isinstance(v, list) and len(v) == 2 and v[0] in (0, 1) and (v[0] == 1 and v[1] == [] or v[0] == 0):
                v = None if v[0] == 1 else v[1]
            row[k] = v
        out.append(row)
    return out


def call_try(name: str, *args):
    req = urllib.request.Request(f"{URI}/v1/database/{DB}/call/{name}", data=json.dumps(list(args)).encode(), method="POST")
    req.add_header("Authorization", f"Bearer {TOKEN}")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            body = json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return False, f"http {e.code}: {e.read().decode()[:200]}"
    if isinstance(body, list) and len(body) == 2:
        return bool(body[0]), str(body[1])
    return True, str(body)


SWAP_RE = re.compile(r"^(\d{4}-\d{2}-\d{2})\s+(.+?)\s+\(drv (\d+)\)\s+(\d+)\s+(\d+)\s+(.*)$")
THROUGH_RE = re.compile(r"through (\d{4}-\d{2}-\d{2})")


def load_swaps():
    """Returns a list of {driverId, name, ownUnit, reliefUnit, fromDay, toDay, date}."""
    swaps = []
    if not SWAP_LOG.exists():
        return swaps
    for line in SWAP_LOG.read_text().splitlines():
        m = SWAP_RE.match(line.strip())
        if not m:
            continue
        d, name, drv, frm, to, reason = m.groups()
        t = THROUGH_RE.search(reason)
        if "moved to unit" not in reason or not t:
            continue
        swaps.append({
            "driverId": int(drv), "name": name.strip(), "ownUnit": int(frm), "reliefUnit": int(to),
            "fromDay": day_for_date(date.fromisoformat(d)), "toDay": day_for_date(date.fromisoformat(t.group(1))), "date": d,
        })
    return swaps


def swap_for(swaps, driver_id: int, day: int):
    for s in swaps:
        if s["driverId"] == driver_id and s["fromDay"] <= day <= s["toDay"]:
            return s
    return None


def dollars(cents) -> str:
    return f"${int(cents) / 100:,.2f}"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--rounds", type=int, default=30)
    ap.add_argument("--sleep", type=float, default=3.0)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    if not TOKEN:
        print("STDB_CONTROLLER_TOKEN missing", file=sys.stderr)
        return 2
    swaps = load_swaps()
    print(f"swap log: {len(swaps)} swaps on record")
    acted = {"answered": 0, "rejected": 0, "released": 0, "rules_approved": 0, "refused": 0}
    decided = set()

    def act(name, *a):
        if args.dry_run:
            print(f"  dry-run {name} {a}")
            return True, "dry"
        ok, msg = call_try(name, *a)
        if not ok:
            acted["refused"] += 1
            print(f"  refused {name} {a[0]}: {msg}")
        return ok, msg

    for rnd in range(1, args.rounds + 1):
        holds = sql("SELECT * FROM hold")
        mr = {m["txn_ref"]: m for m in sql("SELECT * FROM match_result")}
        pending_tasks = [t for t in sql("SELECT * FROM agent_task") if t["status"] in ("open", "claimed")]
        did = 0

        for h in holds:
            ref = h["txn_ref"]
            if ref in decided:
                continue
            code, status = h["code"], h["status"]
            ev = json.loads(mr[ref]["evidence_json"]) if ref in mr else {}
            if status == "awaiting_controller":
                if code == "location_mismatch":
                    s = swap_for(swaps, int(ev.get("driverId", -1)), int(h["day"]))
                    if s:
                        text = (f"Yes. {s['name']} drove relief unit {s['reliefUnit']} that week while unit {s['ownUnit']} "
                                f"was in the shop, per the swap log entry of {s['date']}. He kept his own fuel card.")
                        ok, _ = act("try_answer_question", ref, text)
                        if ok: acted["answered"] += 1; decided.add(ref); did += 1
                    else:
                        ok, _ = act("try_reject_payment", ref, "Card misuse: the truck was not at the station and the swap log shows no reassignment for this driver.")
                        if ok: acted["rejected"] += 1; decided.add(ref); did += 1
                elif code == "rate_variance":
                    ok, _ = act("try_reject_payment", ref, f"Unit price above the contract rate ({ev.get('variancePct', '?')} percent); vendor to reissue at contract.")
                    if ok: acted["rejected"] += 1; decided.add(ref); did += 1
                elif code == "duplicate_invoice":
                    ok, _ = act("try_reject_payment", ref, f"Duplicate of {ev.get('duplicateOf', 'an earlier invoice')} under another PO.")
                    if ok: acted["rejected"] += 1; decided.add(ref); did += 1
                elif code == "short_received":
                    ok, _ = act("try_reject_payment", ref, f"Billed {ev.get('qty')} but received {ev.get('receivedQty')}; pay on credit memo for the received quantity only.")
                    if ok: acted["rejected"] += 1; decided.add(ref); did += 1
                elif code == "po_mismatch":
                    ok, _ = act("try_reject_payment", ref, f"PO reference does not match: {ev.get('reason', '')}.")
                    if ok: acted["rejected"] += 1; decided.add(ref); did += 1
                elif code == "vendor_bank_change":
                    ok, _ = act("try_approve_payment", ref, {"some": f"Called {ev.get('vendorName', 'the vendor')} on the number on file; new account confirmed by the AR desk."})
                    if ok: acted["released"] += 1; decided.add(ref); did += 1
                elif code == "capacity_exceeded":
                    ok, _ = act("try_reject_payment", ref, f"{ev.get('gallons')} gal exceeds the tank limit of {ev.get('capacityLimitGal')} gal.")
                    if ok: acted["rejected"] += 1; decided.add(ref); did += 1
            elif status == "open" and code == "location_mismatch" and not any(t["txn_ref"] == ref for t in pending_tasks):
                # the investigator held without asking; the controller still decides from the swap log
                s = swap_for(swaps, int(ev.get("driverId", -1)), int(h["day"]))
                if s:
                    text = (f"Yes. {s['name']} drove relief unit {s['reliefUnit']} that week while unit {s['ownUnit']} "
                            f"was in the shop, per the swap log entry of {s['date']}. He kept his own fuel card.")
                    ok, _ = act("try_answer_question", ref, text)
                    if ok: acted["answered"] += 1; decided.add(ref); did += 1
                else:
                    ok, _ = act("try_reject_payment", ref, "Card misuse: the truck was not at the station and the swap log shows no reassignment for this driver.")
                    if ok: acted["rejected"] += 1; decided.add(ref); did += 1
            elif status == "open" and code == "capacity_exceeded":
                ok, _ = act("try_reject_payment", ref, f"{ev.get('gallons')} gal exceeds the tank limit of {ev.get('capacityLimitGal')} gal; no question to ask.")
                if ok: acted["rejected"] += 1; decided.add(ref); did += 1
            elif status == "open" and code == "vendor_bank_change" and not any(t["txn_ref"] == ref for t in pending_tasks):
                ok, _ = act("try_approve_payment", ref, {"some": f"Called {ev.get('vendorName', 'the vendor')} on the number on file; new account confirmed by the AR desk."})
                if ok: acted["released"] += 1; decided.add(ref); did += 1
            elif status == "open" and code == "limit":
                ok, msg = act("try_approve_payment", ref, {"none": []})
                if not ok and "call-back" in msg:
                    ok, _ = act("try_approve_payment", ref, {"some": "Called the vendor on the number on file; account confirmed by the AR desk."})
                if ok: acted["released"] += 1; decided.add(ref); did += 1

        for r in sql("SELECT * FROM rule"):
            if r["status"] == "candidate":
                ok, _ = act("try_approve_rule", int(r["id"]))
                if ok: acted["rules_approved"] += 1; did += 1

        waiting = [h for h in sql("SELECT * FROM hold") if h["status"] in ("open", "awaiting_controller", "answered") and h["txn_ref"] not in decided]
        pending_tasks = [t for t in sql("SELECT * FROM agent_task") if t["status"] in ("open", "claimed")]
        print(f"round {rnd}: acted {did}, holds still pending {len(waiting)}, tasks in flight {len(pending_tasks)}")
        if did == 0 and not pending_tasks and not [h for h in waiting if h["status"] in ("awaiting_controller",)]:
            break
        if args.dry_run:
            break
        time.sleep(args.sleep)

    print(json.dumps(acted))
    left = [h for h in sql("SELECT * FROM hold") if h["status"] in ("open", "awaiting_controller", "answered")]
    if left:
        print(f"{len(left)} holds left pending:")
        for h in left[:20]:
            print(f"  {h['txn_ref']:10} {h['code']:20} {h['status']:20} {dollars(h['cents'])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
