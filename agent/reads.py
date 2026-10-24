"""The two read-only answers both agents share: `why <id>` and `status`.

Factored out of handlers.py for Task 18 so the controller seat and the investigator run the same code.
Nothing here writes. Which identity signs the SQL is whatever `ledger.using(...)` is in effect: the
controller by default, the `reader` (or anonymous) inside the investigator.
"""

from __future__ import annotations

import os

import httpx

from . import formatting as fmt
from . import ledger

TOTAL_DAYS = 92

# Task 26.3: the `status` reply ends with one line read from the Elastic `escalations` index that the
# caliber-stale-holds Workflow writes. Read-only, anonymous to the ledger, and never silent: when the Elastic
# variables are unset or the read fails for any reason the line says "escalations: not connected".
ESCALATIONS_INDEX = "escalations"
ESCALATIONS_TIMEOUT = 4.0
NOT_CONNECTED = "escalations: not connected"
_escalations_transport: httpx.BaseTransport | None = None   # tests install a MockTransport here


def _elastic_config() -> tuple[str, str] | None:
    url = (os.getenv("ELASTICSEARCH_URL") or "").rstrip("/")
    key = os.getenv("ELASTIC_MCP_API_KEY") or os.getenv("ELASTIC_API_KEY") or ""
    if not url or not key:
        return None
    return url, key


def escalations_line() -> str:
    """'N escalations, newest: <hold_ref>: <first 80 chars of the brief>' or 'escalations: not connected'."""
    cfg = _elastic_config()
    if cfg is None:
        return NOT_CONNECTED
    url, key = cfg
    body = {"size": 1, "sort": [{"at": {"order": "desc"}}], "_source": ["hold_ref", "brief", "at"],
            "track_total_hits": True}
    try:
        with httpx.Client(timeout=ESCALATIONS_TIMEOUT, transport=_escalations_transport) as client:
            r = client.post(f"{url}/{ESCALATIONS_INDEX}/_search", json=body,
                            headers={"Authorization": f"ApiKey {key}", "Content-Type": "application/json"})
        if r.status_code != 200:
            return NOT_CONNECTED
        payload = r.json()
        hits = payload.get("hits", {})
        total = hits.get("total", {})
        n = int(total.get("value", 0)) if isinstance(total, dict) else int(total or 0)
        rows = hits.get("hits") or []
    except Exception:
        return NOT_CONNECTED
    if n == 0 or not rows:
        return "0 escalations"
    src = rows[0].get("_source") or {}
    ref = str(src.get("hold_ref") or "?")
    brief = " ".join(str(src.get("brief") or "").split())
    text = brief[:80] + ("..." if len(brief) > 80 else "")
    return f"{n} escalation{'s' if n != 1 else ''}, newest: {ref}: {text}"


def why(ref: str) -> str:
    """The hold line, the stored finding with two evidence quotes, the recommendation, the question."""
    holds = ledger.sql(f"SELECT * FROM hold WHERE txn_ref = {ledger.quote(ref)}")
    if not holds:
        return f"No hold for {ref}."
    tasks = ledger.sql(f"SELECT * FROM agent_task WHERE txn_ref = {ledger.quote(ref)}")
    investigate = [t for t in tasks if t.get("kind") == "investigate"]
    task = max(investigate, key=lambda t: int(t.get("id") or 0)) if investigate else None
    return fmt.format_why(holds[0], task)


def status(prefix: str = "") -> str:
    """The business day clock and today's totals."""
    days = ledger.sql("SELECT * FROM business_day WHERE id = 1")
    day = days[0] if days else None
    total = None
    if day is not None:
        n = int(day.get("day") or 0)
        totals = ledger.sql(f"SELECT * FROM day_total WHERE day = {n}")
        total = totals[0] if totals else None
    return prefix + fmt.format_status(day, total, TOTAL_DAYS) + "\n" + escalations_line()
