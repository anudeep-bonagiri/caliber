"""Step 3: prove the tools and the MCP endpoint work before Droid is wired in.

    python smoke.py --dry-run     # print the requests, send nothing
    python smoke.py               # execute both tools, then probe MCP initialize + tools/list
    python smoke.py --ms          # also execute find_trips_near_ms with epoch millis

Checks (Task 7 "complete when"):
  1. find_trips_near with hold 2231's station and window returns truck 22 first.
  2. contract_rate_for_vendor for vendor 3 brake_job on day 44 returns a rate.
  3. The MCP endpoint answers initialize and lists both tools.

The 2231 station and window come from seed/fixtures/card_txns.json when it exists
(txn id 2231: stationLat, stationLon, at), otherwise from the literals in the spec.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import timedelta
from pathlib import Path
from typing import Any

from common import AGENT_BUILDER_PATH, MCP_PATH, REPO_ROOT, Client, Settings, esql_rows, load_json
from ingest import iso_to_ms, parse_iso

DEFAULT_CARD_TXNS = REPO_ROOT / "seed" / "fixtures" / "card_txns.json"

# Spec literals for hold 2231 (used when card_txns.json is not there yet).
FALLBACK_POINT_WKT = "POINT(-96.9036 29.6816)"
FALLBACK_SINCE = "2026-08-27T12:30:00Z"
FALLBACK_UNTIL = "2026-08-27T14:00:00Z"
RADIUS_M = 3000
EXPECTED_TRUCK = "22"

VENDOR_ID = "3"
ITEM = "brake_job"
ON_DAY = 44

MCP_PROTOCOL = "2025-03-26"


def hold_2231_window(card_txns_path: Path, txn_ref: str = "2231") -> dict[str, Any]:
    """Point and window for the 2231 smoke call: fixture row when present, spec literals otherwise."""
    if card_txns_path.exists():
        for row in load_json(card_txns_path):
            if str(row.get("id")) == txn_ref and row.get("stationLat") is not None and row.get("at"):
                at = parse_iso(row["at"])
                since = (at - timedelta(minutes=10)).strftime("%Y-%m-%dT%H:%M:%SZ")
                until = (at + timedelta(minutes=10)).strftime("%Y-%m-%dT%H:%M:%SZ")
                return {
                    "source": str(card_txns_path),
                    "point_wkt": f"POINT({float(row['stationLon'])} {float(row['stationLat'])})",
                    "since": since,
                    "until": until,
                }
    return {"source": "spec literals", "point_wkt": FALLBACK_POINT_WKT, "since": FALLBACK_SINCE, "until": FALLBACK_UNTIL}


def execute_tool(client: Client, tool_id: str, params: dict[str, Any], dry_rows: list[dict[str, Any]]) -> tuple[Any, list[dict[str, Any]]]:
    columns = [{"name": k, "type": "keyword"} for k in (dry_rows[0] if dry_rows else {})]
    dry_payload = {"results": [{"type": "query", "data": {"columns": columns, "values": [list(r.values()) for r in dry_rows]}}]}
    resp = client.kibana("POST", f"{AGENT_BUILDER_PATH}/tools/_execute",
                         json_body={"tool_id": tool_id, "tool_params": params}, dry_payload=dry_payload)
    if not resp.ok:
        print(f"  {tool_id}: HTTP {resp.status_code} {resp.text[:500]}")
        return resp, []
    try:
        data = resp.json()
    except ValueError:
        print(f"  {tool_id}: non-JSON response {resp.text[:300]}")
        return resp, []
    rows = esql_rows(data.get("results") or [])
    print(f"  {tool_id}: {len(rows)} row(s)")
    for row in rows[:5]:
        print(f"    {json.dumps(row, ensure_ascii=False)}")
    if not rows and data.get("results"):
        print(f"    raw: {json.dumps(data)[:400]}")
    return resp, rows


def parse_mcp_body(resp: Any) -> dict[str, Any] | None:
    """The Streamable HTTP transport answers with JSON or with one SSE `data:` frame."""
    text = resp.text or ""
    ctype = (getattr(resp, "headers", {}) or {}).get("content-type", "") or ""
    if "text/event-stream" in ctype or text.lstrip().startswith(("event:", "data:")):
        last = None
        for line in text.splitlines():
            if line.startswith("data:"):
                try:
                    last = json.loads(line[5:].strip())
                except ValueError:
                    continue
        return last
    try:
        return json.loads(text) if text else None
    except ValueError:
        return None


def probe_mcp(client: Client, expected_tools: list[str]) -> bool:
    url_path = MCP_PATH
    headers = client.settings.mcp_headers()

    init = {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {
        "protocolVersion": MCP_PROTOCOL,
        "capabilities": {},
        "clientInfo": {"name": "dispatch-ledger-smoke", "version": "0.1"},
    }}
    dry_init = {"jsonrpc": "2.0", "id": 1, "result": {"protocolVersion": MCP_PROTOCOL, "capabilities": {"tools": {}},
                                                       "serverInfo": {"name": "elastic-agent-builder", "version": "dry-run"}}}
    resp = client.kibana("POST", url_path, json_body=init, headers=headers, dry_payload=dry_init)
    if not resp.ok:
        print(f"  MCP initialize: HTTP {resp.status_code} {resp.text[:300]}")
        return False
    body = parse_mcp_body(resp) or {}
    server = (body.get("result") or {}).get("serverInfo") or {}
    print(f"  MCP initialize: ok (server {server.get('name', '?')} {server.get('version', '')})".rstrip())

    session_id = (getattr(resp, "headers", {}) or {}).get("mcp-session-id")
    if session_id:
        headers = {**headers, "mcp-session-id": session_id}
        print(f"  MCP session id: {session_id[:8]}...")

    # Notification; servers answer 202 with no body. Failure here is not fatal.
    client.kibana("POST", url_path, json_body={"jsonrpc": "2.0", "method": "notifications/initialized"},
                  headers=headers, dry_status=202)

    listing = {"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}}
    dry_list = {"jsonrpc": "2.0", "id": 2, "result": {"tools": [{"name": t} for t in expected_tools]}}
    resp = client.kibana("POST", url_path, json_body=listing, headers=headers, dry_payload=dry_list)
    if not resp.ok:
        print(f"  MCP tools/list: HTTP {resp.status_code} {resp.text[:300]}")
        return False
    body = parse_mcp_body(resp) or {}
    tools = (body.get("result") or {}).get("tools") or []
    names = [t.get("name") for t in tools if isinstance(t, dict)]
    print(f"  MCP tools/list: {len(names)} tool(s): {', '.join(names) if names else '(none)'}")
    missing = [t for t in expected_tools if t not in names]
    if missing:
        print(f"  MCP missing: {missing} (MCP exposes every Agent Builder tool; run setup_agent.py first)")
    return not missing


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--dry-run", action="store_true", help="print every request, send nothing")
    p.add_argument("--verbose", action="store_true", help="print requests even when live")
    p.add_argument("--ms", action="store_true", help="also execute find_trips_near_ms")
    p.add_argument("--card-txns", type=Path, default=DEFAULT_CARD_TXNS, help="card_txns.json to read txn 2231 from")
    p.add_argument("--skip-mcp", action="store_true")
    args = p.parse_args(argv)

    settings = Settings.from_env(dry_run=args.dry_run)
    client = Client(settings, dry_run=args.dry_run, verbose=args.verbose)
    results: list[tuple[str, bool]] = []

    def check(name: str, ok: bool) -> None:
        results.append((name, ok))
        print(f"[{'PASS' if ok else 'FAIL'}] {name}")

    window = hold_2231_window(args.card_txns)
    print(f"Hold 2231 window from {window['source']}: {window['point_wkt']} {window['since']} .. {window['until']}")

    print("Executing find_trips_near...")
    trips_params = {"point_wkt": window["point_wkt"], "radius_m": RADIUS_M, "since": window["since"], "until": window["until"]}
    dry_rows = [{"truck_id": "22", "at": "2026-08-27T13:05:00.000Z", "dist_m": 47.1}]
    resp, rows = execute_tool(client, "find_trips_near", trips_params, dry_rows)
    first = str(rows[0].get("truck_id")) if rows else None
    date_trouble = (not resp.ok) or (resp.ok and not rows)
    check(f"find_trips_near returns truck {EXPECTED_TRUCK} first (got {first})", first == EXPECTED_TRUCK)

    if args.ms or date_trouble:
        if date_trouble and not args.ms:
            print("  date version returned nothing; trying find_trips_near_ms (register it with setup_agent.py --include-ms)")
        ms_params = {"point_wkt": window["point_wkt"], "radius_m": RADIUS_M,
                     "since_ms": iso_to_ms(window["since"]), "until_ms": iso_to_ms(window["until"])}
        print("Executing find_trips_near_ms...")
        _, ms_rows = execute_tool(client, "find_trips_near_ms", ms_params, dry_rows)
        ms_first = str(ms_rows[0].get("truck_id")) if ms_rows else None
        check(f"find_trips_near_ms returns truck {EXPECTED_TRUCK} first (got {ms_first})", ms_first == EXPECTED_TRUCK)

    print("Executing contract_rate_for_vendor...")
    contract_params = {"vendor_id": VENDOR_ID, "item": ITEM, "on": ON_DAY}
    _, crows = execute_tool(client, "contract_rate_for_vendor", contract_params,
                            [{"contract_id": "C-003-BRK", "rate_cents": 48500, "clause": "Section 4.2 ..."}])
    rate = crows[0].get("rate_cents") if crows else None
    check(f"contract_rate_for_vendor vendor {VENDOR_ID} {ITEM} day {ON_DAY} returns a rate (got {rate})", rate is not None)

    if not args.skip_mcp:
        print(f"Probing MCP at {settings.kibana_url}{MCP_PATH}...")
        expected = ["find_trips_near", "contract_rate_for_vendor"]
        check("MCP initialize + tools/list exposes both tools", probe_mcp(client, expected))

    failed = [n for n, ok in results if not ok]
    print()
    print(f"{len(results) - len(failed)}/{len(results)} checks passed" + (" [dry-run]" if args.dry_run else ""))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
