#!/usr/bin/env python3
"""CarrierBench: the synthetic 40-truck carrier as a benchmark, with its controls and a machine audit.

One command, no network, no model, no ledger:

    python3 bench/carrierbench/carrierbench.py --seed 42

It does five things and writes bench/carrierbench/REPORT.md and REPORT.json:

  (a) fixtures   regenerates the fixtures with seed/generate.py into a temporary folder and compares the md5 of
                 every generated file against seed/fixtures (the working tree) and against the committed blob
                 (`git show HEAD:seed/fixtures/<file>`); `--no-regenerate` skips the generator and only compares
                 the working tree with the commit
  (b) counts     rows per kind, planted rows per code, decoys, days, trucks, drivers, vendors, read from the
                 fixtures and the answer key, never typed
  (c) controls   held-out entities: planted rows whose truck or vendor carries no other planted row (computed,
                 not asserted); the decoys and their swap-log lines; the auto-pay policy holds that are not
                 exceptions
  (d) audit      for every answer-key row, the Python mirror of the kernel (seed/mirror.py) is run on the row's
                 own evidence (nearest ping, tank size, earlier tolls, contract rate, PO and receiving, bank-change
                 window) and must raise the key's code; the evidence it used is recorded; any row that fails is
                 listed; rows the mirror flags that are not in the key are listed too (there must be none)
  (e) report     REPORT.md for people, REPORT.json for docs/paper/numbers.py

The answer key is read here because the bench is the scorer. No agent code reads it (seed/README.md).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
import tempfile
import time
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
SEED_DIR = ROOT / "seed"
FIXTURES = SEED_DIR / "fixtures"
if str(SEED_DIR) not in sys.path:
    sys.path.insert(0, str(SEED_DIR))

import mirror  # noqa: E402  (seed/mirror.py, the Python copy of spacetimedb/src/kernel.ts)
import simcal  # noqa: E402

# Files seed/generate.py writes. nessie_accounts.json is written by the Nessie step, not the generator.
GENERATED = ["answer_key.json", "card_txns.json", "contracts.json", "drivers.json", "invoices.json", "pos.json",
             "summary.json", "terminals.json", "toll_txns.json", "trip_pings.json", "trucks.json", "vendors.json"]
CODES = ["location_mismatch", "capacity_exceeded", "rate_variance", "duplicate_toll", "duplicate_invoice",
         "vendor_bank_change", "short_received"]
EVIDENCE_DIR = {"card": "receipts", "toll": "tolls", "invoice": "invoices"}


def md5(path: Path) -> str | None:
    if not path.exists():
        return None
    h = hashlib.md5()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def committed_md5(rel: str) -> str | None:
    try:
        blob = subprocess.run(["git", "show", f"HEAD:{rel}"], cwd=ROOT, check=True, capture_output=True).stdout
    except subprocess.CalledProcessError:
        return None
    return hashlib.md5(blob).hexdigest()


def kind_of(ref: str) -> str:
    if ref.startswith("INV-"):
        return "invoice"
    if ref.startswith("T"):
        return "toll"
    return "card"


# ---------------------------------------------------------------------------
# (a) fixtures
# ---------------------------------------------------------------------------
def check_fixtures(seed: int, regenerate: bool) -> dict:
    out = {"seed": seed, "regenerated": regenerate, "files": [], "allMatchCommit": True, "allMatchRegenerated": None,
           "generatorSeconds": None, "generator": "seed/generate.py"}
    regen_dir: Path | None = None
    tmp: tempfile.TemporaryDirectory | None = None
    if regenerate:
        tmp = tempfile.TemporaryDirectory(prefix="carrierbench-")
        regen_dir = Path(tmp.name) / "fixtures"
        t0 = time.time()
        subprocess.run([sys.executable, str(SEED_DIR / "generate.py"), "--seed", str(seed), "--out", str(regen_dir)],
                       cwd=SEED_DIR, check=True, capture_output=True)
        out["generatorSeconds"] = round(time.time() - t0, 2)
        out["allMatchRegenerated"] = True
    for name in GENERATED:
        rel = f"seed/fixtures/{name}"
        tree = md5(FIXTURES / name)
        commit = committed_md5(rel)
        row = {"file": rel, "workingTree": tree, "committed": commit, "matchesCommit": tree is not None and tree == commit}
        if regen_dir is not None:
            regen = md5(regen_dir / name)
            row["regenerated"] = regen
            row["matchesRegenerated"] = regen is not None and regen == tree
            out["allMatchRegenerated"] = out["allMatchRegenerated"] and row["matchesRegenerated"]
        out["allMatchCommit"] = out["allMatchCommit"] and row["matchesCommit"]
        out["files"].append(row)
    if tmp is not None:
        tmp.cleanup()
    return out


# ---------------------------------------------------------------------------
# (b) counts
# ---------------------------------------------------------------------------
def load_all() -> dict:
    fx = {name: mirror.load_table(FIXTURES, name) for name in
          ("terminals", "trucks", "drivers", "trip_pings", "card_txns", "toll_txns", "vendors", "contracts", "pos", "invoices")}
    fx["answer_key"] = json.loads((FIXTURES / "answer_key.json").read_text())
    fx["summary"] = json.loads((FIXTURES / "summary.json").read_text())
    return fx


def counts(fx: dict) -> dict:
    key = fx["answer_key"]
    planted = Counter(r["code"] for r in key if r["expected"] != "clear_after_question")
    expected = Counter(r["expected"] for r in key)
    decoys = [r["txnRef"] for r in key if r["expected"] == "clear_after_question"]
    return {
        "days": simcal.TOTAL_DAYS,
        "calendar": {"day1": simcal.iso_date(1), "dayLast": simcal.iso_date(simcal.TOTAL_DAYS)},
        "terminals": len(fx["terminals"]), "trucks": len(fx["trucks"]), "drivers": len(fx["drivers"]),
        "vendors": len(fx["vendors"]), "contracts": len(fx["contracts"]), "purchaseOrders": len(fx["pos"]),
        "rows": {"card": len(fx["card_txns"]), "toll": len(fx["toll_txns"]), "invoice": len(fx["invoices"]),
                 "total": len(fx["card_txns"]) + len(fx["toll_txns"]) + len(fx["invoices"])},
        "telematicsPings": len(fx["trip_pings"]),
        "plantedByCode": {c: planted.get(c, 0) for c in CODES},
        "plantedTotal": sum(planted.values()),
        "decoys": len(decoys), "decoyRefs": sorted(decoys),
        "answerKeyRows": len(key),
        "expectedOutcomes": dict(sorted(expected.items())),
        "errorClasses": len([c for c in CODES if planted.get(c, 0)]),
        "cleanRows": len(fx["card_txns"]) + len(fx["toll_txns"]) + len(fx["invoices"]) - len(key),
        "fuelCards": len({t["fuelCardId"] for t in fx["trucks"]}),
        "tollPlazas": len({t["plazaId"] for t in fx["toll_txns"]}),
        "stations": len({c["stationName"] for c in fx["card_txns"]}),
    }


# ---------------------------------------------------------------------------
# (d) the mirror on every row, keeping the evidence it used
# ---------------------------------------------------------------------------
def verdicts_with_evidence(fx: dict) -> dict[str, dict]:
    """Same loop as mirror.run, but every row keeps the evidence dict the rule used."""
    trucks = {t["id"]: t for t in fx["trucks"]}
    by_card = {t["fuelCardId"]: t for t in trucks.values()}
    pings_by_truck: dict[int, list[tuple[int, dict]]] = defaultdict(list)
    for p in fx["trip_pings"]:
        pings_by_truck[p["truckId"]].append((simcal.iso_to_micros(p["at"]), p))
    out: dict[str, dict] = {}
    for txn in fx["card_txns"]:
        truck = by_card.get(txn["cardId"])
        code, ev = mirror.evaluate_card(txn, truck, pings_by_truck.get(txn["truckId"], []))
        out[txn["id"]] = {"kind": "card", "code": code, "evidence": ev, "day": txn["day"], "cents": txn["cents"],
                          "truckId": txn["truckId"], "driverId": txn["driverId"], "vendorId": None,
                          "evidenceInputs": {"tankGal": truck["tankGal"] if truck else None, "gallons": txn["gallons"],
                                             "pingsForTruck": len(pings_by_truck.get(txn["truckId"], []))}}
    tolls_sorted = sorted(((simcal.iso_to_micros(t["at"]), t) for t in fx["toll_txns"]), key=lambda x: (x[0], x[1]["id"]))
    seen_by_plate: dict[str, list[tuple[int, dict]]] = defaultdict(list)
    for micros, t in tolls_sorted:
        earlier = seen_by_plate[t["plate"]]
        code, ev = mirror.evaluate_toll(t, micros, earlier)
        out[t["id"]] = {"kind": "toll", "code": code, "evidence": ev, "day": t["day"], "cents": t["cents"],
                        "truckId": t["truckId"], "driverId": None, "vendorId": None,
                        "evidenceInputs": {"plate": t["plate"], "plazaId": t["plazaId"], "earlierTollsSamePlate": len(earlier)}}
        earlier.append((micros, t))
    vendors = {v["id"]: v for v in fx["vendors"]}
    pos = {p["id"]: p for p in fx["pos"]}
    invoices = sorted(fx["invoices"], key=lambda i: (i["receivedDay"], i["id"]))
    seen_by_vendor: dict[int, list[dict]] = defaultdict(list)
    for inv in invoices:
        po = pos.get(inv["poId"]) if inv.get("poId") is not None else None
        contract = next((c for c in fx["contracts"] if c["vendorId"] == inv["vendorId"] and c["item"] == inv["item"]
                         and c["validFromDay"] <= inv["receivedDay"] <= c["validToDay"]), None)
        earlier = seen_by_vendor[inv["vendorId"]]
        code, ev = mirror.evaluate_invoice(inv, po, contract, vendors.get(inv["vendorId"]), earlier)
        out[inv["id"]] = {"kind": "invoice", "code": code, "evidence": ev, "day": inv["receivedDay"], "cents": inv["cents"],
                          "truckId": po["truckId"] if po else None, "driverId": None, "vendorId": inv["vendorId"],
                          "evidenceInputs": {"poId": inv.get("poId"), "poReceivedQty": po["receivedQty"] if po else None,
                                             "contractId": contract["id"] if contract else None,
                                             "contractRateCents": contract["rateCents"] if contract else None,
                                             "bankChangedDay": vendors[inv["vendorId"]]["bankChangedDay"],
                                             "earlierInvoicesSameVendor": len(earlier)}}
        earlier.append(inv)
    return out


def audit(fx: dict, verdicts: dict[str, dict], mirror_run: dict) -> dict:
    key = {r["txnRef"]: r for r in fx["answer_key"]}
    rows = []
    failures = []
    for ref, k in sorted(key.items(), key=lambda kv: (kv[1]["code"], kv[0])):
        v = verdicts[ref]
        is_decoy = k["expected"] == "clear_after_question"
        # a decoy must look like a location mismatch from the records alone; the swap log is the extra evidence
        ok = v["code"] == k["code"]
        ev_file = FIXTURES / "evidence" / EVIDENCE_DIR[v["kind"]] / f"{ref}.txt"
        row = {"txnRef": ref, "kind": v["kind"], "keyCode": k["code"], "expected": k["expected"], "mirrorCode": v["code"],
               "inferableFromEvidence": ok, "decoy": is_decoy, "day": v["day"], "cents": v["cents"],
               "evidenceUsed": v["evidence"], "evidenceInputs": v["evidenceInputs"],
               "evidenceFile": str(ev_file.relative_to(ROOT)) if ev_file.exists() else None}
        rows.append(row)
        if not ok or row["evidenceFile"] is None:
            failures.append(ref)
    extra = sorted(set(mirror_run["flagged"]) - set(key))
    wrong = sorted(r for r in key if r in mirror_run["flagged"] and mirror_run["flagged"][r] != key[r]["code"])
    missing = sorted(set(key) - set(mirror_run["flagged"]))
    by_code = {}
    for c in CODES:
        rs = [r for r in rows if r["keyCode"] == c]
        by_code[c] = {"rows": len(rs), "inferable": sum(1 for r in rs if r["inferableFromEvidence"]),
                      "withEvidenceFile": sum(1 for r in rs if r["evidenceFile"])}
    return {
        "rowsAudited": len(rows), "inferable": sum(1 for r in rows if r["inferableFromEvidence"]),
        "withEvidenceFile": sum(1 for r in rows if r["evidenceFile"]),
        "failures": failures, "passed": not failures and not extra and not wrong and not missing,
        "mirrorFlaggedNotInKey": extra, "mirrorWrongCode": wrong, "keyRowsNotFlagged": missing,
        "rowsEvaluatedByMirror": mirror_run["n"], "mirrorFlagged": len(mirror_run["flagged"]),
        "byCode": by_code,
        "swapLog": str((FIXTURES / "evidence" / "swap_log.txt").relative_to(ROOT)) if (FIXTURES / "evidence" / "swap_log.txt").exists() else None,
        "rows": rows,
    }


# ---------------------------------------------------------------------------
# (c) controls
# ---------------------------------------------------------------------------
def controls(fx: dict, verdicts: dict[str, dict], mirror_run: dict) -> dict:
    key = fx["answer_key"]
    planted = [r for r in key if r["expected"] != "clear_after_question"]
    decoys = [r for r in key if r["expected"] == "clear_after_question"]
    truck_rows: dict[int, list[str]] = defaultdict(list)
    vendor_rows: dict[int, list[str]] = defaultdict(list)
    for r in key:
        v = verdicts[r["txnRef"]]
        if v["kind"] in ("card", "toll"):
            truck_rows[v["truckId"]].append(r["txnRef"])
        else:
            vendor_rows[v["vendorId"]].append(r["txnRef"])
    held_out_trucks = sorted(t for t, refs in truck_rows.items() if len(refs) == 1)
    held_out_vendors = sorted(v for v, refs in vendor_rows.items() if len(refs) == 1)
    planted_refs = {r["txnRef"] for r in planted}
    held_out_rows = sorted([refs[0] for t, refs in truck_rows.items() if len(refs) == 1 and refs[0] in planted_refs]
                           + [refs[0] for v, refs in vendor_rows.items() if len(refs) == 1 and refs[0] in planted_refs])
    all_trucks = {t["id"] for t in fx["trucks"]}
    all_vendors = {v["id"] for v in fx["vendors"]}
    drivers = {d["id"]: d for d in fx["drivers"]}
    swap_log = (FIXTURES / "evidence" / "swap_log.txt").read_text().splitlines() if (FIXTURES / "evidence" / "swap_log.txt").exists() else []
    decoy_rows = []
    for r in decoys:
        v = verdicts[r["txnRef"]]
        drv = drivers.get(v["driverId"], {})
        lines = [ln for ln in swap_log if f"(drv {v['driverId']})" in ln]
        decoy_rows.append({"txnRef": r["txnRef"], "day": v["day"], "truckId": v["truckId"], "driverId": v["driverId"],
                           "driver": drv.get("name"), "mirrorCode": v["code"], "distanceMiles": v["evidence"].get("distanceMiles"),
                           "swapLogLines": len(lines)})
    limits = mirror_run["limits"]
    return {
        "heldOut": {
            "definition": "an entity (truck for card and toll rows, vendor for invoices) that carries exactly one answer-key row; "
                          "a system that learned an entity's pattern from one planted row has nothing else on that entity to learn from",
            "trucksWithExactlyOnePlantedRow": held_out_trucks, "trucksWithExactlyOnePlantedRowCount": len(held_out_trucks),
            "vendorsWithExactlyOnePlantedRow": held_out_vendors, "vendorsWithExactlyOnePlantedRowCount": len(held_out_vendors),
            "plantedRowsOnHeldOutEntities": held_out_rows, "plantedRowsOnHeldOutEntitiesCount": len(held_out_rows),
            "trucksWithNoPlantedRow": len(all_trucks - set(truck_rows)), "trucksTotal": len(all_trucks),
            "vendorsWithNoPlantedRow": len(all_vendors - set(vendor_rows)), "vendorsTotal": len(all_vendors),
            "plantedRowsPerTruck": {str(t): len(refs) for t, refs in sorted(truck_rows.items())},
            "plantedRowsPerVendor": {str(v): len(refs) for v, refs in sorted(vendor_rows.items())},
        },
        "decoys": {"definition": "a legitimate unit swap recorded in the dispatcher's swap log; the records the kernel reads cannot "
                                 "distinguish it from card misuse, so the right behaviour is hold, ask once, clear through a rule",
                   "count": len(decoy_rows), "rows": decoy_rows,
                   "allLookLikeLocationMismatch": all(d["mirrorCode"] == "location_mismatch" for d in decoy_rows),
                   "allHaveSwapLogLines": all(d["swapLogLines"] > 0 for d in decoy_rows)},
        "policyHolds": {"definition": "clean rows above the per-transaction auto-pay limit or past the daily cap; a hold by policy, "
                                      "not an exception, and not in the answer key",
                        "count": len(limits), "refs": limits,
                        "perTransactionCapCents": mirror.T["AUTO_PAY_MAX_CENTS"], "dailyCapCents": mirror.T["AUTO_PAY_DAY_MAX_CENTS"]},
        "thresholds": dict(mirror.T),
    }


# ---------------------------------------------------------------------------
# (e) report
# ---------------------------------------------------------------------------
def write_report(rep: dict, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "REPORT.json").write_text(json.dumps(rep, indent=2, sort_keys=True) + "\n")
    c, f, ctl, a = rep["counts"], rep["fixtures"], rep["controls"], rep["audit"]
    md = [f"# CarrierBench report", "",
          f"Generated {rep['generatedAt']} by bench/carrierbench/carrierbench.py --seed {f['seed']}. Nothing in this file is typed by hand.", "",
          "## Fixtures", "",
          f"- Generator: {f['generator']}, seed {f['seed']}. "
          + (f"Regenerated in {f['generatorSeconds']} s; every generated file byte-identical to seed/fixtures: {f['allMatchRegenerated']}. " if f["regenerated"] else "Not regenerated this run. ")
          + f"Working tree matches the committed fixtures (git HEAD): {f['allMatchCommit']}.", "",
          "| File | md5 (working tree) | matches commit | matches regenerated |", "| --- | --- | --- | --- |"]
    for row in f["files"]:
        md.append(f"| {row['file']} | {row['workingTree']} | {row['matchesCommit']} | {row.get('matchesRegenerated', 'n/a')} |")
    md += ["", "## Counts", "",
           f"- {c['days']} business days ({c['calendar']['day1']} to {c['calendar']['dayLast']}), {c['terminals']} terminals, {c['trucks']} trucks, "
           f"{c['drivers']} drivers, {c['fuelCards']} fuel cards, {c['vendors']} maintenance vendors, {c['contracts']} contracts, {c['purchaseOrders']} purchase orders, "
           f"{c['stations']} stations, {c['tollPlazas']} toll plazas, {c['telematicsPings']:,} telematics pings.",
           f"- Rows: {c['rows']['card']:,} fuel-card transactions, {c['rows']['toll']:,} tolls, {c['rows']['invoice']} invoices; {c['rows']['total']:,} in all; "
           f"{c['cleanRows']:,} clean.",
           f"- Answer key: {c['answerKeyRows']} rows = {c['plantedTotal']} planted exceptions in {c['errorClasses']} classes + {c['decoys']} decoys. "
           f"Expected outcomes: {c['expectedOutcomes']}.", "",
           "| Code | Planted |", "| --- | --- |"]
    for code in CODES:
        md.append(f"| {code} | {c['plantedByCode'][code]} |")
    h = ctl["heldOut"]
    md += ["", "## Controls", "",
           f"- Held-out entities (computed): {h['trucksWithExactlyOnePlantedRowCount']} of {h['trucksTotal']} trucks carry exactly one answer-key row, "
           f"{h['trucksWithNoPlantedRow']} carry none; {h['vendorsWithExactlyOnePlantedRowCount']} of {h['vendorsTotal']} vendors carry exactly one, "
           f"{h['vendorsWithNoPlantedRow']} carry none. {h['plantedRowsOnHeldOutEntitiesCount']} planted rows sit on an entity with no other planted row.",
           f"- Decoys: {ctl['decoys']['count']}; all look like location_mismatch to the kernel: {ctl['decoys']['allLookLikeLocationMismatch']}; "
           f"all have a swap-log line for the driver: {ctl['decoys']['allHaveSwapLogLines']}.",
           f"- Policy holds (auto-pay limit, not exceptions): {ctl['policyHolds']['count']} {ctl['policyHolds']['refs']}.", "",
           "| Decoy | Day | Truck | Driver | Miles from nearest ping | Swap-log lines |", "| --- | --- | --- | --- | --- | --- |"]
    for d in ctl["decoys"]["rows"]:
        md.append(f"| {d['txnRef']} | {d['day']} | {d['truckId']} | {d['driver']} (drv {d['driverId']}) | {d['distanceMiles']} | {d['swapLogLines']} |")
    md += ["", "## Machine audit", "",
           f"- seed/mirror.py (the Python copy of spacetimedb/src/kernel.ts) evaluated {a['rowsEvaluatedByMirror']:,} rows from their own evidence and flagged {a['mirrorFlagged']}.",
           f"- Answer-key rows audited: {a['rowsAudited']}; inferable from evidence with the key's code: {a['inferable']}; with an evidence file: {a['withEvidenceFile']}.",
           f"- Rows flagged by the mirror that are not in the key: {a['mirrorFlaggedNotInKey']}; key rows with the wrong code: {a['mirrorWrongCode']}; key rows not flagged: {a['keyRowsNotFlagged']}.",
           f"- Failures: {a['failures']}. Audit passed: {a['passed']}.", "",
           "| Code | Rows | Inferable | Evidence file |", "| --- | --- | --- | --- |"]
    for code in CODES:
        b = a["byCode"][code]
        md.append(f"| {code} | {b['rows']} | {b['inferable']} | {b['withEvidenceFile']} |")
    md += ["", "Per-row evidence is in REPORT.json under audit.rows (evidenceUsed is the kernel rule's evidence object; evidenceInputs are the lookups it was given).", ""]
    (out_dir / "REPORT.md").write_text("\n".join(md))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--no-regenerate", action="store_true", help="skip the generator; compare the working tree with the commit only")
    ap.add_argument("--out", default=str(HERE), help="folder for REPORT.md and REPORT.json")
    args = ap.parse_args()

    t0 = time.time()
    fixtures = check_fixtures(args.seed, not args.no_regenerate)
    fx = load_all()
    if fx["summary"].get("seed") != args.seed:
        print(f"warning: seed/fixtures/summary.json says seed {fx['summary'].get('seed')}, asked for {args.seed}", file=sys.stderr)
    run = mirror.run(FIXTURES)
    verdicts = verdicts_with_evidence(fx)
    assert {r for r, v in verdicts.items() if v["code"] != "matched"} == set(run["flagged"]), "evidence loop disagrees with mirror.run"
    rep = {
        "name": "CarrierBench",
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "command": f"python3 bench/carrierbench/carrierbench.py --seed {args.seed}" + (" --no-regenerate" if args.no_regenerate else ""),
        "fixtures": fixtures,
        "counts": counts(fx),
        "controls": controls(fx, verdicts, run),
        "audit": audit(fx, verdicts, run),
        "secondsTotal": None,
    }
    rep["secondsTotal"] = round(time.time() - t0, 2)
    write_report(rep, Path(args.out))
    a = rep["audit"]
    print(f"CarrierBench seed {args.seed}: {rep['counts']['rows']['total']:,} rows, {rep['counts']['plantedTotal']} planted in "
          f"{rep['counts']['errorClasses']} classes, {rep['counts']['decoys']} decoys; fixtures match commit {fixtures['allMatchCommit']}, "
          f"match regenerated {fixtures['allMatchRegenerated']}; audit {a['inferable']}/{a['rowsAudited']} inferable, passed {a['passed']}; "
          f"{rep['secondsTotal']} s. Wrote {Path(args.out) / 'REPORT.md'} and REPORT.json")
    return 0 if a["passed"] and fixtures["allMatchCommit"] and fixtures["allMatchRegenerated"] in (True, None) else 1


if __name__ == "__main__":
    raise SystemExit(main())
