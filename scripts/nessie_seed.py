#!/usr/bin/env python3
"""Create the Nessie (Capital One mock bank) accounts settlement pays from and to.

Usage: python scripts/nessie_seed.py

One customer and Checking account for the carrier ("Dispatch Ledger Carrier", large balance), one payee
account per vendor in seed/fixtures/vendors.json, and one "fuel and tolls" payee account for card and toll
payments. Idempotent: when seed/fixtures/nessie_accounts.json exists, every id in it is checked against the
bank and only missing accounts are created. Writes that file as
{carrierAccountId, fuelTollsAccountId, vendors: {"<vendorId>": accountId}}.

Needs NESSIE_API_KEY (environment or the repo-root .env; the environment wins). NESSIE_BASE defaults to
https://api.nessieisreal.com. The key is sent as the `key` query parameter and is never printed.
"""
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENV = ROOT / ".env"
VENDORS = ROOT / "seed" / "fixtures" / "vendors.json"
OUT = ROOT / "seed" / "fixtures" / "nessie_accounts.json"
DEFAULT_BASE = "https://api.nessieisreal.com"
CARRIER_BALANCE = 10_000_000
ADDRESS = {"street_number": "1", "street_name": "UTSA Circle", "city": "San Antonio", "state": "TX", "zip": "78249"}


def read_env() -> dict:
    out = {}
    if ENV.exists():
        for line in ENV.read_text().splitlines():
            if "=" in line and not line.strip().startswith("#"):
                k, v = line.split("=", 1)
                out[k.strip()] = v.strip().strip('"').strip("'")
    return out


class Nessie:
    def __init__(self, base: str, key: str):
        self.base = base.rstrip("/")
        self.key = key

    def _scrub(self, s: str) -> str:
        return s.replace(self.key, "***")

    def _call(self, method: str, path: str, body=None):
        url = f"{self.base}{path}?{urllib.parse.urlencode({'key': self.key})}"
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(url, data=data, method=method, headers={"Content-Type": "application/json", "Accept": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                text = r.read().decode()
                return r.status, (json.loads(text) if text else None)
        except urllib.error.HTTPError as e:
            return e.code, self._scrub(e.read().decode(errors="replace")[:300])
        except urllib.error.URLError as e:
            raise SystemExit(f"cannot reach {self.base}: {self._scrub(str(e.reason))}")

    def account_exists(self, account_id: str) -> bool:
        status, _ = self._call("GET", f"/accounts/{urllib.parse.quote(account_id)}")
        return status == 200

    def _created_id(self, status: int, body, what: str) -> str:
        if status not in (200, 201) or not isinstance(body, dict):
            raise SystemExit(f"creating {what} failed: HTTP {status} {body if isinstance(body, str) else json.dumps(body)[:300]}")
        inner = body.get("objectCreated") if isinstance(body.get("objectCreated"), dict) else body
        cid = inner.get("_id") or inner.get("id")
        if not isinstance(cid, str) or not cid:
            raise SystemExit(f"creating {what}: no id in the response {json.dumps(body)[:300]}")
        return cid

    def create_account(self, first: str, last: str, nickname: str, balance: int) -> str:
        status, body = self._call("POST", "/customers", {"first_name": first, "last_name": last, "address": ADDRESS})
        customer = self._created_id(status, body, f"customer {first} {last}")
        status, body = self._call(
            "POST",
            f"/customers/{urllib.parse.quote(customer)}/accounts",
            {"type": "Checking", "nickname": nickname, "rewards": 0, "balance": balance},
        )
        return self._created_id(status, body, f"account {nickname}")


def main() -> int:
    env = {**read_env(), **os.environ}
    key = env.get("NESSIE_API_KEY", "").strip()
    if not key:
        print("NESSIE_API_KEY is not set (environment or .env); nothing created.", file=sys.stderr)
        return 2
    base = env.get("NESSIE_BASE", "").strip() or DEFAULT_BASE
    bank = Nessie(base, key)
    vendors = json.loads(VENDORS.read_text())
    prior = json.loads(OUT.read_text()) if OUT.exists() else {}
    prior_vendors = prior.get("vendors") or {}
    created, reused = [], []

    def ensure(label: str, existing, first: str, last: str, nickname: str, balance: int) -> str:
        if isinstance(existing, str) and existing and bank.account_exists(existing):
            reused.append(f"{label}: {existing}")
            return existing
        account = bank.create_account(first, last, nickname, balance)
        created.append(f"{label}: {account}")
        return account

    carrier = ensure("carrier", prior.get("carrierAccountId"), "Dispatch Ledger", "Carrier", "Dispatch Ledger Carrier", CARRIER_BALANCE)
    fuel = ensure("fuel and tolls payee", prior.get("fuelTollsAccountId"), "Fuel and Tolls", "Payee", "fuel and tolls", 0)
    vendor_accounts = {}
    for v in sorted(vendors, key=lambda v: v["id"]):
        vid = str(v["id"])
        vendor_accounts[vid] = ensure(f"vendor {vid} ({v['name']})", prior_vendors.get(vid), v["name"], f"Vendor {vid}", f"payee {v['name']}", 0)

    OUT.write_text(json.dumps({"carrierAccountId": carrier, "fuelTollsAccountId": fuel, "vendors": vendor_accounts}, indent=2) + "\n")
    print(f"Nessie at {base}")
    for line in created:
        print(f"  created {line}")
    for line in reused:
        print(f"  reused  {line}")
    print(f"wrote {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
