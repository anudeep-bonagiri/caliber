#!/usr/bin/env bash
# Prove the segregation of duties live: call a controller action with the AGENT token.
# The procedure answers [false, "agent may not do this (needs controller)"] and the refusal is a
# persistent audit_event row with actor_role agent.
#   scripts/as_agent.sh approve INV-1077 [note]
#   scripts/as_agent.sh rule 1
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
set -a; . "$ROOT/.env"; set +a
B="$STDB_URI/v1/database/$STDB_DB/call"
case "${1:-}" in
  approve) note="${3:-}"; if [ -n "$note" ]; then body="[\"$2\", {\"some\": \"$note\"}]"; else body="[\"$2\", {\"none\": []}]"; fi
           curl -s -X POST "$B/try_approve_payment" -H "Authorization: Bearer $STDB_AGENT_TOKEN" -H "Content-Type: application/json" -d "$body" ;;
  rule)    curl -s -X POST "$B/try_approve_rule" -H "Authorization: Bearer $STDB_AGENT_TOKEN" -H "Content-Type: application/json" -d "[$2]" ;;
  *) echo "usage: $0 approve <txnRef> [note] | rule <id>"; exit 2 ;;
esac
echo
echo "audit trail (last refusal):"
curl -s -X POST "$STDB_URI/v1/database/$STDB_DB/sql" -d "SELECT id, action, actor_role, ref, detail FROM audit_event WHERE action = 'refused'" | python3 -c 'import sys,json; r=json.load(sys.stdin)[0]; rows=sorted(r["rows"], key=lambda x: x[0]); print(rows[-1][1:] if rows else "none")'
