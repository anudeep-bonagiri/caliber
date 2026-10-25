#!/usr/bin/env python3
"""Score the baseline (Task 22, step 5): precision and recall per code and overall for three systems.

  Caliber     the kernel plus Droid, read from docs/FACTS.json (the measured 92-day run), never recomputed here
  Sonnet      bench/outputs/sonnet/<id>.json
  asi1-mini   bench/outputs/asi1/<id>.json

Positives are the 58 answer-key rows: 52 planted exceptions and 6 decoys. A decoy is a legitimate swap that the
records cannot distinguish from card misuse, so "hold" is the correct decision on it for every system: the kernel
held and asked (then cleared through an approved rule); a model that says hold on a decoy is counted correct, a
model that says clear on a decoy is counted exactly as it scores (a miss). The footnote in BASELINE.md says so.

Two readings are reported. Code-exact (the headline, same definition as docs/FACTS.json): a hold counts for a
code only when the model named that code. Detection: a hold counts whatever code was given. A row with no
parseable answer counts as not held.

Run: agent/.venv/bin/python bench/score.py
"""
from __future__ import annotations

import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from common import BENCH, CODES, ROOT, load_fixtures, write_json
from baseline import parse_decision

FACTS = ROOT / "docs" / "FACTS.json"
MODELS = {"sonnet": "Claude Sonnet", "asi1": "asi1-mini"}


def ratio(n: int, d: int):
    return round(n / d, 4) if d else None


def load_outputs(model: str) -> dict[str, dict]:
    out = {}
    for p in (BENCH / "outputs" / model).glob("*.json"):
        if p.name.startswith("_"):
            continue
        rec = json.loads(p.read_text())
        out[rec["id"]] = rec
    return out


def score_model(model: str, sample_ids: list[str], positives: dict[str, str]) -> dict:
    recs = load_outputs(model)
    meta_path = BENCH / "outputs" / model / "_meta.json"
    meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
    answered: dict[str, dict] = {}
    status = Counter()
    for ref in sample_ids:
        r = recs.get(ref)
        if r is None:
            status["missing"] += 1
            continue
        # Re-read the decision from the saved raw text with the one shared parse rule, so a parser fix applies
        # to every saved reply without re-running a model. The raw response on disk is never changed.
        parsed = parse_decision(r["text"]) if r.get("text") else None
        if r.get("status") in ("refusal", "error") and not parsed:
            status[r["status"]] += 1
        else:
            status["ok" if parsed else "unparsed"] += 1
        if parsed:
            answered[ref] = parsed
    holds = {ref: p["code"] for ref, p in answered.items() if p["decision"] == "hold"}
    pos = {ref: c for ref, c in positives.items() if ref in set(sample_ids)}

    by_code = []
    tp_exact_total = 0
    for code in CODES:
        planted = {r for r, c in pos.items() if c == code}
        raised = {r for r, c in holds.items() if c == code}
        tp = planted & raised
        fp = raised - planted
        by_code.append({
            "code": code, "planted": len(planted), "raised": len(raised), "truePositives": len(tp), "falsePositives": len(fp),
            "heldAnyCode": len(planted & set(holds)), "missed": sorted(planted - set(holds)),
            "wrongCode": sorted((planted & set(holds)) - raised),
            "precision": ratio(len(tp), len(raised)), "recall": ratio(len(tp), len(planted)),
            "detectionRecall": ratio(len(planted & set(holds)), len(planted)),
        })
        tp_exact_total += len(tp)
    det_tp = len(set(holds) & set(pos))
    det_fp = len(set(holds) - set(pos))
    decoys = [r for r in sample_ids if r in pos and r in DECOYS]
    tokens = {"input": 0, "output": 0}
    cost = 0.0
    for ref in sample_ids:
        r = recs.get(ref)
        if not r:
            continue
        u = r.get("usage") or {}
        tokens["input"] += int(u.get("input_tokens", u.get("prompt_tokens", 0)) or 0)
        tokens["output"] += int(u.get("output_tokens", u.get("completion_tokens", 0)) or 0)
        cost += float(r.get("costUsd", 0) or 0)
    model_ids = sorted({r.get("model") for ref, r in recs.items() if ref in set(sample_ids) and r.get("model")})
    return {
        "label": MODELS[model], "modelIds": model_ids, "meta": {k: v for k, v in meta.items() if k not in ("probe",)},
        "rowsInSample": len(sample_ids), "rowsAnswered": len(answered), "rowStatus": dict(status),
        # partial means the run did not reach every sampled row (stopped for cost, quota or a crash); a reply
        # that came back but could not be parsed is a model failure and is reported as one, not as a partial run
        "partial": status["missing"] > 0 or bool(meta.get("stoppedForCost")),
        "holds": len(holds), "holdsWithUnspecifiedCode": sum(1 for c in holds.values() if c == "unspecified"),
        "codeExact": {"truePositives": tp_exact_total, "falsePositives": len(holds) - tp_exact_total,
                      "precision": ratio(tp_exact_total, len(holds)), "recall": ratio(tp_exact_total, len(pos))},
        "detection": {"truePositives": det_tp, "falsePositives": det_fp, "falseNegatives": len(pos) - det_tp,
                      "precision": ratio(det_tp, len(holds)), "recall": ratio(det_tp, len(pos))},
        "decoys": {"inSample": len(decoys), "held": sum(1 for r in decoys if r in holds),
                   "cleared": sum(1 for r in decoys if r in answered and r not in holds)},
        "falsePositiveRows": sorted(set(holds) - set(pos)),
        "byCode": by_code, "tokens": tokens, "costUsd": round(cost, 4),
    }


def caliber_from_facts() -> dict:
    f = json.loads(FACTS.read_text())
    by_code = []
    for b in f["byCode"]:
        by_code.append({"code": b["code"], "planted": b["planted"], "raised": b["raised"], "truePositives": b["truePositives"],
                        "falsePositives": b["falsePositives"], "precision": b["precision"], "recall": b["recall"],
                        "heldAnyCode": b["truePositives"], "detectionRecall": b["recall"], "missed": b["missed"], "wrongCode": []})
    return {
        "label": "Caliber (kernel + Droid)", "source": "docs/FACTS.json", "factsAsOf": f["asOf"],
        "rowsEvaluated": f["transactionsMatched"], "partial": not f.get("complete", False),
        "codeExact": dict(f["overall"]), "detection": dict(f["overall"]),
        "decoys": {"inSample": f["decoys"], "held": f["decoys"], "clearedAfterOneAnswer": f["decoysClearedWithOneAnswer"]},
        "byCode": by_code,
    }


def failure_sentence(name: str, m: dict) -> str:
    missed = [(b["code"], len(b["missed"]), b["planted"]) for b in m["byCode"] if b["missed"]]
    wrong = [(b["code"], len(b["wrongCode"])) for b in m["byCode"] if b["wrongCode"]]
    fps = Counter()
    recs = None
    parts = []
    if missed:
        parts.append("missed " + ", ".join(f"{n} of {p} {c}" for c, n, p in missed))
    if wrong:
        parts.append("held with the wrong code " + ", ".join(f"{n} {c}" for c, n in wrong))
    fp_by_code = Counter(b["code"] for b in m["byCode"] for _ in range(b["falsePositives"]))
    det_fp = m["detection"]["falsePositives"]
    if det_fp:
        detail = ", ".join(f"{n} as {c}" for c, n in fp_by_code.most_common()) if fp_by_code else ""
        parts.append(f"held {det_fp} clean rows" + (f" (holds by code that did not match a planted row: {detail})" if detail else ""))
    if m["decoys"]["cleared"]:
        parts.append(f"cleared {m['decoys']['cleared']} of {m['decoys']['inSample']} decoys that the records cannot clear")
    unanswered = m["rowsInSample"] - m["rowsAnswered"]
    if unanswered:
        st = m["rowStatus"]
        detail = ", ".join(f"{v} {k}" for k, v in sorted(st.items()) if k != "ok")
        parts.append(f"{unanswered} {'row' if unanswered == 1 else 'rows'} had no parseable answer ({detail}), counted as not held")
    if not parts:
        return f"{name} failed on nothing in this sample."
    return f"{name} " + "; ".join(parts) + "."


def fmt(x) -> str:
    return "n/a" if x is None else f"{x:.2f}" if isinstance(x, float) else str(x)


DECOYS: set[str] = set()


def main() -> int:
    global DECOYS
    fx = load_fixtures()
    key = fx["answer_key"]
    positives = {k["txnRef"]: k["code"] for k in key}
    DECOYS = {k["txnRef"] for k in key if k["expected"] == "clear_after_question"}
    sample = json.loads((BENCH / "sample.json").read_text())
    sample_ids = [r["id"] for r in sample["rows"]]

    systems = {"caliber": caliber_from_facts(), "sonnet": score_model("sonnet", sample_ids, positives),
               "asi1": score_model("asi1", sample_ids, positives)}
    for k in ("sonnet", "asi1"):
        systems[k]["failureSentence"] = failure_sentence(systems[k]["label"], systems[k])

    # The table: one row per code plus overall, precision and recall per system (code-exact).
    table = []
    for i, code in enumerate(CODES):
        row = {"code": code, "planted": systems["caliber"]["byCode"][i]["planted"]}
        for k, s in systems.items():
            b = s["byCode"][i]
            row[k] = {"precision": b["precision"], "recall": b["recall"], "raised": b["raised"], "truePositives": b["truePositives"], "falsePositives": b["falsePositives"]}
        table.append(row)
    overall = {"code": "overall", "planted": sum(systems["caliber"]["byCode"][i]["planted"] for i in range(len(CODES)))}
    for k, s in systems.items():
        overall[k] = {"precision": s["codeExact"]["precision"], "recall": s["codeExact"]["recall"],
                      "truePositives": s["codeExact"]["truePositives"], "falsePositives": s["codeExact"]["falsePositives"]}
    table.append(overall)

    # Where a model ties or beats the kernel on a code: said plainly, whatever it is.
    ties_or_wins = []
    for row in table:
        for k in ("sonnet", "asi1"):
            cp, cr = row["caliber"]["precision"], row["caliber"]["recall"]
            mp, mr = row[k]["precision"], row[k]["recall"]
            if mp is not None and mr is not None and cp is not None and cr is not None and mp >= cp and mr >= cr:
                ties_or_wins.append({"code": row["code"], "model": systems[k]["label"], "tie": (mp == cp and mr == cr)})

    partial = {k: systems[k]["partial"] for k in systems}
    sonnet_meta = systems["sonnet"]["meta"]
    asi_meta = systems["asi1"]["meta"]
    generated = datetime.now(timezone.utc).isoformat(timespec="seconds")
    result = {
        "generatedAt": generated,
        "sample": {"seed": sample["seed"], **sample["counts"], "excludedLimitHolds": sample["excludedLimitHolds"]},
        "prompt": "bench/prompts/hold_or_clear.txt",
        "systems": systems, "table": table, "tiesOrWins": ties_or_wins, "partial": partial,
        "cost": {"sonnetUsd": systems["sonnet"]["costUsd"], "sonnetTokens": systems["sonnet"]["tokens"],
                 "sonnetRates": sonnet_meta.get("rates"), "sonnetRatesSource": sonnet_meta.get("ratesSource"),
                 "costCapUsd": sonnet_meta.get("costCapUsd"), "sonnetStoppedForCost": sonnet_meta.get("stoppedForCost"),
                 "asi1Requests": asi_meta.get("requestsToday"), "asi1Quota": asi_meta.get("quota"), "asi1Tokens": systems["asi1"]["tokens"]},
        "rerun": "agent/.venv/bin/python bench/sample.py && agent/.venv/bin/python bench/inputs.py && "
                 "agent/.venv/bin/python bench/baseline.py --model sonnet && agent/.venv/bin/python bench/baseline.py --model asi1 && "
                 "agent/.venv/bin/python bench/score.py",
        "footnotes": [
            "Positives are the 58 answer-key rows: 52 planted exceptions and 6 decoys. A decoy is a legitimate unit swap that the records on file cannot distinguish from card misuse, so hold is the correct decision for every system: the kernel held and asked, then cleared through an approved rule after one controller answer; a model that says hold on a decoy is counted correct; a model that says clear on a decoy is counted exactly as it scores, a miss.",
            "Code-exact scoring (the table): a hold counts for a code only when the system named that code; a hold with a wrong or missing code is a false positive for the code it named and a miss for the planted code. This is the definition docs/FACTS.json uses for the kernel.",
            "Caliber's figures are the measured 92-day run over all 7,944 transactions (docs/FACTS.json); the models saw a 558-row sample holding every planted row and decoy plus 500 clean rows, so recall is directly comparable and the kernel's precision was tested on about fourteen times as many clean rows.",
            "Synthetic data from the same generator as the clean rows (seed/generate.py, seed 42); every system was given identical inputs; no fine-tuning, no examples, one prompt, one attempt per row. The result measures whether each system finds what we planted, not how it behaves on a real carrier's statements.",
            "Claude Sonnet: no temperature was sent because Claude Sonnet 5.5 returns 400 for a non-default temperature; thinking and effort were left at the API defaults. asi1-mini: temperature 0.",
            "Parsing: the first complete JSON object in a reply is the decision, for both models; a reply with no complete object counts as not held. Raw replies are on disk unchanged under bench/outputs.",
        ],
    }
    write_json(BENCH / "BASELINE.json", result)

    # BASELINE.md
    def pr(row, k):
        return f"{fmt(row[k]['precision'])} / {fmt(row[k]['recall'])}"
    md = ["# Model-only baseline", "",
          f"Generated {generated} by bench/score.py from one committed run. Prompts under bench/prompts, raw responses under bench/outputs. Nothing in this file is typed by hand.", "",
          "Three systems were given the same rows and the same records: Caliber (the kernel plus Droid, the measured run in docs/FACTS.json), Claude Sonnet alone and asi1-mini alone, each asked hold or clear with a one-line reason and the code.", "",
          "| Code | Planted | Caliber P / R | Claude Sonnet P / R | asi1-mini P / R |", "| --- | --- | --- | --- | --- |"]
    for row in table:
        md.append(f"| {row['code']} | {row['planted']} | {pr(row, 'caliber')} | {pr(row, 'sonnet')} | {pr(row, 'asi1')} |")
    md += ["", "P is precision, R is recall, code-exact. The overall row counts a hold as correct only when the code matches.", ""]
    md += ["| System | Model id | Rows answered | Holds | Detection P / R (any code) | Decoys held | False holds |", "| --- | --- | --- | --- | --- | --- | --- |"]
    c = systems["caliber"]
    md.append(f"| {c['label']} | kernel.ts, no model decides | {c['rowsEvaluated']} of {c['rowsEvaluated']} | {sum(b['raised'] for b in c['byCode'])} | {fmt(c['detection']['precision'])} / {fmt(c['detection']['recall'])} | {c['decoys']['held']} of {c['decoys']['inSample']} | {c['detection']['falsePositives']} |")
    for k in ("sonnet", "asi1"):
        s = systems[k]
        md.append(f"| {s['label']} | {', '.join(s['modelIds']) or 'none'} | {s['rowsAnswered']} of {s['rowsInSample']} | {s['holds']} | {fmt(s['detection']['precision'])} / {fmt(s['detection']['recall'])} | {s['decoys']['held']} of {s['decoys']['inSample']} | {s['detection']['falsePositives']} |")
    md += ["", "## Where each model failed", ""]
    for k in ("sonnet", "asi1"):
        md.append(f"- {systems[k]['failureSentence']}")
    md += ["", "## Ties or wins against the kernel", ""]
    if ties_or_wins:
        for t in ties_or_wins:
            md.append(f"- {t['model']} {'tied' if t['tie'] else 'beat'} the kernel on {t['code']}.")
    else:
        md.append("- None. The kernel's precision and recall were at or above both models on every code.")
    md += ["", "## Run facts", "",
           f"- Sample: seed {sample['seed']}; {sample['counts']['planted']} planted, {sample['counts']['decoys']} decoys, {sample['counts']['cleanTotal']} clean rows ({sample['counts']['clean']}); every clean invoice was included because only {sample['counts']['cleanAvailable']['invoice']} exist; the 6 auto-pay limit holds (a policy hold, not an exception) were left out.",
           f"- Claude Sonnet: requested claude-sonnet-5-5, used {', '.join(systems['sonnet']['modelIds']) or 'none'}; {systems['sonnet']['rowsAnswered']} of {systems['sonnet']['rowsInSample']} rows answered; {systems['sonnet']['tokens']['input']:,} input and {systems['sonnet']['tokens']['output']:,} output tokens (output includes thinking); cost ${systems['sonnet']['costUsd']:.2f} at list rates ${(sonnet_meta.get('rates') or {}).get('input')} per million input and ${(sonnet_meta.get('rates') or {}).get('output')} per million output ({sonnet_meta.get('ratesSource')}); cap ${sonnet_meta.get('costCapUsd')}, stopped for cost: {sonnet_meta.get('stoppedForCost')}. {'PARTIAL: the table covers the rows answered.' if systems['sonnet']['partial'] else 'Complete.'}",
           f"- asi1-mini: {systems['asi1']['rowsAnswered']} of {systems['asi1']['rowsInSample']} rows answered; {asi_meta.get('requestsToday')} requests against the free-plan quota of {(asi_meta.get('quota') or {}).get('per15min')} per 15 minutes and {(asi_meta.get('quota') or {}).get('perDay')} per day, paced one request every {(asi_meta.get('quota') or {}).get('paceSeconds')} s; {systems['asi1']['tokens']['input']:,} prompt and {systems['asi1']['tokens']['output']:,} completion tokens. {'PARTIAL: the table covers the rows answered.' if systems['asi1']['partial'] else 'Complete.'}",
           f"- Caliber: docs/FACTS.json as of {c['factsAsOf']}, {c['rowsEvaluated']} transactions over 92 days.",
           f"- Rerun: `{result['rerun']}`", "", "## Footnotes", ""]
    for i, fn in enumerate(result["footnotes"], 1):
        md.append(f"{i}. {fn}")
    (BENCH / "BASELINE.md").write_text("\n".join(md) + "\n")
    print("\n".join(md))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
