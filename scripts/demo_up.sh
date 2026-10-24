#!/usr/bin/env bash
# Build and serve the demo month with no model calls and no network.
#   scripts/demo_up.sh            start everything (server, module, identities, fixtures, worker in replay, web)
#   scripts/demo_up.sh --no-web   skip the web dev server
# Every model key is exported empty on purpose: a variable that is set, even to nothing, wins over .env,
# so the offline run cannot make a paid call by accident.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export PATH="$HOME/.local/bin:$PATH"
export FACTORY_API_KEY= ANTHROPIC_API_KEY= ELASTIC_API_KEY= ELASTICSEARCH_URL= KIBANA_URL= ASI_ONE_API_KEY=
export WORKER_MODE=replay
export STDB_URI=http://127.0.0.1:3100 STDB_DB=dispatch-ledger
mkdir -p .spacetime logs

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
( cd spacetimedb && spacetime publish dispatch-ledger --module-path . --server local3100 --delete-data=always --yes 2>&1 | tail -2 )

step "4/7 agent and controller identities"
python3 scripts/mint_identities.py --uri "$STDB_URI" --db "$STDB_DB"

step "5/7 fixtures"
( cd scripts && [ -d node_modules ] || npm install --silent )
( cd scripts && npx tsx load_fixtures.ts )

step "6/7 worker in replay mode (logs/worker.log)"
pkill -f "worker/src/index.ts" 2>/dev/null || true
pkill -f "tsx src/index.ts" 2>/dev/null || true
pkill -f "vite --host 127.0.0.1 --port 5173" 2>/dev/null || true
pkill -f "agent/agent.py" 2>/dev/null || true
sleep 1
if [ -f worker/package.json ]; then
  ( cd worker && [ -d node_modules ] || npm install --silent )
  ( cd worker && nohup npm start > ../logs/worker.log 2>&1 & )
fi

if [ "${1:-}" != "--no-web" ] && [ -f web/package.json ]; then
  step "7/7 web dashboard (logs/web.log)"
  ( cd web && [ -d node_modules ] || npm install --silent )
  ( cd web && nohup npm run dev -- --host 127.0.0.1 --port 5173 > ../logs/web.log 2>&1 & )
  echo "dashboard: http://127.0.0.1:5173"
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
