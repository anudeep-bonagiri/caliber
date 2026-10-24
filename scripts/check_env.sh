#!/usr/bin/env bash
# Report which variables are present in .env as booleans. Never prints a value.
# Exit 1 when a variable required for the offline demo is missing.
#   scripts/check_env.sh          required set for the offline demo
#   scripts/check_env.sh --live   also require the live-run keys
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENVF="$ROOT/.env"
[ -f "$ENVF" ] || { echo ".env missing at $ENVF"; exit 1; }
present() { grep -qE "^$1=.+" "$ENVF"; }
REQUIRED=(STDB_URI STDB_DB STDB_SEED_TOKEN STDB_AGENT_TOKEN STDB_CONTROLLER_TOKEN)
LIVE=(FACTORY_API_KEY ELASTICSEARCH_URL ELASTIC_API_KEY KIBANA_URL ASI_ONE_API_KEY AGENT_SEED ANTHROPIC_API_KEY)
OPTIONAL=(NESSIE_API_KEY CRS_USERNAME CRS_PASSWORD AGENT_PORT NESSIE_BASE)
missing=0
echo "required (offline demo):"
for v in "${REQUIRED[@]}"; do if present "$v"; then echo "  $v true"; else echo "  $v false"; missing=1; fi; done
echo "live runs:"
for v in "${LIVE[@]}"; do if present "$v"; then echo "  $v true"; else echo "  $v false"; [ "${1:-}" = "--live" ] && missing=1; fi; done
echo "optional (Tasks 16 and 17):"
for v in "${OPTIONAL[@]}"; do if present "$v"; then echo "  $v true"; else echo "  $v false"; fi; done
if [ "$missing" = 1 ]; then echo "missing required variables"; exit 1; fi
echo "ok"
