"""Step 2: register the ES|QL tools and the dispatch-investigator agent in Elastic Agent Builder.

    python setup_agent.py --dry-run        # print every request, send nothing
    python setup_agent.py                  # upsert find_trips_near, contract_rate_for_vendor, the agent
    python setup_agent.py --include-ms     # also register find_trips_near_ms (epoch-millis fallback)

Upsert pattern (paper-scout): GET /api/agent_builder/{tools|agents}/{id}; 200 -> PUT the
mutable fields, 404 -> POST the full body. Safe to re-run. Indices must exist first
(ingest.py), because Agent Builder validates ES|QL tools against real mappings.
"""

from __future__ import annotations

import argparse
import copy
import sys
from pathlib import Path
from typing import Any

from common import AGENT_BUILDER_PATH, ELASTIC_DIR, MCP_PATH, Client, Settings, load_json

TOOLS_DIR = ELASTIC_DIR / "tools"
CORE_TOOLS = ("find_trips_near", "contract_rate_for_vendor")
MS_TOOL = "find_trips_near_ms"

# Fields Kibana returns on GET that it rejects on create or update (Peel's list) plus the
# identity fields paper-scout strips before PUT.
PUT_EXCLUDED = ("id", "type", "name", "readonly", "experimental", "confirmation", "schema", "type_label",
                "created_at", "updated_at")

AGENT_INSTRUCTIONS = """\
You are dispatch-investigator, the investigator inside Dispatch Ledger, an accounts-payable clerk for a trucking carrier.

You investigate exactly one accounts-payable exception at a time: one fuel, toll or maintenance charge that the matching code put on hold. The brief you receive names the charge (txn_ref or invoice_id), the truck, driver, vendor, station or plaza, amount and time.

Rules:
- Answer only from tool results. If a fact is not in a tool result, say it is unknown. Never guess, never fill gaps from general knowledge.
- Cite tool outputs verbatim: copy the truck_id, at, dist_m, contract_id, rate_cents and clause values exactly as the tool returned them, and name the tool that returned them.
- Never recommend paying. Your recommendation is one of clear, hold or hold_and_ask. "clear" means the evidence explains the charge; it is not an instruction to pay.
- Use find_trips_near to learn which trucks were physically at a location in a time window (WKT point is POINT(lon lat), longitude first; radius in meters; since and until in ISO-8601 UTC). The nearest truck is first. If it fails on the date parameters and find_trips_near_ms exists, call that with epoch milliseconds.
- Use contract_rate_for_vendor to learn the contracted rate in cents for one vendor, item and business day. No row means no contract covered that item on that day; say so.
- Do not write ES|QL or SQL yourself. Only call the tools you are given.
- Keep the answer short: finding, evidence (source, ref, quote), recommendation, confidence between 0 and 1, and one question for the controller when you recommend hold_and_ask.
"""


def load_tool(tool_id: str) -> dict[str, Any]:
    body = load_json(TOOLS_DIR / f"{tool_id}.json")
    if body.get("id") != tool_id:
        raise SystemExit(f"{tool_id}.json declares id {body.get('id')!r}")
    return body


def agent_body(agent_id: str, tool_ids: list[str]) -> dict[str, Any]:
    return {
        "id": agent_id,
        "name": "Dispatch Investigator",
        "description": "Investigates one accounts-payable exception for a trucking carrier using telematics and contract ES|QL tools.",
        "labels": ["calhacks", "dispatch-ledger"],
        "avatar_color": "#F2A33C",
        "avatar_symbol": "DI",
        "configuration": {
            "instructions": AGENT_INSTRUCTIONS,
            "tools": [{"tool_ids": list(tool_ids)}],
        },
    }


def put_body(body: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in body.items() if k not in PUT_EXCLUDED}


def with_keyword_params(body: dict[str, Any]) -> dict[str, Any]:
    """Some Kibana builds name the ES|QL param types after field types (keyword, not string)."""
    alt = copy.deepcopy(body)
    for spec in alt.get("configuration", {}).get("params", {}).values():
        if spec.get("type") == "string":
            spec["type"] = "keyword"
    return alt


def upsert(client: Client, kind: str, body: dict[str, Any]) -> bool:
    """kind is 'tools' or 'agents'. Returns True on success."""
    item_id = body["id"]
    path = f"{AGENT_BUILDER_PATH}/{kind}/{item_id}"
    existing = client.kibana("GET", path, dry_status=404,
                             dry_payload={"statusCode": 404, "message": f"{kind[:-1]} {item_id} not found (dry-run assumption)"})
    if existing.ok:
        resp = client.kibana("PUT", path, json_body=put_body(body))
        verb = "updated"
    else:
        if client.dry_run:
            print(f"    (dry-run: GET assumed 404, so POST is shown; a live rerun would GET 200 and PUT instead)")
        resp = client.kibana("POST", f"{AGENT_BUILDER_PATH}/{kind}", json_body=body, dry_payload=body)
        verb = "created"

    if not resp.ok and resp.status_code == 400 and kind == "tools" and "param" in resp.text.lower():
        print(f"    400 mentions params; retrying {item_id} with keyword-style param types")
        alt = with_keyword_params(body)
        if existing.ok:
            resp = client.kibana("PUT", path, json_body=put_body(alt))
        else:
            resp = client.kibana("POST", f"{AGENT_BUILDER_PATH}/{kind}", json_body=alt)

    label = kind[:-1]
    if resp.ok:
        print(f"  {label} {item_id}: {verb}")
        return True
    print(f"  {label} {item_id}: FAILED {resp.status_code} {resp.text[:400]}")
    return False


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--dry-run", action="store_true", help="print every request, send nothing")
    p.add_argument("--verbose", action="store_true", help="print requests even when live")
    p.add_argument("--include-ms", action="store_true", help=f"also register {MS_TOOL} and give it to the agent")
    p.add_argument("--agent-id", default=None, help="override the agent id (default dispatch-investigator)")
    args = p.parse_args(argv)

    settings = Settings.from_env(dry_run=args.dry_run)
    if args.agent_id:
        settings.agent_id = args.agent_id
    client = Client(settings, dry_run=args.dry_run, verbose=args.verbose)

    tool_ids = list(CORE_TOOLS) + ([MS_TOOL] if args.include_ms else [])
    print(f"Agent Builder at {settings.kibana_url}" + (" [dry-run]" if args.dry_run else ""))

    print("Registering tools...")
    ok_tools: list[str] = []
    for tool_id in tool_ids:
        if upsert(client, "tools", load_tool(tool_id)):
            ok_tools.append(tool_id)

    if not ok_tools:
        print("No tool was registered; not creating the agent.")
        return 1
    if len(ok_tools) < len(tool_ids):
        print(f"Agent will reference only the tools that registered: {ok_tools}")

    print("Registering agent...")
    agent_ok = upsert(client, "agents", agent_body(settings.agent_id, ok_tools))

    print()
    print(f"Tools: {', '.join(ok_tools)}")
    print(f"Agent: {settings.agent_id}")
    print(f"MCP endpoint for the worker: {settings.kibana_url}{MCP_PATH}")
    print("Next: python smoke.py" + (" --dry-run" if args.dry_run else ""))
    return 0 if agent_ok and len(ok_tools) == len(tool_ids) else 1


if __name__ == "__main__":
    sys.exit(main())
