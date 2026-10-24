"""Task 26.3: mirror the ledger's public `hold` table into the Elastic `holds` index for the stale-hold Workflow.

    python mirror_holds.py --dry-run     # read the ledger, print the bulk request, send nothing
    python mirror_holds.py               # anonymous SpacetimeDB SQL -> bulk index into `holds`

Read side: SpacetimeDB's HTTP SQL endpoint with no token (the `hold` and `business_day` tables are public views;
nothing here can write to the ledger). Write side: the Elastic project key, one bulk request, `_id` = txn_ref so
reruns overwrite. Each document carries the hold as the ledger shows it plus `current_day` (the business-day
clock when mirrored), `age_bd` (current_day minus the day the hold opened) and `mirrored_at`.

The worker does not run this yet; for the demo it is run once by hand before the workflow is triggered, and the
escalation brief says so (`source: mirror_holds.py`). Elastic is not the system of record: the kernel's `hold`
rows in SpacetimeDB are, and this index is a read-only copy for the Workflow's ES|QL step.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests

from common import ELASTIC_DIR, Client, Settings, load_env, load_json, print_request

HOLDS_INDEX = "holds"
MAPPING = ELASTIC_DIR / "mappings" / "holds.json"
OPEN_STATUSES = ("open", "awaiting_controller")


def stdb_sql(stdb_uri: str, db: str, query: str, timeout: int = 15) -> list[dict[str, Any]]:
    """Anonymous SpacetimeDB SQL: positional rows zipped with schema.elements[i].name.some (Sprout's helper)."""
    url = f"{stdb_uri.rstrip('/')}/v1/database/{db}/sql"
    resp = requests.post(url, data=query.encode("utf-8"), headers={"Content-Type": "text/plain"}, timeout=timeout)
    if resp.status_code == 530:
        raise SystemExit(f"ledger refused the query: {resp.text[:300]}")
    resp.raise_for_status()
    res = resp.json()[0]
    names = [e["name"]["some"] for e in res["schema"]["elements"]]
    return [dict(zip(names, row)) for row in res["rows"]]


def option_value(v: Any) -> Any:
    """SpacetimeDB encodes Option<T> as [0, value] (some) or [1, []] (none) over HTTP SQL."""
    if isinstance(v, list) and len(v) == 2 and v[0] in (0, 1):
        return v[1] if v[0] == 0 else None
    return v


def hold_to_doc(h: dict[str, Any], current_day: int, mirrored_at: str) -> dict[str, Any]:
    opened = int(h.get("day") or 0)
    status = str(h.get("status") or "")
    updated = h.get("updated_at")
    updated_micros = updated[0] if isinstance(updated, list) and updated else None
    doc = {
        "_id": str(h["txn_ref"]),
        "txn_ref": str(h["txn_ref"]),
        "kind": h.get("kind"),
        "code": h.get("code"),
        "cents": int(h.get("cents") or 0),
        "opened_day": opened,
        "current_day": current_day,
        "age_bd": current_day - opened,
        "status": status,
        "is_open": status in OPEN_STATUSES,
        "reason": h.get("reason"),
        "question": option_value(h.get("question")),
        "answer": option_value(h.get("answer")),
        "updated_at": datetime.fromtimestamp(updated_micros / 1_000_000, tz=timezone.utc).isoformat() if updated_micros else None,
        "mirrored_at": mirrored_at,
        "source": "mirror_holds.py",
    }
    return {k: v for k, v in doc.items() if v is not None}


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--dry-run", action="store_true", help="read the ledger, print the requests, send nothing to Elastic")
    p.add_argument("--verbose", action="store_true")
    p.add_argument("--recreate", action="store_true", help="drop and recreate the holds index first")
    p.add_argument("--stdb-uri", default=None, help="override STDB_URI")
    p.add_argument("--stdb-db", default=None, help="override STDB_DB")
    args = p.parse_args(argv)

    load_env()
    stdb_uri = args.stdb_uri or os.environ.get("STDB_URI") or "http://127.0.0.1:3100"
    db = args.stdb_db or os.environ.get("STDB_DB") or "dispatch-ledger"

    try:
        days = stdb_sql(stdb_uri, db, "SELECT * FROM business_day WHERE id = 1")
        holds = stdb_sql(stdb_uri, db, "SELECT * FROM hold")
    except requests.RequestException as exc:
        print(f"Could not reach the ledger at {stdb_uri}: {exc}", file=sys.stderr)
        return 2
    if not days:
        print("No business_day row; is the module published?", file=sys.stderr)
        return 2
    current_day = int(days[0].get("day") or 0)
    mirrored_at = datetime.now(timezone.utc).isoformat()
    docs = [hold_to_doc(h, current_day, mirrored_at) for h in holds]
    open_docs = [d for d in docs if d["is_open"]]
    stale = [d for d in open_docs if d["age_bd"] > 2]
    print(f"ledger {stdb_uri} db {db}: day {current_day}, {len(docs)} holds, {len(open_docs)} open, {len(stale)} open more than 2 business days")

    settings = Settings.from_env(dry_run=args.dry_run)
    client = Client(settings, dry_run=args.dry_run, verbose=args.verbose)
    mapping = load_json(MAPPING)
    exists = client.index_exists(HOLDS_INDEX)
    if exists and args.recreate:
        client.delete_index(HOLDS_INDEX)
        exists = False
    if not exists:
        client.create_index(HOLDS_INDEX, mapping)
        print(f"  index {HOLDS_INDEX}: created")
    if not docs:
        print("  no holds to mirror")
        return 0
    ok, errors = client.bulk(HOLDS_INDEX, docs, chunk_size=500)
    print(f"  {HOLDS_INDEX}: indexed {ok} docs" + (f" ({len(errors)} errors; first: {json.dumps(errors[0])[:300]})" if errors else ""))
    client.refresh(HOLDS_INDEX)
    total = client.count(HOLDS_INDEX)
    if total is not None:
        print(f"  {HOLDS_INDEX}: {total} docs in index")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
