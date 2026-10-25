"""HTTP client for the Dispatch Ledger SpacetimeDB module. Signs as the controller by default, as the
read-only `reader` inside `ledger.using("reader")` (the investigator agent, Task 18).

Writes go through `try_*` procedures (`call_try`, which report refusals in the body) or reducers
(`call`, which refuse with HTTP 530); reads go through SQL (`sql`). Both are plain HTTP against
`{STDB_URI}/v1/database/{STDB_DB}`; see docs/CONTRACT.md "HTTP API".

Row encodings confirmed against the local SpacetimeDB 2.13 SQL endpoint (2026-10-24):
  option none   -> [1, []]          option some -> [0, value]
  identity      -> ["0x<hex>"]      timestamp   -> [micros_since_unix_epoch]
  i64 / u64     -> JSON numbers
The documented dict forms ({"some": v}, {"__identity__": hex}, {"__timestamp_micros_since_unix_epoch__": n})
are accepted too, so the decoder survives either shape. Decoding is driven by the schema that comes back
with every result, not by guessing from the value.
"""

from __future__ import annotations

import os
import re
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import datetime, timezone
from pathlib import Path

import httpx
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

TIMEOUT = 8.0

TXN_REF = re.compile(r"^[A-Za-z0-9-]{1,24}$")
RULE_ID = re.compile(r"^\d{1,12}$")

INT_TYPES = {"U8", "U16", "U32", "U64", "U128", "U256", "I8", "I16", "I32", "I64", "I128", "I256"}

# Tests replace this with an httpx.MockTransport. None means the real network.
_transport: httpx.BaseTransport | None = None

# Which identity signs the next call. The controller seat is the default. The investigator (Task 18)
# runs its reads and its forwarded refusals as `reader`, whose token is STDB_READER_TOKEN; when that
# token is absent the reader falls back to anonymous (no Authorization header), and the reply says so.
# A context variable so the terminal twin can run both identities in one process without leaking the
# reader's choice into the controller's calls; asyncio.to_thread copies the context.
IDENTITIES = {"controller": "STDB_CONTROLLER_TOKEN", "reader": "STDB_READER_TOKEN"}
_identity: ContextVar[str] = ContextVar("ledger_identity", default="controller")


@contextmanager
def using(identity: str):
    """Run the enclosed calls as `identity` ("controller" or "reader")."""
    if identity not in IDENTITIES:
        raise ValueError(f"unknown ledger identity {identity}")
    token = _identity.set(identity)
    try:
        yield
    finally:
        _identity.reset(token)


def current_identity() -> str:
    return _identity.get()


def identity_label() -> str:
    """What the current identity reads as: "controller", "reader", or "anonymous" when the reader token is absent."""
    ident = _identity.get()
    if ident == "reader" and not os.getenv("STDB_READER_TOKEN"):
        return "anonymous"
    return ident


class LedgerError(RuntimeError):
    """The database could not be reached or returned an unexpected status."""


class LedgerRefused(LedgerError):
    """A reducer threw (HTTP 530). The message is the reducer's own refusal text."""


class BadReference(ValueError):
    """A transaction reference or rule id from chat failed validation. Never reaches SQL."""


# ---- validation of anything that came from chat ----

def check_txn_ref(value: str) -> str:
    value = (value or "").strip()
    if not TXN_REF.match(value):
        raise BadReference(f"'{value[:40]}' is not a transaction reference (letters, digits and dashes, up to 24).")
    return value


def check_rule_id(value: str) -> int:
    value = (value or "").strip().lstrip("#")
    if not RULE_ID.match(value):
        raise BadReference(f"'{value[:40]}' is not a rule id (digits only).")
    return int(value)


def quote(ref: str) -> str:
    """A SQL string literal for an already validated reference."""
    return "'" + check_txn_ref(ref) + "'"


def opt(value):
    """An option argument for a reducer call."""
    return {"none": []} if value is None or value == "" else {"some": value}


# ---- transport ----

def _config() -> tuple[str, str, str]:
    uri = os.getenv("STDB_URI", "").rstrip("/")
    db = os.getenv("STDB_DB", "")
    ident = _identity.get()
    token_env = IDENTITIES[ident]
    token = os.getenv(token_env, "")
    required = [("STDB_URI", uri), ("STDB_DB", db)]
    if ident == "controller":
        required.append((token_env, token))   # the reader may run anonymous; the controller never
    missing = [k for k, v in required if not v]
    if missing:
        raise LedgerError("missing in .env: " + ", ".join(missing))
    return uri, db, token


def _post(path: str, **kwargs) -> httpx.Response:
    uri, db, token = _config()
    headers = {**kwargs.pop("headers", {})}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    url = f"{uri}/v1/database/{db}{path}"
    try:
        with httpx.Client(timeout=TIMEOUT, transport=_transport) as client:
            return client.post(url, headers=headers, **kwargs)
    except httpx.TimeoutException as e:
        raise LedgerError(f"ledger timed out after {TIMEOUT:.0f}s ({path})") from e
    except httpx.HTTPError as e:
        raise LedgerError(f"ledger unreachable at {uri}: {e}") from e


def call(reducer: str, *args) -> None:
    """Call a reducer with positional arguments. Raises LedgerRefused on 530, LedgerError otherwise."""
    r = _post(f"/call/{reducer}", json=list(args), headers={"Content-Type": "application/json"})
    if r.status_code == 200:
        return
    body = r.text.strip()
    if r.status_code == 530:
        raise LedgerRefused(body or "refused without a message")
    if r.status_code in (401, 403):
        raise LedgerError(f"{_identity.get()} token rejected (HTTP {r.status_code})")
    if r.status_code == 404:
        raise LedgerError(f"no such reducer or database: {reducer} (HTTP 404)")
    raise LedgerError(f"{reducer}: HTTP {r.status_code} {body[:200]}")


def call_try(name: str, *args) -> tuple[bool, str]:
    """Call a `try_*` procedure. It answers HTTP 200 with `[true, "ok"]` or `[false, "<refusal>"]` and writes
    every refusal to audit_event as a persistent row. Raises LedgerRefused(message) when ok is false."""
    r = _post(f"/call/{name}", json=list(args), headers={"Content-Type": "application/json"})
    if r.status_code == 530:  # still a reducer-style throw, keep the same handling
        raise LedgerRefused(r.text.strip() or "refused without a message")
    if r.status_code in (401, 403):
        raise LedgerError(f"{_identity.get()} token rejected (HTTP {r.status_code})")
    if r.status_code == 404:
        raise LedgerError(f"no such procedure or database: {name} (HTTP 404)")
    if r.status_code != 200:
        raise LedgerError(f"{name}: HTTP {r.status_code} {r.text.strip()[:200]}")
    try:
        body = r.json()
    except ValueError as e:
        raise LedgerError(f"{name}: non-JSON body {r.text.strip()[:120]}") from e
    if not (isinstance(body, list) and len(body) == 2 and isinstance(body[0], bool)):
        raise LedgerError(f"{name}: unexpected body {str(body)[:120]}")
    ok, message = body[0], str(body[1])
    if not ok:
        raise LedgerRefused(message or "refused without a message")
    return ok, message



def record_seat_refusal(sender: str) -> tuple[bool, str]:
    """Write the ASI:One seat's refusal of `sender` to audit_event (action seat_refused), signed as the controller.
    Records only: try_record_seat_refusal performs nothing else."""
    with using("controller"):
        return call_try("try_record_seat_refusal", sender)

def sql(query: str) -> list[dict]:
    """Run one SQL statement and return rows as dicts keyed by column name, values decoded."""
    r = _post("/sql", content=query.encode(), headers={"Content-Type": "text/plain"})
    if r.status_code != 200:
        raise LedgerError(f"sql: HTTP {r.status_code} {r.text.strip()[:200]}")
    payload = r.json()
    if not payload:
        return []
    result = payload[0]
    elements = result.get("schema", {}).get("elements", [])
    names = [_name(e) for e in elements]
    types = [e.get("algebraic_type") for e in elements]
    return [dict(zip(names, (decode(v, t) for v, t in zip(row, types)))) for row in result.get("rows", [])]


# ---- decoding ----

def _name(element: dict) -> str | None:
    n = element.get("name")
    if isinstance(n, dict):
        return n.get("some")
    return n


def _hex(value) -> str:
    s = str(value)
    return s[2:].lower() if s.lower().startswith("0x") else s.lower()


def _iso(micros) -> str:
    return (
        datetime.fromtimestamp(int(micros) / 1_000_000, tz=timezone.utc)
        .isoformat(timespec="seconds")
        .replace("+00:00", "Z")
    )


def decode(value, atype: dict | None = None):
    """Decode one SQL cell using its algebraic type when given, else by recognizable shape."""
    # Documented dict encodings, accepted regardless of schema.
    if isinstance(value, dict):
        keys = set(value)
        if keys == {"some"}:
            return decode(value["some"], _option_inner(atype))
        if keys == {"none"}:
            return None
        if "__identity__" in value:
            return _hex(value["__identity__"])
        if "__timestamp_micros_since_unix_epoch__" in value:
            return _iso(value["__timestamp_micros_since_unix_epoch__"])
        return value

    if atype:
        if "Sum" in atype:
            variants = atype["Sum"].get("variants", [])
            vnames = [_name(v) for v in variants]
            if isinstance(value, list) and len(value) == 2 and isinstance(value[0], int) and 0 <= value[0] < len(variants):
                tag, payload = value
                if vnames == ["some", "none"]:
                    return None if tag == 1 else decode(payload, variants[0].get("algebraic_type"))
                return {vnames[tag]: decode(payload, variants[tag].get("algebraic_type"))}
        if "Product" in atype:
            elements = atype["Product"].get("elements", [])
            enames = [_name(e) for e in elements]
            if isinstance(value, list) and len(value) == len(elements):
                if enames == ["__identity__"]:
                    return _hex(value[0])
                if enames == ["__timestamp_micros_since_unix_epoch__"]:
                    return _iso(value[0])
                if enames == ["__time_duration_micros__"]:
                    return int(value[0])
                return {n: decode(v, e.get("algebraic_type")) for n, v, e in zip(enames, value, elements)}
        if "Array" in atype and isinstance(value, list):
            return [decode(v, atype["Array"]) for v in value]
        if INT_TYPES & set(atype) and isinstance(value, str) and re.fullmatch(r"-?\d+", value):
            return int(value)
        return value

    # No schema: recognize the positional shapes by eye.
    if isinstance(value, list):
        if len(value) == 2 and value[0] == 1 and value[1] == []:
            return None
        if len(value) == 2 and value[0] == 0:
            return decode(value[1])
        if len(value) == 1 and isinstance(value[0], str) and value[0].lower().startswith("0x"):
            return _hex(value[0])
        if len(value) == 1 and isinstance(value[0], int) and value[0] > 1_000_000_000_000_000:
            return _iso(value[0])
    return value


def _option_inner(atype: dict | None) -> dict | None:
    if atype and "Sum" in atype:
        variants = atype["Sum"].get("variants", [])
        if variants:
            return variants[0].get("algebraic_type")
    return None
