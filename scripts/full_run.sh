#!/usr/bin/env bash
# One command from fresh fixtures to a facts table:
#   republish with empty data, mint identities, load fixtures, start the worker in replay mode,
#   advance all 92 days, run the scripted controller pass, recompute docs/FACTS.json.
# Usage: scripts/full_run.sh [--keep-worker] [--inbox]
#   --inbox   load company data only, start the inbox file connector, drop the three sample files from
#             seed/fixtures/inbox/ and wait for ingest_log to show them before advancing the days (Task 21).
#             The facts must come out the same as the seeded run, apart from timestamps.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export PATH="$HOME/.local/bin:$PATH"
export FACTORY_API_KEY="" ANTHROPIC_API_KEY="" ELASTIC_API_KEY="" ASI_ONE_API_KEY=""
export WORKER_MODE=replay
mkdir -p logs
T0=$(date +%s)
step() { printf '\n==> %s (%ss)\n' "$*" "$(( $(date +%s) - T0 ))"; }
KEEP_WORKER=0; INBOX=0
for a in "$@"; do
  case "$a" in
    --keep-worker) KEEP_WORKER=1 ;;
    --inbox) INBOX=1 ;;
    *) echo "unknown option $a (--keep-worker, --inbox)"; exit 2 ;;
  esac
done

curl -sf http://127.0.0.1:3100/v1/ping >/dev/null || { echo "local SpacetimeDB is not running on 3100; run scripts/demo_up.sh first"; exit 1; }

step "publish with empty data"
( cd spacetimedb && spacetime publish dispatch-ledger --module-path . --server local3100 --delete-data=always --yes 2>&1 | tail -1 )
step "identities"
python3 scripts/mint_identities.py | tail -1
step "fixtures"
if [ "$INBOX" = 1 ]; then
  ( cd scripts && npx tsx load_fixtures.ts --skip-transactions | tail -3 )
else
  ( cd scripts && npx tsx load_fixtures.ts | tail -3 )
fi

step "worker (replay)"
if [ "$KEEP_WORKER" != 1 ]; then
  pkill -f "worker/src/index.ts" 2>/dev/null || true
  pkill -f "tsx src/index.ts" 2>/dev/null || true
  sleep 1
fi
( cd worker && EVIDENCE_DIR="$ROOT/seed/fixtures/evidence" nohup npm start > ../logs/worker.log 2>&1 & )
for i in $(seq 1 30); do grep -q "loop started" logs/worker.log 2>/dev/null && break; sleep 0.5; done
grep -q "loop started" logs/worker.log || { echo "worker did not start; see logs/worker.log"; exit 1; }

if [ "$INBOX" = 1 ]; then
  step "inbox file connector: drop the three sample files (file connector; API connectors not built)"
  pkill -f "scripts/ingest_watch.py" 2>/dev/null || true
  rm -rf inbox && mkdir -p inbox
  nohup python3 scripts/ingest_watch.py > logs/ingest.log 2>&1 &
  for i in $(seq 1 40); do grep -q "watching" logs/ingest.log 2>/dev/null && break; sleep 0.25; done
  cp seed/fixtures/inbox/fuel_card_wex_sample.csv seed/fixtures/inbox/toll_statement_sample.csv seed/fixtures/inbox/maintenance_invoices_sample.csv inbox/
  files=0; rows=0
  for i in $(seq 1 240); do
    read -r files rows < <(curl -s -X POST http://127.0.0.1:3100/v1/database/dispatch-ledger/sql -d "SELECT file_name, rows FROM ingest_log" | python3 -c 'import sys,json; r=json.load(sys.stdin)[0]["rows"]; print(len({x[0] for x in r}), sum(int(x[1]) for x in r))' || echo "0 0")
    [ "$files" = "3" ] && [ "$rows" = "7944" ] && break
    sleep 0.5
  done
  echo "ingest_log: $files files, $rows rows (expected 3 files, 7944 rows)"
  grep "ingested\|rejected" logs/ingest.log | cut -c1-200
  [ "$files" = "3" ] && [ "$rows" = "7944" ] || { echo "the inbox connector did not ingest all three files; see logs/ingest.log"; exit 1; }
fi

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

step "waiting for settlement (bank_txn_id on every payment row)"
unsettled=1
for i in $(seq 1 90); do
  unsettled=$(curl -s -X POST http://127.0.0.1:3100/v1/database/dispatch-ledger/sql -d "SELECT txn_ref, bank_txn_id FROM payment" | python3 -c 'import sys,json; print(sum(1 for r in json.load(sys.stdin)[0]["rows"] if r[1][0] == 1))' || echo 1)
  if [ "$unsettled" = "0" ]; then break; fi
  if [ $((i % 10)) -eq 0 ]; then echo "unsettled payments: $unsettled"; fi
  sleep 1
done
echo "unsettled payments after wait: $unsettled"

step "facts"
python3 scripts/facts.py | sed -n '5,40p'
step "Droid table (facts.py rewrote docs/RESULTS.md whole; this re-appends its own section)"
python3 bench/carrierbench/droid_table.py
python3 scripts/honesty.py
printf '\ntotal %ss\n' "$(( $(date +%s) - T0 ))"
