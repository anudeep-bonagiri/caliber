"""Task 26.3: register the stale-hold Workflow and run it once.

    python setup_workflow.py --dry-run             # print every request, send nothing
    python setup_workflow.py                       # upsert workflows/stale_holds.yaml, ensure the escalations index
    python setup_workflow.py --run                 # ... then run it once (manual trigger) and print the result
    python setup_workflow.py --run --min-age-bd 0  # demo: escalate every open hold regardless of age (recorded in each doc)
    python setup_workflow.py --status <execution_id>

What the Workflows API on this Serverless build exposes (probed 2026-10-24, docs/evidence/elastic/workflows_api_probe.txt):
GET /api/workflows (list), POST /api/workflows {"workflows": [{"yaml"}]} (bulk create), DELETE /api/workflows {"ids"}.
GET or PUT /api/workflows/{id} and POST /api/workflows/{id}/run answer 404, so the upsert here is list, delete the
previous copy by name, create; and the run goes through Agent Builder's `platform.core.execute_workflow` tool
(`POST /api/agent_builder/tools/_execute`), the same tool the MCP endpoint exposes. Status comes from
`platform.core.get_workflow_execution_status`.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Any

from common import AGENT_BUILDER_PATH, ELASTIC_DIR, Client, Settings, load_json

WORKFLOW_FILE = ELASTIC_DIR / "workflows" / "stale_holds.yaml"
WORKFLOW_NAME = "caliber-stale-holds"
ESCALATIONS_INDEX = "escalations"
ESCALATIONS_MAPPING = ELASTIC_DIR / "mappings" / "escalations.json"


def workflow_name(yaml_text: str) -> str:
    for line in yaml_text.splitlines():
        if line.startswith("name:"):
            return line.split(":", 1)[1].strip().strip('"').strip("'")
    return WORKFLOW_NAME


def list_workflows(client: Client) -> list[dict[str, Any]]:
    resp = client.kibana("GET", "/api/workflows", dry_payload={"total": 0, "results": []})
    if not resp.ok:
        print(f"GET /api/workflows: HTTP {resp.status_code} {resp.text[:300]}", file=sys.stderr)
        return []
    return list(resp.json().get("results") or [])


def delete_workflows(client: Client, ids: list[str]) -> None:
    if not ids:
        return
    resp = client.kibana("DELETE", "/api/workflows", json_body={"ids": ids}, dry_payload={"deleted": len(ids)})
    print(f"  deleted previous copy: {ids} -> HTTP {resp.status_code}")


def create_workflow(client: Client, yaml_text: str) -> dict[str, Any] | None:
    dry = {"created": [{"id": WORKFLOW_NAME, "name": WORKFLOW_NAME, "enabled": True, "valid": True}], "failed": []}
    resp = client.kibana("POST", "/api/workflows", json_body={"workflows": [{"yaml": yaml_text}]}, dry_payload=dry)
    if not resp.ok:
        print(f"POST /api/workflows: HTTP {resp.status_code} {resp.text[:600]}", file=sys.stderr)
        return None
    data = resp.json()
    if data.get("failed"):
        print(f"workflow rejected: {json.dumps(data['failed'])[:800]}", file=sys.stderr)
        return None
    created = (data.get("created") or [None])[0]
    return created


def upsert_workflow(client: Client, yaml_text: str) -> dict[str, Any] | None:
    name = workflow_name(yaml_text)
    existing = [w for w in list_workflows(client) if w.get("name") == name]
    if len(existing) == 1 and (existing[0].get("yaml") or "").strip() == yaml_text.strip():
        w = existing[0]
        print(f"  workflow {name}: unchanged, keeping id {w.get('id')} (enabled {w.get('enabled')}, valid {w.get('valid')})")
        return w
    if existing:
        print(f"  {len(existing)} existing workflow(s) named {name} differ from the file; no PUT route on this build, so delete then create")
        delete_workflows(client, [w["id"] for w in existing])
    created = create_workflow(client, yaml_text)
    if created:
        print(f"  workflow {name}: created as id {created.get('id')} (enabled {created.get('enabled')}, valid {created.get('valid')})")
    return created


def ensure_escalations_index(client: Client) -> None:
    if client.index_exists(ESCALATIONS_INDEX):
        print(f"  index {ESCALATIONS_INDEX}: exists")
        return
    client.create_index(ESCALATIONS_INDEX, load_json(ESCALATIONS_MAPPING))
    print(f"  index {ESCALATIONS_INDEX}: created")


def execute_tool(client: Client, tool_id: str, params: dict[str, Any], dry_payload: Any) -> dict[str, Any]:
    resp = client.kibana("POST", f"{AGENT_BUILDER_PATH}/tools/_execute", json_body={"tool_id": tool_id, "tool_params": params},
                         dry_payload={"results": [{"type": "other", "data": dry_payload}]}, timeout=600)
    if not resp.ok:
        return {"error": f"HTTP {resp.status_code} {resp.text[:400]}"}
    results = (resp.json() or {}).get("results") or []
    first = results[0] if results else {}
    if first.get("type") == "error":
        return {"error": (first.get("data") or {}).get("message", "unknown error")}
    return first.get("data") or {}


def run_workflow(client: Client, workflow_id: str, min_age_bd: float | None, wait: bool) -> dict[str, Any]:
    params: dict[str, Any] = {"workflowId": workflow_id, "waitForCompletion": wait}
    if min_age_bd is not None:
        params["inputs"] = {"min_age_bd": min_age_bd}
    return execute_tool(client, "platform.core.execute_workflow", params, {"executionId": "dry-run", "status": "completed"})


def execution_status(client: Client, execution_id: str) -> dict[str, Any]:
    return execute_tool(client, "platform.core.get_workflow_execution_status", {"executionId": execution_id},
                        {"executionId": execution_id, "status": "completed"})


def count_escalations(client: Client, run_id: str | None) -> int | None:
    if client.dry_run:
        return None
    client.refresh(ESCALATIONS_INDEX)
    es = client.es()
    if run_id:
        return int(es.count(index=ESCALATIONS_INDEX, query={"term": {"workflow_run": run_id}})["count"])
    return int(es.count(index=ESCALATIONS_INDEX)["count"])


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--verbose", action="store_true")
    p.add_argument("--file", type=Path, default=WORKFLOW_FILE)
    p.add_argument("--run", action="store_true", help="run the workflow once after upserting it")
    p.add_argument("--min-age-bd", type=float, default=None, help="manual-run input; default is the workflow's own default (2)")
    p.add_argument("--no-wait", action="store_true", help="return the execution id without waiting")
    p.add_argument("--status", metavar="EXECUTION_ID", help="print the status of one execution and exit")
    args = p.parse_args(argv)

    settings = Settings.from_env(dry_run=args.dry_run)
    client = Client(settings, dry_run=args.dry_run, verbose=args.verbose)

    if args.status:
        print(json.dumps(execution_status(client, args.status), indent=1)[:4000])
        return 0

    yaml_text = args.file.read_text(encoding="utf-8")
    print(f"Workflows at {settings.kibana_url}" + (" [dry-run]" if args.dry_run else ""))
    ensure_escalations_index(client)
    created = upsert_workflow(client, yaml_text)
    if not created:
        return 1
    workflow_id = created.get("id") or WORKFLOW_NAME
    if not args.run:
        print(f"Next: python setup_workflow.py --run   (workflow id {workflow_id})")
        return 0

    before = count_escalations(client, None)
    print(f"Running {workflow_id} once" + (f" with min_age_bd={args.min_age_bd:g}" if args.min_age_bd is not None else "") + "...")
    t0 = time.monotonic()
    result = run_workflow(client, workflow_id, args.min_age_bd, wait=not args.no_wait)
    took = time.monotonic() - t0
    if "error" in result:
        print(f"  run failed: {result['error']}")
        return 1
    # Shape seen 2026-10-24: {"execution": {"execution_id", "status", "workflow_id", "started_at", "finished_at", "workflow_name", "output"}}
    execution = result.get("execution") if isinstance(result.get("execution"), dict) else result
    run_id = execution.get("execution_id") or execution.get("executionId") or execution.get("id")
    print(f"  execution {run_id}: status {execution.get('status')} after {took:.1f} s "
          f"(started {execution.get('started_at')}, finished {execution.get('finished_at')})")
    if args.verbose:
        print(json.dumps(result, indent=1)[:3000])
    after = count_escalations(client, None)
    mine = count_escalations(client, str(run_id)) if run_id else None
    if before is not None and after is not None:
        print(f"  escalations: {before} before, {after} after, {mine if mine is not None else '?'} from this run")
    return 0


if __name__ == "__main__":
    sys.exit(main())
