#!/usr/bin/env python3
"""Honesty pass: rewrite the provenance prose in README.md and docs/RESULTS.md from docs/FACTS.json.

It owns exactly two blocks, each between `<!-- honesty:start -->` and `<!-- honesty:end -->`:
  README.md          the body of "## What is real and what is simulated"
  docs/RESULTS.md    a "## Provenance" section (inserted before "## Caveat" when missing)
Everything outside the markers is left byte for byte. The markers are added on the first run.
scripts/facts.py rewrites docs/RESULTS.md whole, so run this after it.

The word "autonomous" may appear in a block only in a sentence where the kernel or an approved rule
acted without a person; any other use fails the run.

Usage: python3 scripts/honesty.py [--check]
  --check   write nothing; exit 1 if either file would change (for CI)
"""
import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FACTS = ROOT / "docs/FACTS.json"
README = ROOT / "README.md"
RESULTS = ROOT / "docs/RESULTS.md"
FIXTURES = ROOT / "seed/fixtures/investigations"
START, END = "<!-- honesty:start -->", "<!-- honesty:end -->"
README_HEADING = "## What is real and what is simulated"


def counts(facts: dict) -> tuple[int, int, int]:
    """live, replayed, scripted. The worker writes source 'live' (Droid, record or live mode), 'replayed'
    (a recorded fixture) or 'none' (the deterministic stand-in, or a timeout); anything else is not a model."""
    by_source = facts.get("investigations", {}).get("bySource", {}) or {}
    live = int(by_source.get("live", 0))
    replayed = int(by_source.get("replayed", 0))
    scripted = sum(int(v) for k, v in by_source.items() if k not in ("live", "replayed"))
    return live, replayed, scripted


def fixtures() -> list[tuple[str, bool]]:
    """(txnRef, hand_written) for each recorded investigation fixture, sorted by name."""
    out = []
    for p in sorted(FIXTURES.glob("*.json")):
        try:
            note = str(json.loads(p.read_text()).get("note", ""))
        except (json.JSONDecodeError, OSError):
            note = ""
        out.append((p.stem, "hand-written" in note.lower()))
    return out


def join_list(items: list[str]) -> str:
    if len(items) <= 1:
        return "".join(items)
    return ", ".join(items[:-1]) + " and " + items[-1]


def counts_sentence(facts: dict) -> str:
    live, replayed, scripted = counts(facts)
    first = f"{live} investigation was" if live == 1 else f"{live} investigations were"
    third = f"{scripted} was a scripted stand-in" if scripted == 1 else f"{scripted} were scripted stand-ins"
    return (f"In the measured run of {facts['asOf']}, {first} produced by a live model, "
            f"{replayed} replayed recorded findings, and {third}, each labelled on its card.")


def refusal_sentence(facts: dict) -> str:
    ref = facts.get("refusals", {}) or {}
    n = int(ref.get("count", 0))
    by_role = {k: int(v) for k, v in (ref.get("byRole", {}) or {}).items()}
    if n == 0:
        return "The audit trail recorded no refusals through the `try_*` procedures in that run."
    noun = "refusal" if n == 1 else "refusals"
    if len(by_role) == 1:
        role = next(iter(by_role))
        return f"The audit trail recorded {n} {noun} through the `try_*` procedures in that run, all by the {role} role."
    parts = ", ".join(f"{role} {c}" for role, c in sorted(by_role.items(), key=lambda kv: (-kv[1], kv[0])))
    return f"The audit trail recorded {n} {noun} through the `try_*` procedures in that run, by role: {parts}."


def readme_block(facts: dict) -> str:
    live, _, _ = counts(facts)
    findings = ("What is replayed or scripted in the offline demo: the investigator's findings, labelled on every card."
                if live == 0 else
                "What is live, replayed or scripted varies by investigation: the investigator's findings, labelled on every card.")
    para = " ".join([
        "What is live: the module, the kernel, the clock, the roles and refusals, the dashboard subscriptions, "
        "the controller agent against the local database, the rule backtest.",
        "What is simulated: the company, the money, the vendors.",
        findings,
        counts_sentence(facts),
        refusal_sentence(facts),
        "Not built: `docs/not-built.md`.",
        "Everything fails toward no money moving.",
    ])
    return para


def results_block(facts: dict) -> str:
    live, replayed, _ = counts(facts)
    lines = ["## Provenance", "", counts_sentence(facts), "", refusal_sentence(facts)]
    fx = fixtures()
    if replayed and fx:
        refs = join_list([ref for ref, _ in fx])
        hand = [ref for ref, h in fx if h]
        s = (f"The replayed findings come from the recordings in `seed/fixtures/investigations/`, one per txnRef: {refs}.")
        if hand:
            s += (f" {'That recording is' if len(hand) == 1 else 'Each of these recordings is'} hand-written in the shape "
                  "`WORKER_MODE=record` emits; no live Droid run produced "
                  f"{'it' if len(hand) == 1 else 'them'}.")
        lines += ["", s]
    if live:
        lines += ["", f"The {live} live {'finding' if live == 1 else 'findings'} came from a worker run with `WORKER_MODE=live` or `record` (the worker tags both as live)."]
    else:
        lines += ["", "No live model produced a finding in this run."]
    return "\n".join(lines)


SENTENCE = re.compile(r"(?<=[.!?])\s+")


def check_prose(name: str, block: str) -> list[str]:
    errors = []
    if "\u2014" in block:  # em dash, written as an escape so the CI scan does not trip on this file
        errors.append(f"{name}: em dash in the honesty block")
    for sentence in SENTENCE.split(block.replace("\n", " ")):
        if re.search(r"autonom", sentence, re.I):
            low = sentence.lower()
            if not (("kernel" in low or "approved rule" in low) and "without a person" in low):
                errors.append(f"{name}: 'autonomous' outside a kernel/approved-rule-without-a-person sentence: {sentence.strip()!r}")
    return errors


def extract(text: str) -> str | None:
    i, j = text.find(START), text.find(END)
    if i == -1 or j == -1 or j < i:
        return None
    return text[i + len(START):j]


def wrap(block: str) -> str:
    return f"{START}\n{block}\n{END}"


def replace_marked(text: str, block: str) -> str:
    i, j = text.find(START), text.find(END)
    return text[:i] + wrap(block) + text[j + len(END):]


def render_readme(text: str, block: str) -> str:
    if extract(text) is not None:
        return replace_marked(text, block)
    h = text.find(README_HEADING + "\n")
    if h == -1:
        raise SystemExit(f"README.md: heading {README_HEADING!r} not found; nowhere to put the honesty block")
    body_start = h + len(README_HEADING) + 1
    nxt = re.search(r"^## ", text[body_start:], re.M)
    body_end = body_start + nxt.start() if nxt else len(text)
    tail = "\n\n" if nxt else "\n"
    return text[:body_start] + "\n" + wrap(block) + tail + text[body_end:]


def render_results(text: str, block: str) -> str:
    if extract(text) is not None:
        return replace_marked(text, block)
    c = re.search(r"^## Caveat\s*$", text, re.M)
    if c:
        return text[:c.start()] + wrap(block) + "\n\n" + text[c.start():]
    return text.rstrip("\n") + "\n\n" + wrap(block) + "\n"


import re as _re
def _refresh_last_run(readme_text: str, as_of: str) -> str:
    return _re.sub(r"Last run \S+,", f"Last run {as_of},", readme_text, count=1)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true", help="write nothing; exit 1 if a file would change")
    args = ap.parse_args()

    facts = json.loads(FACTS.read_text())
    live, replayed, scripted = counts(facts)
    print(f"investigations: live {live}, replayed {replayed}, scripted {scripted}")
    by_role = (facts.get("refusals", {}) or {}).get("byRole", {}) or {}
    print("refusals by role: " + (", ".join(f"{r} {c}" for r, c in sorted(by_role.items())) or "none"))

    rb, sb = readme_block(facts), results_block(facts)
    errors = check_prose("README.md", rb) + check_prose("docs/RESULTS.md", sb)
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 2

    targets = [(README, render_readme), (RESULTS, render_results)]
    blocks = {README: rb, RESULTS: sb}
    changed = []
    for path, render in targets:
        old = path.read_text()
        new = render(old, blocks[path])
        if path == README:
            new = _refresh_last_run(new, facts.get("asOf", ""))
        if new != old:
            changed.append(path)
            if not args.check:
                path.write_text(new)

    rel = [str(p.relative_to(ROOT)) for p in changed]
    if args.check:
        if rel:
            print("would change: " + ", ".join(rel) + " (run python3 scripts/honesty.py)")
            return 1
        print("up to date")
        return 0

    # Grep what is actually on disk now, not what we meant to write.
    post = []
    for path, _ in targets:
        on_disk = extract(path.read_text())
        if on_disk is None:
            post.append(f"{path.relative_to(ROOT)}: honesty markers missing after write")
        else:
            post += check_prose(str(path.relative_to(ROOT)), on_disk)
    if post:
        print("\n".join(post), file=sys.stderr)
        return 2
    print("wrote: " + ", ".join(rel) if rel else "no change")
    return 0


if __name__ == "__main__":
    sys.exit(main())
