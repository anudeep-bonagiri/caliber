"""The two read-only answers both agents share: `why <id>` and `status`.

Factored out of handlers.py for Task 18 so the controller seat and the investigator run the same code.
Nothing here writes. Which identity signs the SQL is whatever `ledger.using(...)` is in effect: the
controller by default, the `reader` (or anonymous) inside the investigator.
"""

from __future__ import annotations

from . import formatting as fmt
from . import ledger

TOTAL_DAYS = 92


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
    return prefix + fmt.format_status(day, total, TOTAL_DAYS)
