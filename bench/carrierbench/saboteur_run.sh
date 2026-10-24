#!/usr/bin/env bash
# Runs the saboteur test through the module's vitest harness and writes the observed rows to saboteur.json.
# The test attaches its observations to task.meta (it may not import node:fs: the module tsconfig has no node
# types and `spacetime publish` typechecks spacetimedb/src); vitest's JSON reporter carries that meta out.
# Usage: bash bench/carrierbench/saboteur_run.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/bench/carrierbench/saboteur.json"
RAW="$(mktemp)"
trap 'rm -f "$RAW"' EXIT
( cd "$ROOT/spacetimedb" && npx vitest run src/saboteur.test.ts --reporter=default --reporter=json --outputFile.json="$RAW" ) || { echo "saboteur_run: vitest failed"; exit 1; }
python3 - "$RAW" "$OUT" <<'PY'
import json, sys
raw = json.load(open(sys.argv[1]))
assert raw["numFailedTests"] == 0 and raw["numPassedTests"] >= 1, raw.get("numFailedTests")
meta = None
for f in raw["testResults"]:
    for a in f["assertionResults"]:
        if a.get("meta", {}).get("saboteur"):
            meta = a["meta"]["saboteur"]
            meta["testStatus"] = a["status"]
            meta["testName"] = a["fullName"]
assert meta is not None, "no task.meta.saboteur in the JSON report"
open(sys.argv[2], "w").write(json.dumps(meta, indent=2) + "\n")
print("wrote", sys.argv[2])
PY
