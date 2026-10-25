"""Droid investigator table, computed from the recorded live runs of 2026-10-24.

Reads only committed files: the recordings in seed/fixtures/investigations (and the originals kept in _v1/),
the two cost logs and the listTools() evidence file in docs/evidence, worker/src/droid.ts for the autonomy
setting, and, for the BENCHMARK block only, seed/fixtures/answer_key.json with the dispatcher's swap log and the
seed fixtures. The agent never sees the key; this script is the scorer.

Writes bench/carrierbench/droid_table.json and rewrites the "## Droid investigator, 52 recorded runs" section at
the end of docs/RESULTS.md from that JSON (the rest of the file is left byte for byte as it was).

    python3 bench/carrierbench/droid_table.py            # JSON and the RESULTS.md section
    python3 bench/carrierbench/droid_table.py --no-results   # JSON only

Standard library only, Python 3.12 or newer.
"""
from __future__ import annotations

import argparse
import json
import re
import statistics
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REC_DIR = ROOT / "seed/fixtures/investigations"
V1_DIR = REC_DIR / "_v1"
FIX = ROOT / "seed/fixtures"
EVID = ROOT / "docs/evidence"
COST_LIVE = EVID / "cost_log_live_record_2026-10-24.jsonl"
COST_DECOY = EVID / "cost_log_decoy_rerecord_2026-10-24.jsonl"
LIST_TOOLS = EVID / "droid_listTools_2026-10-24.txt"
DROID_TS = ROOT / "worker/src/droid.ts"
OUT_JSON = ROOT / "bench/carrierbench/droid_table.json"
RESULTS = ROOT / "docs/RESULTS.md"
HEADING = "## Droid investigator, 52 recorded runs"

RECS = ("clear", "hold", "hold_and_ask")
FILE_TOOLS = ("Read", "Grep", "Glob")
# recordings carry absolute paths from the recording laptop; the evidence folder is recognised by its suffix so the
# script gives the same answer from any clone
EVIDENCE_MARK = "/dispatch-ledger/seed/fixtures/evidence/"


# ---------------------------------------------------------------------------
# loading
# ---------------------------------------------------------------------------
def load_dir(d: Path) -> dict[str, dict]:
    return {p.stem: json.loads(p.read_text()) for p in sorted(d.glob("*.json"))}


def rel(path: str) -> str:
    # repo paths relative to the repo; anything else under a home folder as ~/...
    for root in (str(ROOT) + "/",):
        if path.startswith(root):
            return path[len(root):]
    i = path.find("/dispatch-ledger/")
    if i >= 0:
        return path[i + len("/dispatch-ledger/"):]
    return re.sub(r"^/(?:Users|home)/[^/]+/", "~/", path)


def home_rel(path: str) -> str:
    # absolute paths outside the repo's evidence folder, with the home folder shown as ~
    return re.sub(r"^/(?:Users|home)/[^/]+/", "~/", path)


def stats(xs: list[float]) -> dict:
    if not xs:
        return {"n": 0}
    return {"n": len(xs), "mean": round(statistics.mean(xs), 1), "median": statistics.median(xs),
            "min": min(xs), "max": max(xs), "total": sum(xs)}


def dist(xs: list[int]) -> dict[str, int]:
    return {str(k): v for k, v in sorted(Counter(xs).items())}


# ---------------------------------------------------------------------------
# per-recording measurements
# ---------------------------------------------------------------------------
def measure(ref: str, rec: dict) -> dict:
    steps = rec["steps"]
    calls = [s for s in steps if s["type"] == "tool_call"]
    results = {s["toolUseId"]: s for s in steps if s["type"] == "tool_result"}
    names = Counter(c["name"] for c in calls)
    perm = [s["text"] for s in steps if s["type"] == "note" and s["text"].startswith("permission ")]

    # which inner tool calls each permission decision covered: the note follows the Script call it was asked
    # for; the inner calls are the tool_calls after the note up to that Script's tool_result
    covered: list[str] = []
    covered_ids: set[str] = set()
    decisions_with_mcp = 0
    for i, s in enumerate(steps):
        if s["type"] == "note" and s["text"].startswith("permission "):
            prev = next((p for p in reversed(steps[:i]) if p["type"] == "tool_call"), None)
            inner: list[str] = []
            for t in steps[i + 1:]:
                if prev and t["type"] == "tool_result" and t["toolUseId"] == prev["toolUseId"]:
                    break
                if t["type"] == "tool_call":
                    covered.append(t["name"])
                    covered_ids.add(t["toolUseId"])
                    inner.append(t["name"])
            decisions_with_mcp += any(n.startswith("elastic___") for n in inner)

    reads = []
    for c in calls:
        if c["name"] != "Read":
            continue
        r = results.get(c["toolUseId"])
        path = (c.get("input") or {}).get("file_path", "")
        reads.append({"path": path, "ok": bool(r) and not r.get("isError"),
                      "inEvidence": EVIDENCE_MARK in path, "underPermission": c["toolUseId"] in covered_ids})

    f = rec["finding"]
    return {
        "txnRef": ref,
        "recordedAt": rec.get("recordedAt"),
        "recommendation": f["recommendation"],
        "question": f.get("question_for_controller"),
        "mcpCalls": sum(v for k, v in names.items() if k.startswith("elastic___")),
        "mcpByTool": {k: v for k, v in sorted(names.items()) if k.startswith("elastic___")},
        "fileToolCalls": {t: names.get(t, 0) for t in FILE_TOOLS},
        "permissionProceedOnce": sum(1 for p in perm if p.startswith("permission proceed once")),
        "permissionCancelled": sum(1 for p in perm if p.startswith("permission cancelled")),
        "permissionNotes": perm,
        "permissionCovered": covered,
        "permissionDecisionsCoveringMcp": decisions_with_mcp,
        "reads": reads,
        "findingDurationMs": f.get("durationMs"),
        "findingTokenUsage": f.get("tokenUsage"),
    }


def summarise(ms: list[dict]) -> dict:
    out = {
        "runs": len(ms),
        "recommendation": {r: sum(1 for m in ms if m["recommendation"] == r) for r in RECS},
        "mcpCallsPerRun": {**stats([m["mcpCalls"] for m in ms]), "distribution": dist([m["mcpCalls"] for m in ms])},
        "mcpCallsByTool": dict(sorted(sum((Counter(m["mcpByTool"]) for m in ms), Counter()).items())),
        "runsWithAtLeastOneMcpCall": sum(1 for m in ms if m["mcpCalls"] > 0),
        "fileToolCallsPerRun": {},
        "permission": {
            "proceedOncePerRun": {**stats([m["permissionProceedOnce"] for m in ms]),
                                  "distribution": dist([m["permissionProceedOnce"] for m in ms])},
            "cancelledTotal": sum(m["permissionCancelled"] for m in ms),
            "noteTexts": dict(Counter(n for m in ms for n in m["permissionNotes"])),
            "decisionsCoveringAnMcpCall": sum(m["permissionDecisionsCoveringMcp"] for m in ms),
            "innerCallsCovered": dict(sorted(Counter(n for m in ms for n in m["permissionCovered"]).items())),
        },
    }
    for t in FILE_TOOLS:
        xs = [m["fileToolCalls"][t] for m in ms]
        out["fileToolCallsPerRun"][t] = {**stats(xs), "distribution": dist(xs)}
    return out


def read_finding(ms: list[dict], autonomy_off: bool) -> dict:
    with_ok = [m["txnRef"] for m in ms if any(r["ok"] for r in m["reads"])]
    all_reads = [r for m in ms for r in m["reads"]]
    outside = [{"txnRef": m["txnRef"], "path": home_rel(r["path"]), "ok": r["ok"]}
               for m in ms for r in m["reads"] if not r["inEvidence"]]
    return {
        "autonomyLevelOffInDroidTs": autonomy_off,
        "recordingsWithSucceededRead": len(with_ok),
        "firstThree": with_ok[:3],
        "readCalls": len(all_reads),
        "readResultsOk": sum(1 for r in all_reads if r["ok"]),
        "readResultsError": sum(1 for r in all_reads if not r["ok"]),
        "permissionNotesNamingRead": sum(1 for m in ms for n in m["permissionNotes"] if "Read" in n),
        "readsInsideAPermittedScript": sum(1 for r in all_reads if r["underPermission"]),
        "readsWithNoPermissionDecision": sum(1 for r in all_reads if not r["underPermission"]),
        "readsWithNoPermissionDecisionOk": sum(1 for r in all_reads if not r["underPermission"] and r["ok"]),
        "recordingsWithOkReadAndNoPermissionDecision": sum(
            1 for m in ms if any(r["ok"] and not r["underPermission"] for r in m["reads"])),
        "readsOutsideEvidenceFolder": {
            "attempted": len(outside),
            "succeeded": sum(1 for o in outside if o["ok"]),
            "recordings": sorted({o["txnRef"] for o in outside}),
            "paths": sorted({o["path"] for o in outside}),
            "succeededPaths": sorted({f'{o["txnRef"]}: {o["path"]}' for o in outside if o["ok"]}),
        },
    }


# ---------------------------------------------------------------------------
# cost
# ---------------------------------------------------------------------------
def cost_block(path: Path) -> dict:
    rows = [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
    u = [r["tokenUsage"] for r in rows]
    return {
        "file": rel(str(path)),
        "tasks": len(rows),
        "txnRefs": [r["txnRef"] for r in rows],
        "inputTokens": stats([x["inputTokens"] for x in u]),
        "outputTokens": stats([x["outputTokens"] for x in u]),
        "cacheTokens": stats([x["cacheCreationTokens"] + x["cacheReadTokens"] for x in u]),
        "durationMs": stats([r["durationMs"] for r in rows]),
    }


# ---------------------------------------------------------------------------
# listTools
# ---------------------------------------------------------------------------
def list_tools() -> dict:
    ids = [s.strip() for s in LIST_TOOLS.read_text().strip().split(",") if s.strip()]
    disabled = sorted(i[: -len(" (disabled)")] for i in ids if i.endswith(" (disabled)"))
    allowed = sorted(i for i in ids if not i.endswith(" (disabled)"))
    return {"file": rel(str(LIST_TOOLS)), "total": len(ids), "allowed": allowed, "disabled": disabled,
            "allowedMcp": [i for i in allowed if i.startswith("elastic___")],
            "allowedNonMcp": [i for i in allowed if not i.startswith("elastic___")]}


# ---------------------------------------------------------------------------
# BENCHMARK: scored against the answer key by this script, never by the agent
# ---------------------------------------------------------------------------
SCORING_RULE = (
    "A hold_and_ask question names the planted person or record when it contains, case-insensitively, at least "
    "one identifier of the row the key plants. location_mismatch decoy (expected clear_after_question): the "
    "driver's name from the key note and the swap log (full name or surname) or the relief unit (\"truck N\" or "
    "\"unit N\"). location_mismatch and capacity_exceeded holds: the unit the card is assigned to (\"truck N\", "
    "\"trucks N and M\", \"unit N\", from card_txns.json) or that unit's fuel card id (trucks.json). Invoice "
    "classes (rate_variance, short_received, duplicate_invoice, vendor_bank_change): the vendor name "
    "(vendors.json), the invoice's PO or any PO in the key note, or the invoice id or any invoice id in the key "
    "note. Rows not in the key are reported unscored. A recording that recommends hold or clear asks no question "
    "and is outside the denominator."
)


def units_named(q: str) -> set[int]:
    found: set[int] = set()
    for m in re.finditer(r"\b(?:trucks?|units?)\s+((?:\d+)(?:\s*(?:,|and|or)\s*\d+)*)", q, re.I):
        found.update(int(n) for n in re.findall(r"\d+", m.group(1)))
    for m in re.finditer(r"\b(?:truck|unit)\s+(\d+)'s\b", q, re.I):
        found.add(int(m.group(1)))
    return found


def swap_log() -> list[dict]:
    rows = []
    for line in (FIX / "evidence/swap_log.txt").read_text().splitlines():
        m = re.match(r"(\d{4}-\d{2}-\d{2})\s+(\w[\w' -]*?),\s+(\w[\w' -]*?)\s+\(drv (\d+)\)\s+(\d+)\s+(\d+)\s", line)
        if m:
            rows.append({"date": m.group(1), "surname": m.group(2), "given": m.group(3),
                         "driverId": int(m.group(4)), "from": int(m.group(5)), "to": int(m.group(6))})
    return rows


def benchmark(ms: list[dict]) -> dict:
    key = {r["txnRef"]: r for r in json.loads((FIX / "answer_key.json").read_text())}
    cards = {r["id"]: r for r in json.loads((FIX / "card_txns.json").read_text())}
    trucks = {r["id"]: r for r in json.loads((FIX / "trucks.json").read_text())}
    invoices = {r["id"]: r for r in json.loads((FIX / "invoices.json").read_text())}
    vendors = {r["id"]: r for r in json.loads((FIX / "vendors.json").read_text())}
    swaps = swap_log()

    scored, unscored, no_question = [], [], []
    for m in ms:
        ref, q = m["txnRef"], m["question"]
        k = key.get(ref)
        if m["recommendation"] != "hold_and_ask" or not q:
            no_question.append({"txnRef": ref, "recommendation": m["recommendation"]})
            continue
        if not k:
            unscored.append({"txnRef": ref, "question": q})
            continue
        code, note, ql = k["code"], k["note"], q.lower()
        idents: dict[str, list[str]] = {}
        matched: list[str] = []
        if code == "location_mismatch" and k["expected"] == "clear_after_question":
            dm = re.search(r"legitimate swap: (.+?) drove relief unit (\d+)", note)
            full, relief = dm.group(1), int(dm.group(2))
            surname = full.split()[-1]
            in_log = any(s["surname"] == surname and s["to"] == relief for s in swaps)
            idents = {"driver": [full, surname], "unit": [f"truck {relief}", f"unit {relief}"]}
            if full.lower() in ql or re.search(rf"\b{re.escape(surname.lower())}\b", ql):
                matched.append("driver")
            if relief in units_named(q):
                matched.append("unit")
            extra = {"swapLogConfirmsDriverAndUnit": in_log}
        elif code in ("location_mismatch", "capacity_exceeded"):
            unit = cards[ref]["truckId"]
            card = trucks[unit]["fuelCardId"]
            idents = {"unit": [f"truck {unit}", f"unit {unit}"], "card": [card]}
            if unit in units_named(q):
                matched.append("unit")
            if card.lower() in ql:
                matched.append("card")
            extra = {}
        else:
            inv = invoices[ref]
            vendor = vendors[inv["vendorId"]]["name"]
            pos = sorted({p for p in [inv.get("poId")] + re.findall(r"PO-\d+", note) if p})
            invs = sorted({ref, *re.findall(r"INV-\d+", note)})
            idents = {"vendor": [vendor], "po": pos, "invoice": invs}
            if vendor.lower() in ql:
                matched.append("vendor")
            if any(p.lower() in ql for p in pos):
                matched.append("po")
            if any(i.lower() in ql for i in invs):
                matched.append("invoice")
            extra = {}
        scored.append({"txnRef": ref, "code": code, "expected": k["expected"], "question": q,
                       "identifiers": idents, "matched": matched, "named": bool(matched), **extra})

    by_class: dict[str, dict] = {}
    for s in scored:
        label = "location_mismatch (decoy)" if s["expected"] == "clear_after_question" else s["code"]
        c = by_class.setdefault(label, {"questions": 0, "named": 0, "misses": []})
        c["questions"] += 1
        c["named"] += int(s["named"])
        if not s["named"]:
            c["misses"].append(s["txnRef"])
    fuel_holds = [s for s in scored if s["code"] in ("location_mismatch", "capacity_exceeded")
                  and s["expected"] != "clear_after_question"]
    decoys = [s for s in scored if s["expected"] == "clear_after_question"]
    named = sum(1 for s in scored if s["named"])
    return {
        "label": "BENCHMARK: scored against seed/fixtures/answer_key.json by bench/carrierbench/droid_table.py, never by the agent",
        "rule": SCORING_RULE,
        "questionsScored": len(scored),
        "named": named,
        "share": round(named / len(scored), 3) if scored else None,
        "byClass": dict(sorted(by_class.items())),
        "misses": [{"txnRef": s["txnRef"], "code": s["code"], "question": s["question"], "identifiers": s["identifiers"]}
                   for s in scored if not s["named"]],
        "stricter": {
            "fuelHoldsNamingTheUnitNumber": sum(1 for s in fuel_holds if "unit" in s["matched"]),
            "fuelHolds": len(fuel_holds),
            "decoysNamingDriverAndUnit": sum(1 for s in decoys if {"driver", "unit"} <= set(s["matched"])),
            "decoys": len(decoys),
        },
        "unscoredNotInKey": unscored,
        "noQuestion": no_question,
        "rows": scored,
    }


# ---------------------------------------------------------------------------
# RESULTS.md section
# ---------------------------------------------------------------------------
def fmt(x) -> str:
    if isinstance(x, float):
        return f"{x:,.1f}".rstrip("0").rstrip(".") if x != int(x) else f"{int(x):,}"
    return f"{x:,}" if isinstance(x, int) else str(x)


def srow(label: str, s: dict) -> str:
    return f"| {label} | {fmt(s['mean'])} | {fmt(s['median'])} | {fmt(s['min'])} | {fmt(s['max'])} |"


def dist_text(d: dict) -> str:
    return ", ".join(f"{k}: {v}" for k, v in d.items())


def render(t: dict) -> str:
    cur, rr, v1 = t["current"], t["rerecordings"]["current"], t["rerecordings"]["v1"]
    rf, lt, b = t["readUnderAutonomyOff"], t["listTools"], t["benchmark"]
    L = [HEADING, "",
         f"Generated by `python3 bench/carrierbench/droid_table.py` from bench/carrierbench/droid_table.json. "
         f"Every number in this section is read from that file. Source: the {cur['runs']} recordings in "
         f"seed/fixtures/investigations/ (the fixtures the worker replays), recorded live on 2026-10-24. "
         f"{rr['runs']} of them are re-recordings whose recordedAt differs from the original kept in _v1/ "
         f"({', '.join(t['rerecordings']['txnRefs'])}); they are reported again on their own below.", "",
         "### Recommendations", "",
         "| Set | Runs | clear | hold | hold_and_ask |", "| --- | --- | --- | --- | --- |"]
    for label, s in (("Current fixtures", cur), ("Re-recordings (current)", rr), ("Originals of those, _v1/", v1)):
        r = s["recommendation"]
        L.append(f"| {label} | {s['runs']} | {r['clear']} | {r['hold']} | {r['hold_and_ask']} |")
    L += ["", "### Tool calls and permission decisions per run (current fixtures)", "",
          "| Per run | Mean | Median | Min | Max |", "| --- | --- | --- | --- | --- |",
          srow("MCP tool calls (elastic___)", cur["mcpCallsPerRun"])]
    for tool in FILE_TOOLS:
        L.append(srow(f"{tool} calls", cur["fileToolCallsPerRun"][tool]))
    L.append(srow("Permission handler: proceed once", cur["permission"]["proceedOncePerRun"]))
    L += ["",
          f"MCP calls per run, distribution (calls: runs): {dist_text(cur['mcpCallsPerRun']['distribution'])}. "
          f"By tool: {dist_text(cur['mcpCallsByTool'])}. Runs with at least one MCP call: "
          f"{cur['runsWithAtLeastOneMcpCall']} of {cur['runs']}.",
          f"Read calls per run, distribution: {dist_text(cur['fileToolCallsPerRun']['Read']['distribution'])}. "
          f"Grep: {dist_text(cur['fileToolCallsPerRun']['Grep']['distribution'])}. "
          f"Glob: {dist_text(cur['fileToolCallsPerRun']['Glob']['distribution'])}.",
          f"Permission handler decisions: {sum(cur['permission']['noteTexts'].values())} in {cur['runs']} runs, "
          f"Cancel {cur['permission']['cancelledTotal']}. Note texts: "
          + "; ".join(f"`{k}` x{v}" for k, v in cur["permission"]["noteTexts"].items())
          + f". The calls inside the scripts those decisions covered: {dist_text(cur['permission']['innerCallsCovered'])}.",
          "", "Re-recordings beside their originals, per-run means:", "",
          "| Set | Runs | MCP calls | Read | Grep | Glob | Permission proceed once | Cancel |",
          "| --- | --- | --- | --- | --- | --- | --- | --- |"]
    for label, s in (("Re-recordings (current)", rr), ("Originals, _v1/", v1)):
        f = s["fileToolCallsPerRun"]
        L.append(f"| {label} | {s['runs']} | {fmt(s['mcpCallsPerRun']['mean'])} | {fmt(f['Read']['mean'])} | "
                 f"{fmt(f['Grep']['mean'])} | {fmt(f['Glob']['mean'])} | "
                 f"{fmt(s['permission']['proceedOncePerRun']['mean'])} | {s['permission']['cancelledTotal']} |")
    L += ["", "### Read under autonomy Off", "",
          f"worker/src/droid.ts sets `autonomyLevel: AutonomyLevel.Off`: {'yes' if rf['autonomyLevelOffInDroidTs'] else 'no'}. "
          f"In {rf['recordingsWithSucceededRead']} of {cur['runs']} recordings a Read tool_call has a matching "
          f"tool_result that is not isError (first three: {', '.join(rf['firstThree'])}). Read calls "
          f"{rf['readCalls']}, results ok {rf['readResultsOk']}, error {rf['readResultsError']}; permission notes "
          f"naming Read: {rf['permissionNotesNamingRead']}. Permission decisions for a `Script` that called an "
          f"MCP tool: {cur['permission']['decisionsCoveringAnMcpCall']} of {sum(cur['permission']['noteTexts'].values())}; "
          f"{rf['readsInsideAPermittedScript']} Read calls sat inside such a script and "
          f"{rf['readsWithNoPermissionDecision']} reached no permission decision at all, of which "
          f"{rf['readsWithNoPermissionDecisionOk']} returned content, in "
          f"{rf['recordingsWithOkReadAndNoPermissionDecision']} recordings. So under autonomy Off, Read runs "
          f"without asking the handler; the handler is consulted for MCP calls only.",
          f"Reads outside seed/fixtures/evidence/: {rf['readsOutsideEvidenceFolder']['attempted']} attempted, "
          f"{rf['readsOutsideEvidenceFolder']['succeeded']} succeeded, in "
          f"{len(rf['readsOutsideEvidenceFolder']['recordings'])} recordings "
          f"({', '.join(rf['readsOutsideEvidenceFolder']['recordings'])}); paths: "
          + ", ".join(f"`{p}`" for p in rf["readsOutsideEvidenceFolder"]["paths"]) + ". Succeeded: "
          + (", ".join(f"`{p}`" for p in rf["readsOutsideEvidenceFolder"]["succeededPaths"]) or "none") + ".",
          "", "### Cost, from the cost logs", "",
          "| Log | Tasks | Measure | Mean | Median | Min | Max |", "| --- | --- | --- | --- | --- | --- | --- |"]
    for name, c in t["cost"].items():
        for label, k in (("input tokens", "inputTokens"), ("output tokens", "outputTokens"),
                         ("cache tokens", "cacheTokens"), ("durationMs", "durationMs")):
            s = c[k]
            L.append(f"| {name} | {c['tasks']} | {label} | {fmt(s['mean'])} | {fmt(s['median'])} | {fmt(s['min'])} | {fmt(s['max'])} |")
    nc = t["rerecordings"]["notInCostLog"]
    L += ["", "Cache tokens are cacheCreationTokens plus cacheReadTokens, never folded into input. "
          + (f"Re-recordings with no cost log line: "
             + "; ".join(f"{x['txnRef']} (finding.tokenUsage input {fmt(x['input'])}, output {fmt(x['output'])}, "
                         f"durationMs {fmt(x['durationMs'])})" for x in nc) + "." if nc else ""),
          "", "### listTools() ids, 2026-10-24", "",
          f"From {lt['file']}: {lt['total']} ids, {len(lt['allowed'])} allowed, {len(lt['disabled'])} disabled.", "",
          f"Allowed, Elastic MCP ({len(lt['allowedMcp'])}): " + ", ".join(f"`{i}`" for i in lt["allowedMcp"]) + ".", "",
          f"Allowed, Droid built-in ({len(lt['allowedNonMcp'])}): " + ", ".join(f"`{i}`" for i in lt["allowedNonMcp"]) + ".", "",
          f"Disabled ({len(lt['disabled'])}): " + ", ".join(f"`{i}`" for i in lt["disabled"]) + ".", "",
          "### BENCHMARK: do the questions name the planted person or record", "",
          f"{b['label']}.", "", f"Rule: {b['rule']}", "",
          f"Named: {b['named']} of {b['questionsScored']} hold_and_ask questions on keyed rows ({b['share']}).", "",
          "| Class | Questions | Named | Misses |", "| --- | --- | --- | --- |"]
    for cls, c in b["byClass"].items():
        L.append(f"| {cls} | {c['questions']} | {c['named']} | {', '.join(c['misses']) or 'none'} |")
    st = b["stricter"]
    L += ["", f"Stricter reading: {st['fuelHoldsNamingTheUnitNumber']} of {st['fuelHolds']} fuel holds name the "
          f"unit number itself (not only its card); {st['decoysNamingDriverAndUnit']} of {st['decoys']} decoys name "
          f"both the driver and the relief unit.", ""]
    if b["misses"]:
        L.append("Misses under the rule:")
        L.append("")
        for m in b["misses"]:
            want = "; ".join(f"{k}: {', '.join(v)}" for k, v in m["identifiers"].items())
            L.append(f"- {m['txnRef']} ({m['code']}), wanted {want}. Asked: \"{m['question']}\"")
        L.append("")
    L.append(f"Unscored, not in the key (rehearsal injections): {', '.join(x['txnRef'] for x in b['unscoredNotInKey']) or 'none'}. "
             f"No question asked: " + (", ".join(f"{x['txnRef']} ({x['recommendation']})" for x in b["noQuestion"]) or "none") + ".")
    return "\n".join(L) + "\n"


def write_results(section: str) -> None:
    text = RESULTS.read_text()
    i = text.find("\n" + HEADING + "\n")
    base = text if i < 0 else text[: i + 1]
    RESULTS.write_text(base.rstrip("\n") + "\n\n" + section)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--no-results", action="store_true", help="write the JSON only, leave docs/RESULTS.md alone")
    args = ap.parse_args()

    current, v1 = load_dir(REC_DIR), load_dir(V1_DIR)
    mcur = [measure(r, x) for r, x in current.items()]
    rer = sorted(r for r in v1 if r in current and current[r].get("recordedAt") != v1[r].get("recordedAt"))
    mrr = [m for m in mcur if m["txnRef"] in rer]
    mv1 = [measure(r, v1[r]) for r in rer]
    autonomy_off = "autonomyLevel: AutonomyLevel.Off" in DROID_TS.read_text()

    cost = {"live record": cost_block(COST_LIVE), "decoy re-record": cost_block(COST_DECOY)}
    logged = set(cost["decoy re-record"]["txnRefs"])
    not_logged = [{"txnRef": m["txnRef"], "input": m["findingTokenUsage"]["input"],
                   "output": m["findingTokenUsage"]["output"], "durationMs": m["findingDurationMs"]}
                  for m in mrr if m["txnRef"] not in logged]

    table = {
        "generatedBy": "bench/carrierbench/droid_table.py",
        "sources": {"recordings": rel(str(REC_DIR)), "originals": rel(str(V1_DIR)),
                    "cost": [rel(str(COST_LIVE)), rel(str(COST_DECOY))], "listTools": rel(str(LIST_TOOLS)),
                    "autonomy": rel(str(DROID_TS))},
        "current": summarise(mcur),
        "rerecordings": {"txnRefs": rer, "current": summarise(mrr), "v1": summarise(mv1),
                         "recordedAt": {r: {"v1": v1[r].get("recordedAt"), "current": current[r].get("recordedAt")} for r in rer},
                         "notInCostLog": not_logged},
        "readUnderAutonomyOff": read_finding(mcur, autonomy_off),
        "cost": cost,
        "listTools": list_tools(),
        "benchmark": benchmark(mcur),
        "perRun": [{k: v for k, v in m.items() if k not in ("reads", "permissionNotes")} for m in mcur],
    }
    OUT_JSON.write_text(json.dumps(table, indent=2) + "\n")
    print(f"wrote {rel(str(OUT_JSON))}: {table['current']['runs']} runs, {len(rer)} re-recordings, "
          f"benchmark {table['benchmark']['named']} of {table['benchmark']['questionsScored']}")
    if not args.no_results:
        write_results(render(table))
        print(f"rewrote the section \"{HEADING[3:]}\" in {rel(str(RESULTS))}")


if __name__ == "__main__":
    main()
