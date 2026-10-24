#!/usr/bin/env bash
# One command from fresh fixtures to a facts table:
#   republish with empty data, mint identities, load fixtures, start the worker in replay mode,
#   advance all 92 days, run the scripted controller pass, recompute docs/FACTS.json.
# Usage: scripts/full_run.sh [--keep-worker]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export PATH="$HOME/.local/bin:$PATH"
export FACTORY_API_KEY="" ANTHROPIC_API_KEY="" ELASTIC_API_KEY="" ASI_ONE_API_KEY=""
export WORKER_MODE=replay
mkdir -p logs
T0=$(date +%s)
step() { printf '\n==> %s (%ss)\n' "$*" "$(( $(date +%s) - T0 ))"; }

curl -sf http://127.0.0.1:3100/v1/ping >/dev/null || { echo "local SpacetimeDB is not running on 3100; run scripts/demo_up.sh first"; exit 1; }

step "publish with empty data"
( cd spacetimedb && spacetime publish dispatch-ledger --module-path . --server local3100 --delete-data=always --yes 2>&1 | tail -1 )
step "identities"
python3 scripts/mint_identities.py | tail -1
step "fixtures"
( cd scripts && npx tsx load_fixtures.ts | tail -3 )

step "worker (replay)"
if [ "${1:-}" != "--keep-worker" ]; then
  pkill -f "worker/src/index.ts" 2>/dev/null || true
  pkill -f "tsx src/index.ts" 2>/dev/null || true
  sleep 1
fi
( cd worker && EVIDENCE_DIR="$ROOT/seed/fixtures/evidence" nohup npm start > ../logs/worker.log 2>&1 & )
for i in $(seq 1 30); do grep -q "loop started" logs/worker.log 2>/dev/null && break; sleep 0.5; done
grep -q "loop started" logs/worker.log || { echo "worker did not start; see logs/worker.log"; exit 1; }

step "92 days"
( cd scripts && npx tsx run_days.ts --until 92 | tail -2 )

step "waiting for investigations"
left=1
for i in $(seq 1 180); do
  left=$(curl -s -X POST http://127.0.0.1:3100/v1/database/dispatch-ledger/sql -d "SELECT status FROM agent_task WHERE status = 'open'" | python3 -c 'import sys,json; print(len(json.load(sys.stdin)[0]["rows"]))' || echo 1)
  if [ "$left" = "0" ]; then break; fi
  sleep 1
done
echo "open tasks after wait: $left"

step "segregation of duties: the agent identity asks to approve INV-1077"
scripts/as_agent.sh approve INV-1077

step "controller pass"
python3 scripts/controller_sim.py --rounds 30 --sleep 2 | tail -4

step "facts"
python3 scripts/facts.py | sed -n '5,40p'
python3 scripts/honesty.py
printf '\ntotal %ss\n' "$(( $(date +%s) - T0 ))"
