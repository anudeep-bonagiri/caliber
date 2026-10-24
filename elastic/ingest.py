"""Step 1: create the four indices (idempotent) and bulk-load the seed fixtures.

    python ingest.py --dry-run                         # print every request, send nothing
    python ingest.py                                   # seed/fixtures -> Serverless
    python ingest.py --only telematics_log,receipts --limit 500
    python ingest.py --fixtures elastic/sample         # the 20-row synthetic sample
    python ingest.py --no-semantic                     # skip semantic_text fields (no inference endpoint needed)
    python ingest.py --recreate                        # drop and rebuild the indices first

Fixture layout (docs/CONTRACT.md "Fixture files"), all under --fixtures:
    trip_pings.json | trip_pings.jsonl   truckId, day, at (ISO), lat, lon, odometer, engineOn
    card_txns.json                        id, cardId, truckId, driverId, at, day, stationName, stationLat, stationLon, gallons, cents, merchant
    contracts.json                        id, vendorId, item, rateCents, validFromDay, validToDay, clause
    invoices.json                         id, vendorId, poId, receivedDay, item, qty, unitCents, cents, docRef
    evidence/receipts/<txnRef>.txt, evidence/contracts/<id>.txt, evidence/invoices/<id>.txt
"""

from __future__ import annotations

import argparse
import copy
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable, Iterator

from common import ELASTIC_DIR, REPO_ROOT, Client, Settings, load_json

MAPPINGS_DIR = ELASTIC_DIR / "mappings"
DEFAULT_FIXTURES = REPO_ROOT / "seed" / "fixtures"
INDICES = ("telematics_log", "receipts", "contracts", "invoices")
SEMANTIC_FIELDS = {"receipts": ("body_semantic", "body"), "contracts": ("clause_semantic", "clause")}

_EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)


# ----------------------------------------------------------------------------
# parsing helpers
# ----------------------------------------------------------------------------


def parse_iso(value: str) -> datetime:
    """ISO-8601 to an aware UTC datetime. Accepts a trailing Z, an offset, or no zone (assumed UTC)."""
    text = value.strip()
    if text.endswith("Z") or text.endswith("z"):
        text = text[:-1] + "+00:00"
    dt = datetime.fromisoformat(text)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def iso_to_ms(value: str) -> int:
    """Epoch milliseconds for an ISO-8601 string, exact (no float rounding)."""
    return (parse_iso(value) - _EPOCH) // timedelta(milliseconds=1)


def as_str(value: Any) -> str | None:
    if value is None:
        return None
    return str(value)


def read_rows(base: Path, stem: str) -> list[dict[str, Any]]:
    """Read <stem>.json (array) or <stem>.jsonl (one object per line). Missing file -> []."""
    json_path = base / f"{stem}.json"
    jsonl_path = base / f"{stem}.jsonl"
    if json_path.exists():
        data = load_json(json_path)
        if not isinstance(data, list):
            raise ValueError(f"{json_path} must contain a JSON array")
        return data
    if jsonl_path.exists():
        rows = []
        with jsonl_path.open(encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if line:
                    rows.append(json.loads(line))
        return rows
    return []


def read_text(path: Path) -> str | None:
    if path.exists():
        return path.read_text(encoding="utf-8")
    return None


def evidence_files(base: Path, kind: str) -> dict[str, str]:
    """{stem: text} for every evidence/<kind>/*.txt."""
    folder = base / "evidence" / kind
    if not folder.is_dir():
        return {}
    return {p.stem: p.read_text(encoding="utf-8") for p in sorted(folder.glob("*.txt"))}


# ----------------------------------------------------------------------------
# row -> document transforms
# ----------------------------------------------------------------------------


def ping_to_doc(row: dict[str, Any]) -> dict[str, Any]:
    at = row["at"]
    truck_id = str(row["truckId"])
    doc: dict[str, Any] = {
        "_id": f"{truck_id}-{at}",
        "truck_id": truck_id,
        "day": int(row["day"]) if row.get("day") is not None else None,
        "at": at,
        "at_ms": iso_to_ms(at),
        "location": {"lat": float(row["lat"]), "lon": float(row["lon"])},
        "engine_on": bool(row["engineOn"]) if row.get("engineOn") is not None else None,
        "odometer": float(row["odometer"]) if row.get("odometer") is not None else None,
    }
    return {k: v for k, v in doc.items() if v is not None}


def receipt_to_doc(txn: dict[str, Any] | None, txn_ref: str, body: str | None, semantic: bool) -> dict[str, Any]:
    doc: dict[str, Any] = {"_id": txn_ref, "txn_ref": txn_ref}
    if txn:
        at = txn.get("at")
        doc.update({
            "truck_id": as_str(txn.get("truckId")),
            "driver_id": as_str(txn.get("driverId")),
            "card_id": as_str(txn.get("cardId")),
            "station": txn.get("stationName"),
            "merchant": txn.get("merchant"),
            "at": at,
            "at_ms": iso_to_ms(at) if at else None,
            "day": int(txn["day"]) if txn.get("day") is not None else None,
            "gallons": float(txn["gallons"]) if txn.get("gallons") is not None else None,
            "cents": int(txn["cents"]) if txn.get("cents") is not None else None,
        })
        if txn.get("stationLat") is not None and txn.get("stationLon") is not None:
            doc["station_location"] = {"lat": float(txn["stationLat"]), "lon": float(txn["stationLon"])}
    if body:
        doc["body"] = body
        if semantic:
            doc["body_semantic"] = body
    return {k: v for k, v in doc.items() if v is not None}


def contract_to_doc(row: dict[str, Any], body: str | None, semantic: bool) -> dict[str, Any]:
    contract_id = str(row["id"])
    clause = row.get("clause") or body
    doc: dict[str, Any] = {
        "_id": contract_id,
        "contract_id": contract_id,
        "vendor_id": as_str(row.get("vendorId")),
        "item": row.get("item"),
        "rate_cents": int(row["rateCents"]) if row.get("rateCents") is not None else None,
        "valid_from": int(row["validFromDay"]) if row.get("validFromDay") is not None else None,
        "valid_to": int(row["validToDay"]) if row.get("validToDay") is not None else None,
        "clause": clause,
        "body": body,
    }
    if semantic and clause:
        doc["clause_semantic"] = clause
    return {k: v for k, v in doc.items() if v is not None}


def invoice_to_doc(row: dict[str, Any], body: str | None) -> dict[str, Any]:
    invoice_id = str(row["id"])
    doc: dict[str, Any] = {
        "_id": invoice_id,
        "invoice_id": invoice_id,
        "vendor_id": as_str(row.get("vendorId")),
        "po_id": as_str(row.get("poId")),
        "received_day": int(row["receivedDay"]) if row.get("receivedDay") is not None else None,
        "item": row.get("item"),
        "qty": float(row["qty"]) if row.get("qty") is not None else None,
        "unit_cents": int(row["unitCents"]) if row.get("unitCents") is not None else None,
        "cents": int(row["cents"]) if row.get("cents") is not None else None,
        "doc_ref": as_str(row.get("docRef")),
        "body": body,
    }
    return {k: v for k, v in doc.items() if v is not None}


# ----------------------------------------------------------------------------
# per-index document generators
# ----------------------------------------------------------------------------


def telematics_docs(base: Path) -> Iterator[dict[str, Any]]:
    for row in read_rows(base, "trip_pings"):
        yield ping_to_doc(row)


def receipt_docs(base: Path, semantic: bool) -> Iterator[dict[str, Any]]:
    bodies = evidence_files(base, "receipts")
    txns = {str(t["id"]): t for t in read_rows(base, "card_txns") if t.get("id") is not None}
    for txn_ref, txn in txns.items():
        yield receipt_to_doc(txn, txn_ref, bodies.pop(txn_ref, None), semantic)
    for txn_ref, body in bodies.items():  # receipts with no card_txns row still get indexed
        yield receipt_to_doc(None, txn_ref, body, semantic)


def contract_docs(base: Path, semantic: bool) -> Iterator[dict[str, Any]]:
    bodies = evidence_files(base, "contracts")
    for row in read_rows(base, "contracts"):
        yield contract_to_doc(row, bodies.get(str(row["id"])), semantic)


def invoice_docs(base: Path) -> Iterator[dict[str, Any]]:
    bodies = evidence_files(base, "invoices")
    for row in read_rows(base, "invoices"):
        yield invoice_to_doc(row, bodies.get(str(row["id"])))


def docs_for(index: str, base: Path, semantic: bool) -> Iterator[dict[str, Any]]:
    if index == "telematics_log":
        return telematics_docs(base)
    if index == "receipts":
        return receipt_docs(base, semantic)
    if index == "contracts":
        return contract_docs(base, semantic)
    if index == "invoices":
        return invoice_docs(base)
    raise ValueError(f"unknown index {index}")


# ----------------------------------------------------------------------------
# mappings
# ----------------------------------------------------------------------------


def load_mapping(index: str, semantic: bool, inference_id: str | None) -> dict[str, Any]:
    """Mapping for `index`; semantic_text fields are dropped with semantic=False, or retargeted at inference_id.

    inference_id=None keeps the field but removes the explicit inference_id so the
    cluster's default semantic_text endpoint is used.
    """
    mapping = copy.deepcopy(load_json(MAPPINGS_DIR / f"{index}.json"))
    props = mapping["properties"]
    for name in list(props):
        if props[name].get("type") != "semantic_text":
            continue
        if not semantic:
            del props[name]
        elif inference_id:
            props[name]["inference_id"] = inference_id
        else:
            props[name].pop("inference_id", None)
    return mapping


def ensure_index(client: Client, index: str, semantic: bool, inference_id: str | None, recreate: bool) -> None:
    exists = client.index_exists(index)
    if exists and recreate:
        client.delete_index(index)
        exists = False
    if exists:
        print(f"  index {index}: exists, adding to it (use --recreate to rebuild)")
        return
    client.create_index(index, load_mapping(index, semantic, inference_id))
    print(f"  index {index}: created" + ("" if client.dry_run else ""))


def take(it: Iterable[dict[str, Any]], limit: int | None) -> list[dict[str, Any]]:
    out = []
    for d in it:
        if limit is not None and len(out) >= limit:
            break
        out.append(d)
    return out


# ----------------------------------------------------------------------------
# main
# ----------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--fixtures", type=Path, default=DEFAULT_FIXTURES, help=f"fixture folder (default {DEFAULT_FIXTURES})")
    p.add_argument("--only", default=",".join(INDICES), help="comma list of indices to load")
    p.add_argument("--limit", type=int, default=None, help="max docs per index")
    p.add_argument("--batch", type=int, default=200, help="docs per bulk request (keep modest when embedding)")
    p.add_argument("--recreate", action="store_true", help="delete and recreate the indices first")
    p.add_argument("--no-semantic", action="store_true", help="skip semantic_text fields entirely")
    p.add_argument("--inference-id", default=None, help="semantic_text inference endpoint (default EMBEDDING_INFERENCE_ID or .jina-embeddings-v5-text-small)")
    p.add_argument("--dry-run", action="store_true", help="print every request, send nothing")
    p.add_argument("--verbose", action="store_true", help="print requests even when live")
    args = p.parse_args(argv)

    only = [s.strip() for s in args.only.split(",") if s.strip()]
    bad = [s for s in only if s not in INDICES]
    if bad:
        p.error(f"unknown index {bad}; choose from {', '.join(INDICES)}")

    settings = Settings.from_env(dry_run=args.dry_run)
    client = Client(settings, dry_run=args.dry_run, verbose=args.verbose)
    base: Path = args.fixtures
    if not base.is_dir():
        print(f"Fixture folder {base} does not exist yet (seed/ writes it). Point --fixtures at elastic/sample to test.",
              file=sys.stderr)
        return 2

    semantic = not args.no_semantic
    inference_id: str | None = args.inference_id or settings.inference_id
    if semantic:
        if client.inference_exists(inference_id):
            print(f"semantic_text fields use inference endpoint {inference_id}")
        else:
            print(f"inference endpoint {inference_id} not found; semantic_text fields fall back to the cluster default")
            inference_id = None
    else:
        print("semantic_text fields skipped (--no-semantic)")

    print(f"Preparing indices on {settings.es_url}" + (" [dry-run]" if args.dry_run else ""))
    for index in only:
        ensure_index(client, index, semantic, inference_id, args.recreate)

    print(f"Loading fixtures from {base}")
    failed = False
    for index in only:
        docs = take(docs_for(index, base, semantic), args.limit)
        if not docs:
            print(f"  {index}: no source rows found, skipped")
            continue
        ok, errors = client.bulk(index, docs, chunk_size=args.batch)
        msg = f"  {index}: indexed {ok} docs"
        if errors:
            failed = True
            msg += f" ({len(errors)} errors; first: {json.dumps(errors[0])[:300]})"
        print(msg)
        client.refresh(index)
        total = client.count(index)
        if total is not None:
            print(f"  {index}: {total} docs in index")

    print("Done." if not failed else "Done with errors.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
