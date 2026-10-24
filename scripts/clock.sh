#!/usr/bin/env bash
# Control the simulated clock from the demo laptop. Uses the controller token (never shipped to a browser).
# Usage: scripts/clock.sh run | pause | step | tick <micros> | reset | status
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
set -a; . "$ROOT/.env"; set +a
B="$STDB_URI/v1/database/$STDB_DB"
call() { # reducer token body
  code=$(curl -s -o /tmp/clock_out -w "%{http_code}" -X POST "$B/call/$1" -H "Authorization: Bearer $2" -H "Content-Type: application/json" -d "$3")
  if [ "$code" != "200" ]; then echo "refused ($code): $(cat /tmp/clock_out)"; exit 1; fi
}
case "${1:-status}" in
  run)    call set_clock "$STDB_CONTROLLER_TOKEN" '[false]'; echo "clock running" ;;
  pause)  call set_clock "$STDB_CONTROLLER_TOKEN" '[true]';  echo "clock paused" ;;
  step)   call step_day  "$STDB_CONTROLLER_TOKEN" '[]';      echo "advanced one day" ;;
  tick)   call set_tick_micros "$STDB_CONTROLLER_TOKEN" "[${2:?micros}]"; echo "tick set to $2 us" ;;
  reset)  call reset_sim "$STDB_SEED_TOKEN" '[]'; echo "operational state cleared, day 0, paused" ;;
  status) curl -s -X POST "$B/sql" -d "SELECT * FROM business_day" | python3 -c 'import sys,json; r=json.load(sys.stdin)[0]; print(dict(zip([e["name"]["some"] for e in r["schema"]["elements"]], r["rows"][0])))' ;;
  *) echo "usage: $0 run|pause|step|tick <micros>|reset|status"; exit 2 ;;
esac
