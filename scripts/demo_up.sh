#!/usr/bin/env bash
# Build and serve the demo month with no model calls and no network.
#   scripts/demo_up.sh            start everything (server, module, identities, fixtures, worker in replay, web)
#   scripts/demo_up.sh --no-web   skip the web dev server
#   scripts/demo_up.sh --inbox    load company data only and start the inbox file connector (scripts/ingest_watch.py);
#                                 transactions arrive when the three sample files are dropped into inbox/
# Every model key is exported empty on purpose: a variable that is set, even to nothing, wins over .env,
# so the offline run cannot make a paid call by accident.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export PATH="$HOME/.local/bin:$PATH"
export FACTORY_API_KEY="" ANTHROPIC_API_KEY="" ELASTIC_API_KEY="" ELASTICSEARCH_URL="" KIBANA_URL="" ASI_ONE_API_KEY=""
export WORKER_MODE=replay
export STDB_URI=http://127.0.0.1:3100 STDB_DB=dispatch-ledger
mkdir -p .spacetime logs
WEB=1; INBOX=0
for a in "$@"; do
  case "$a" in
    --no-web) WEB=0 ;;
    --inbox) INBOX=1 ;;
    *) echo "unknown option $a (--no-web, --inbox)"; exit 2 ;;
  esac
done

step() { printf '\n==> %s\n' "$*"; }

step "1/7 local SpacetimeDB on 127.0.0.1:3100"
if ! curl -sf "$STDB_URI/v1/ping" >/dev/null 2>&1; then
  nohup spacetime start --listen-addr 127.0.0.1:3100 --data-dir "$ROOT/.spacetime/data" > logs/spacetimedb.log 2>&1 &
  for i in $(seq 1 40); do curl -sf "$STDB_URI/v1/ping" >/dev/null 2>&1 && break; sleep 0.5; done
fi
curl -sf "$STDB_URI/v1/ping" >/dev/null || { echo "server did not start; see logs/spacetimedb.log"; exit 1; }
spacetime server add local3100 --url "$STDB_URI" >/dev/null 2>&1 || true

step "2/7 seed identity (the publisher becomes the seed role)"
touch .env
if ! grep -q '^STDB_SEED_TOKEN=.\+' .env; then
  SEED=$(curl -s -X POST "$STDB_URI/v1/identity")
  TOKEN=$(printf '%s' "$SEED" | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
  IDENT=$(printf '%s' "$SEED" | python3 -c 'import sys,json;print(json.load(sys.stdin)["identity"])')
  printf 'STDB_URI=%s\nSTDB_DB=%s\nSTDB_SEED_IDENTITY=%s\nSTDB_SEED_TOKEN=%s\n' "$STDB_URI" "$STDB_DB" "$IDENT" "$TOKEN" >> .env
fi
SEED_TOKEN=$(grep '^STDB_SEED_TOKEN=' .env | cut -d= -f2-)
spacetime login --token "$SEED_TOKEN" >/dev/null 2>&1

step "3/7 publish the module (fresh data)"
( cd spacetimedb && [ -d node_modules ] || npm install --silent )
publish() { ( cd spacetimedb && spacetime publish dispatch-ledger --module-path . --server local3100 --delete-data=always --yes 2>&1 ); }
OUT=$(publish) || true
if printf '%s' "$OUT" | grep -q "403 Forbidden"; then
  # A database with this name already exists on 127.0.0.1:3100 and belongs to another identity
  # (another checkout published it). The demo owns the server, so restart it on this checkout's own data dir.
  echo "database owned by another identity; restarting the local server from $ROOT/.spacetime/data"
  pkill -f "listen-addr 127.0.0.1:3100" 2>/dev/null || true
  sleep 1
  rm -rf "$ROOT/.spacetime/data"
  nohup spacetime start --listen-addr 127.0.0.1:3100 --data-dir "$ROOT/.spacetime/data" > logs/spacetimedb.log 2>&1 &
  for i in $(seq 1 40); do curl -sf "$STDB_URI/v1/ping" >/dev/null 2>&1 && break; sleep 0.5; done
  # a fresh server issues fresh identities: mint the seed again and log the CLI in with it
  SEED=$(curl -s -X POST "$STDB_URI/v1/identity")
  TOKEN=$(printf '%s' "$SEED" | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
  IDENT=$(printf '%s' "$SEED" | python3 -c 'import sys,json;print(json.load(sys.stdin)["identity"])')
  python3 - "$TOKEN" "$IDENT" <<'PY'
import sys, re
from pathlib import Path
tok, ident = sys.argv[1], sys.argv[2]
p = Path('.env'); s = p.read_text()
s = re.sub(r'^STDB_SEED_TOKEN=.*$', f'STDB_SEED_TOKEN={tok}', s, flags=re.M)
s = re.sub(r'^STDB_SEED_IDENTITY=.*$', f'STDB_SEED_IDENTITY={ident}', s, flags=re.M)
p.write_text(s)
PY
  spacetime login --token "$TOKEN" >/dev/null 2>&1
  OUT=$(publish)
fi
printf '%s\n' "$OUT" | tail -2
printf '%s' "$OUT" | grep -q "database with name" || { echo "publish failed"; exit 1; }

step "4/7 agent and controller identities"
python3 scripts/mint_identities.py --uri "$STDB_URI" --db "$STDB_DB"

step "5/7 fixtures"
# module_bindings/index.ts resolves the spacetimedb package from the repo root; a fresh clone has no root node_modules.
if [ ! -d node_modules ]; then
  echo "root dependencies missing; installing (needs the network the first time)"
  if [ -f package-lock.json ]; then npm ci --silent; else npm install --silent; fi
fi
( cd scripts && [ -d node_modules ] || npm install --silent )
if [ "$INBOX" = 1 ]; then
  ( cd scripts && npx tsx load_fixtures.ts --skip-transactions )
else
  ( cd scripts && npx tsx load_fixtures.ts )
fi

step "6/7 worker in replay mode (logs/worker.log)"
pkill -f "worker/src/index.ts" 2>/dev/null || true
pkill -f "tsx src/index.ts" 2>/dev/null || true
pkill -f "vite --host 127.0.0.1 --port 5173" 2>/dev/null || true
pkill -f "agent/agent.py" 2>/dev/null || true
pkill -f "scripts/ingest_watch.py" 2>/dev/null || true
sleep 1
if [ -f worker/package.json ]; then
  ( cd worker && [ -d node_modules ] || npm install --silent )
  ( cd worker && nohup npm start > ../logs/worker.log 2>&1 & )
fi

if [ "$WEB" = 1 ] && [ -f web/package.json ]; then
  step "7/7 web dashboard (logs/web.log)"
  ( cd web && [ -d node_modules ] || npm install --silent )
  ( cd web && nohup npm run dev -- --host 127.0.0.1 --port 5173 > ../logs/web.log 2>&1 & )
  echo "dashboard: http://127.0.0.1:5173"
fi

if [ ! -x agent/.venv/bin/python ] && [ -f agent/requirements.txt ]; then
  step "agent venv (agent/.venv missing)"
  echo "warning: this step needs the network the first time; run demo_up.sh once before Wi-Fi goes off"
  python3 -m venv agent/.venv && agent/.venv/bin/pip install -q -r agent/requirements.txt
fi

if [ "$INBOX" = 1 ]; then
  step "inbox file connector (logs/ingest.log); API connectors not built"
  mkdir -p inbox
  nohup python3 scripts/ingest_watch.py > logs/ingest.log 2>&1 &
  for i in $(seq 1 20); do grep -q "watching" logs/ingest.log 2>/dev/null && break; sleep 0.25; done
  cat <<EOF
  Drop the sample files to bring the transactions in (each lands in inbox/done/ when ingested):
    cp seed/fixtures/inbox/fuel_card_wex_sample.csv inbox/
    cp seed/fixtures/inbox/toll_statement_sample.csv inbox/
    cp seed/fixtures/inbox/maintenance_invoices_sample.csv inbox/
  Rows dated on or before today are matched at once; later rows wait for their day. tail -f logs/ingest.log
EOF
fi

cat <<EOF

Ready. The clock is paused on day 0.
  scripts/clock.sh run        start the 2 second day tick
  scripts/clock.sh pause      stop on the current day
  scripts/clock.sh step       advance one day
  scripts/clock.sh tick 500000   faster ticks (0.5 s)
  agent/.venv/bin/python -m agent.cli "what needs me"   the controller's terminal (same code as the ASI:One agent)
  agent/.venv/bin/python agent/agent.py               the ASI:One seat (needs AGENT_SEED in .env; start it once, by hand)
  python3 scripts/facts.py    recompute docs/FACTS.json from the ledger
EOF
