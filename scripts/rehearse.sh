#!/usr/bin/env bash
# Rehearse the judging runbook end to end from demo_up.sh and print the wall time.
# Follows docs/RUNBOOK.md beats through the terminal twin (what the fallback terminal does), no keys.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"
export PATH="$HOME/.local/bin:$PATH"
T0=$(date +%s)
beat() { printf '[%3ss] %s\n' "$(( $(date +%s) - T0 ))" "$*"; }
day() { curl -s -X POST "$STDB_URI/v1/database/$STDB_DB/sql" -d "SELECT day FROM business_day" | python3 -c 'import sys,json; print(json.load(sys.stdin)[0]["rows"][0][0])'; }
# Print the first N lines of captured text. sed reads all of its input, so the producer never gets SIGPIPE
# (piping a producer into head under pipefail killed a run once; nothing in this script does that now).
first() { local n="$1"; shift; printf '%s\n' "$*" | sed -n "1,${n}p"; }
cli() { local out; out=$(agent/.venv/bin/python -m agent.cli "$1"); first "${2:-3}" "$out"; }
export STDB_URI=http://127.0.0.1:3100 STDB_DB=dispatch-ledger

beat "boot: scripts/demo_up.sh --no-web"; scripts/demo_up.sh --no-web > logs/rehearse_demo_up.log 2>&1
set -a; . ./.env; set +a
beat "clock status"; scripts/clock.sh status
beat "run the month at 0.5 s tick, stop on day 41"; scripts/clock.sh tick 500000 >/dev/null; scripts/clock.sh run >/dev/null
while [ "$(day)" -lt 41 ]; do sleep 0.2; done; scripts/clock.sh pause >/dev/null; beat "paused on day $(day)"
for i in $(seq 1 30); do open=$(curl -s -X POST "$STDB_URI/v1/database/$STDB_DB/sql" -d "SELECT status FROM agent_task WHERE status = 'open'" | python3 -c 'import sys,json; print(len(json.load(sys.stdin)[0]["rows"]))'); [ "$open" = "0" ] && break; sleep 0.5; done
beat "moment one: what needs me"; out=$(agent/.venv/bin/python -m agent.cli "what needs me"); first 3 "$out"
beat "why 2231"; out=$(agent/.venv/bin/python -m agent.cli "why 2231"); first 4 "$out"
beat "answer 2231"; out=$(agent/.venv/bin/python -m agent.cli "answer 2231 Yes. Ortiz drove unit 22 that week while unit 17 was in the shop, per the swap log."); first 1 "$out"
for i in $(seq 1 30); do RID=$(curl -s -X POST "$STDB_URI/v1/database/$STDB_DB/sql" -d "SELECT id FROM rule WHERE status = 'candidate'" | python3 -c 'import sys,json; r=json.load(sys.stdin)[0]["rows"]; print(r[0][0] if r else "")'); [ -n "$RID" ] && break; sleep 0.5; done
beat "approve rule $RID"; out=$(agent/.venv/bin/python -m agent.cli "approve rule $RID"); first 1 "$out"
beat "hold 2231 now: $(curl -s -X POST "$STDB_URI/v1/database/$STDB_DB/sql" -d "SELECT status FROM hold WHERE txn_ref = '2231'" | python3 -c 'import sys,json; print(json.load(sys.stdin)[0]["rows"][0][0])')"
beat "segregation of duties: as_agent approve INV-1077 (not yet received on day 41; expect refusal by role)"; scripts/as_agent.sh approve INV-1077 2>&1 | sed -n 1p; true
beat "run to day 44 for moment two"; scripts/clock.sh run >/dev/null; while [ "$(day)" -lt 44 ]; do sleep 0.2; done; scripts/clock.sh pause >/dev/null; beat "paused on day $(day)"
for i in $(seq 1 30); do st=$(curl -s -X POST "$STDB_URI/v1/database/$STDB_DB/sql" -d "SELECT status FROM agent_task WHERE txn_ref = 'INV-1077'" | python3 -c 'import sys,json; r=json.load(sys.stdin)[0]["rows"]; print(r[0][0] if r else "")'); [ "$st" = "investigated" ] && break; sleep 0.5; done
beat "moment two: approve INV-1077 without a note"; out=$(agent/.venv/bin/python -m agent.cli "approve INV-1077"); first 1 "$out"
beat "approve INV-1077 with a call-back note"; out=$(agent/.venv/bin/python -m agent.cli "approve INV-1077 Called Gulf Coast Diesel on the number on file; new account confirmed by M. Reyes."); first 1 "$out"
beat "judge scenarios (truck 29, day 44)"
out=$(python3 scripts/inject.py --truck 29 --gallons 80 --lat 29.42419 --lon -98.49379 --time 18:00 --id 770001); printf '%s\n' "$out" | tail -1
out=$(python3 scripts/inject.py --truck 29 --gallons 70 --station "Pilot 1126, Luling TX" --time 18:00 --id 770002); printf '%s\n' "$out" | tail -2 | sed -n '1p'
out=$(python3 scripts/inject.py --truck 29 --gallons 400 --lat 29.42419 --lon -98.49379 --time 18:00 --id 770003); printf '%s\n' "$out" | tail -2 | sed -n '1p'
beat "facts table: open docs/FACTS.md (not regenerated at the table)"; sed -n '12,13p' docs/FACTS.md
beat "done"
