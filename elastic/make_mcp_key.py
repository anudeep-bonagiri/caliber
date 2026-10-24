"""Task 26.1: create the least-privilege API key Droid uses for the Agent Builder MCP endpoint.

    python make_mcp_key.py --dry-run          # print the request, send nothing, write nothing
    python make_mcp_key.py                    # POST /_security/api_key, write ELASTIC_MCP_API_KEY= into .env
    python make_mcp_key.py --name x --no-env  # create only, print the key id (never the key), skip .env
    python make_mcp_key.py --without-kibana-privilege --no-env   # a throwaway key for the 403 proof
    python make_mcp_key.py --invalidate <id>  # DELETE /_security/api_key for a throwaway key

The key named caliber-droid-mcp can read six indices and nothing else in Elasticsearch, and in Kibana it
carries only feature_agentBuilder.read and feature_actions.read on space:default. It cannot write, cannot
create tools, cannot read other indices. The worker puts it in the Authorization header of Droid's MCP
server entry (worker/src/droid.ts); the project-level ELASTIC_API_KEY stays with the setup scripts.

This script is the only thing that writes to .env, and it writes exactly one line: ELASTIC_MCP_API_KEY=...
(appended, or replaced when present). The key value is never printed; the key id is.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

import requests

from common import ENV_FILE, Settings, print_request

KEY_NAME = "caliber-droid-mcp"
ENV_VAR = "ELASTIC_MCP_API_KEY"
READ_INDICES = ["receipts", "contracts", "telematics_log", "invoices", "holds", "escalations"]
KIBANA_PRIVILEGES = ["feature_agentBuilder.read", "feature_actions.read"]


def role_descriptors(with_kibana: bool = True) -> dict[str, Any]:
    role: dict[str, Any] = {
        "cluster": [],
        "indices": [{"names": READ_INDICES, "privileges": ["read", "view_index_metadata"]}],
    }
    if with_kibana:
        role["applications"] = [{
            "application": "kibana-.kibana",
            "privileges": KIBANA_PRIVILEGES,
            "resources": ["space:default"],
        }]
    return {"caliber_droid_mcp": role}


def key_body(name: str, with_kibana: bool = True) -> dict[str, Any]:
    return {
        "name": name,
        "role_descriptors": role_descriptors(with_kibana),
        "metadata": {"owner": "caliber", "purpose": "droid mcp read-only", "task": "26.1"},
    }


def upsert_env_line(env_file: Path, var: str, value: str) -> str:
    """Append `var=value` or replace the one existing line. Returns 'appended' or 'replaced'."""
    lines = env_file.read_text(encoding="utf-8").splitlines() if env_file.exists() else []
    out: list[str] = []
    replaced = False
    for line in lines:
        stripped = line.strip()
        key = stripped[len("export "):] if stripped.startswith("export ") else stripped
        if not replaced and not key.startswith("#") and key.split("=", 1)[0].strip() == var and "=" in key:
            out.append(f"{var}={value}")
            replaced = True
        else:
            out.append(line)
    if not replaced:
        out.append(f"{var}={value}")
    env_file.write_text("\n".join(out) + "\n", encoding="utf-8")
    return "replaced" if replaced else "appended"


def create_key(settings: Settings, body: dict[str, Any], dry_run: bool) -> dict[str, Any] | None:
    url = f"{settings.es_url}/_security/api_key"
    headers = settings.es_headers()
    print_request("POST", url, headers, body, settings.api_key, note="dry-run" if dry_run else "")
    if dry_run:
        return None
    resp = requests.post(url, headers=headers, json=body, timeout=60)
    if not resp.ok:
        print(f"POST /_security/api_key failed: HTTP {resp.status_code} {resp.text[:500]}", file=sys.stderr)
        return None
    return resp.json()


def invalidate_key(settings: Settings, key_id: str, dry_run: bool) -> bool:
    url = f"{settings.es_url}/_security/api_key"
    headers = settings.es_headers()
    body = {"ids": [key_id]}
    print_request("DELETE", url, headers, body, settings.api_key, note="dry-run" if dry_run else "")
    if dry_run:
        return True
    resp = requests.delete(url, headers=headers, json=body, timeout=60)
    if not resp.ok:
        print(f"DELETE /_security/api_key failed: HTTP {resp.status_code} {resp.text[:500]}", file=sys.stderr)
        return False
    data = resp.json()
    print(f"invalidated: {data.get('invalidated_api_keys')}, errors: {data.get('error_count')}")
    return int(data.get("error_count") or 0) == 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--dry-run", action="store_true", help="print the request, send nothing, write nothing")
    p.add_argument("--name", default=KEY_NAME, help=f"API key name (default {KEY_NAME})")
    p.add_argument("--no-env", action="store_true", help="do not write .env; print the key id only")
    p.add_argument("--env-file", type=Path, default=ENV_FILE)
    p.add_argument("--without-kibana-privilege", action="store_true",
                   help="omit the kibana-.kibana application privileges (throwaway key for the 403 proof)")
    p.add_argument("--print-encoded", action="store_true",
                   help="print the encoded key to stdout and nothing else (for a subshell that must never log it)")
    p.add_argument("--invalidate", metavar="KEY_ID", help="invalidate this key id instead of creating one")
    p.add_argument("--write-from-stdin", action="store_true",
                   help="read an encoded key pasted on stdin (created in the Kibana UI) and write only the .env line; "
                        "no network call, nothing echoed")
    args = p.parse_args(argv)

    if args.write_from_stdin:
        encoded = sys.stdin.read().strip()
        if not encoded or any(c.isspace() for c in encoded):
            print("stdin must hold exactly the encoded key, nothing else", file=sys.stderr)
            return 1
        verb = upsert_env_line(args.env_file, ENV_VAR, encoded)
        print(f"{ENV_VAR} {verb} in {args.env_file} ({len(encoded)} chars; value not shown)")
        return 0

    settings = Settings.from_env(dry_run=args.dry_run)

    if args.invalidate:
        return 0 if invalidate_key(settings, args.invalidate, args.dry_run) else 1

    body = key_body(args.name, with_kibana=not args.without_kibana_privilege)
    if args.print_encoded:
        # quiet mode: only the encoded key on stdout, so `$(...)` captures it without any log line
        resp = requests.post(f"{settings.es_url}/_security/api_key", headers=settings.es_headers(), json=body, timeout=60)
        if not resp.ok:
            print(f"HTTP {resp.status_code}", file=sys.stderr)
            return 1
        data = resp.json()
        print(data["encoded"])
        print(f"key id {data['id']}", file=sys.stderr)
        return 0

    data = create_key(settings, body, args.dry_run)
    if args.dry_run:
        print(f"(dry-run) would write {ENV_VAR}=<encoded key> to {args.env_file}" if not args.no_env else "(dry-run) --no-env: nothing written")
        return 0
    if not data:
        return 1
    key_id = data.get("id")
    encoded = data.get("encoded")
    print(f"created API key {args.name!r} id {key_id} (value not shown; {len(encoded or '')} chars)")
    if args.no_env:
        return 0
    verb = upsert_env_line(args.env_file, ENV_VAR, encoded)
    print(f"{ENV_VAR} {verb} in {args.env_file}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
