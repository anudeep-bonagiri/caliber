#!/usr/bin/env python3
"""Mint the agent, controller and reader identities and grant their roles.

Usage: python scripts/mint_identities.py [--uri http://127.0.0.1:3100] [--db dispatch-ledger]

The seed token must already be in .env (STDB_SEED_TOKEN); it is the identity the module was
published with, which init() made the `seed` role. Writes STDB_AGENT_*, STDB_CONTROLLER_* and
STDB_READER_* into .env. Agent and controller are minted fresh on every run (demo_up.sh relies on
that after a wiped publish). The reader (the investigator agent's read-only identity, Task 18) is
reused when .env already has STDB_READER_TOKEN and STDB_READER_IDENTITY: the existing identity is
granted `reader` again, so the investigator's token survives a re-publish. This script is the only
thing that writes .env.
"""
import argparse
import json
import os
import secrets
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENV = ROOT / ".env"


def read_env() -> dict:
    out = {}
    if ENV.exists():
        for line in ENV.read_text().splitlines():
            if "=" in line and not line.strip().startswith("#"):
                k, v = line.split("=", 1)
                out[k.strip()] = v.strip()
    return out


def write_env(values: dict) -> None:
    lines = ENV.read_text().splitlines() if ENV.exists() else []
    seen = set()
    for i, line in enumerate(lines):
        if "=" in line and not line.strip().startswith("#"):
            k = line.split("=", 1)[0].strip()
            if k in values:
                lines[i] = f"{k}={values[k]}"
                seen.add(k)
    for k, v in values.items():
        if k not in seen:
            lines.append(f"{k}={v}")
    ENV.write_text("\n".join(lines) + "\n")


def post(url: str, body: bytes | None, token: str | None = None, content_type: str | None = None):
    req = urllib.request.Request(url, data=body, method="POST")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    if content_type:
        req.add_header("Content-Type", content_type)
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--uri", default=os.environ.get("STDB_URI", "http://127.0.0.1:3100"))
    ap.add_argument("--db", default=os.environ.get("STDB_DB", "dispatch-ledger"))
    args = ap.parse_args()
    env = read_env()
    seed_token = env.get("STDB_SEED_TOKEN") or os.environ.get("STDB_SEED_TOKEN")
    if not seed_token:
        print("STDB_SEED_TOKEN missing from .env; run scripts/demo_up.sh or spacetime login show --token", file=sys.stderr)
        return 2

    def mint() -> tuple[str, str] | None:
        status, text = post(f"{args.uri}/v1/identity", None)
        if status != 200:
            print(f"identity mint failed: {status} {text}", file=sys.stderr)
            return None
        ident = json.loads(text)
        return ident["identity"], ident["token"]

    def grant(hexid: str, role: str) -> bool:
        body = json.dumps([{"__identity__": f"0x{hexid}"}, role]).encode()
        status, text = post(f"{args.uri}/v1/database/{args.db}/call/grant_role", body, seed_token, "application/json")
        if status != 200:
            print(f"grant_role {role} failed: {status} {text}", file=sys.stderr)
            return False
        return True

    values = {}
    for role in ("agent", "controller", "reader"):
        reused = False
        if role == "reader" and env.get("STDB_READER_TOKEN") and env.get("STDB_READER_IDENTITY"):
            hexid, token = env["STDB_READER_IDENTITY"], env["STDB_READER_TOKEN"]
            reused = True
        else:
            minted = mint()
            if minted is None:
                return 1
            hexid, token = minted
        if not grant(hexid, role):
            return 1
        values[f"STDB_{role.upper()}_IDENTITY"] = hexid
        values[f"STDB_{role.upper()}_TOKEN"] = token
        print(f"{role}: {hexid}{' (reused from .env, role granted again)' if reused else ''}")
    values["STDB_URI"] = args.uri
    values["STDB_DB"] = args.db
    # The investigator agent's seed fixes its Agentverse address. Generated once, never printed, never changed.
    if not env.get("INVESTIGATOR_SEED"):
        values["INVESTIGATOR_SEED"] = secrets.token_hex(32)
        print("INVESTIGATOR_SEED: generated (not shown)")
    write_env(values)
    print(f"wrote {ENV}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
