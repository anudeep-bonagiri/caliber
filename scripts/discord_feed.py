#!/usr/bin/env python3
"""Caliber chat feed (Task 32): Discord and Slack, outbound only.

Polls the ledger's public `audit_event` table and posts each new row, formatted as one plain English
line, to every incoming webhook that is set: DISCORD_WEBHOOK_URL and SLACK_WEBHOOK_URL in .env. It
reads with `agent.ledger.sql` as the read-only `reader` identity and formats money with
`agent.formatting.dollars`. It never calls a reducer, never writes to the ledger, never reads a
private table and never moves money. Approving or answering from Discord or Slack is not built: the
channels are read-only mirrors of the audit table.

    agent/.venv/bin/python scripts/discord_feed.py               # poll every 2 s, post rows newer than start
    agent/.venv/bin/python scripts/discord_feed.py --backfill 20  # also post the last 20 rows once on start

Limits: Discord one post per 2 s, 429 with retry_after in the JSON body, 1,900 characters per message;
Slack one post per second, 429 with a Retry-After header, 3,900 characters per message. With neither
URL set the script prints one labelled line and exits 0. The URLs are never printed or logged; errors
show only the HTTP status or the exception class.
"""

from __future__ import annotations

import argparse
import json
import re
import signal
import sys
import time
from datetime import datetime
from pathlib import Path

import httpx
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
load_dotenv(ROOT / ".env")   # the same file agent/ledger.py loads

import os  # noqa: E402  (after load_dotenv so the URL is read from .env)

from agent import formatting as fmt  # noqa: E402
from agent import ledger  # noqa: E402

USERNAME = "Caliber (simulated carrier)"
TOTAL_DAYS = 92
POST_TIMEOUT = 8.0
DETAIL_MAX = 160
CLOSED_HOLD = {"released", "rejected", "cleared_by_rule"}
IDENTITY_HEX = re.compile(r"^[0-9a-f]{64}$")
INVESTIGATION = re.compile(r"^(\S+) (\S+) \((.*)\)$")
RECOMMENDATION = {"clear": "recommends release", "hold": "hold", "hold_and_ask": "hold and ask",
                  "timeout": "timed out", "done": "done"}


def now() -> str:
    return datetime.now().strftime("%H:%M:%S")


def say(text: str) -> None:
    print(f"{now()} {text}", flush=True)


# ---- reads (all as the reader identity; each one is a public table) ----

class Lookups:
    """Per-poll joins against the public hold, match_result, rule and agent_task tables."""

    def __init__(self) -> None:
        self.cache: dict[tuple[str, str], dict | None] = {}

    def _one(self, table: str, where: str) -> dict | None:
        key = (table, where)
        if key not in self.cache:
            try:
                rows = ledger.sql(f"SELECT * FROM {table} WHERE {where}")
            except ledger.LedgerError:
                rows = []
            self.cache[key] = rows[0] if rows else None
        return self.cache[key]

    def by_txn(self, table: str, ref: str) -> dict | None:
        try:
            return self._one(table, f"txn_ref = {ledger.quote(ref)}")
        except ledger.BadReference:
            return None

    def by_id(self, table: str, ref: str) -> dict | None:
        if not re.fullmatch(r"\d{1,12}", ref or ""):
            return None
        return self._one(table, f"id = {int(ref)}")


# ---- the formatter: one English line per audit row ----

def clip(value, limit: int = DETAIL_MAX) -> str:
    s = " ".join(str(value or "").split())
    return s if len(s) <= limit else s[: limit - 3] + "..."


def short_ref(ref: str) -> str:
    return ref[:16] if IDENTITY_HEX.match(ref or "") else ref


def money_from(row: dict | None) -> str | None:
    if row is None or row.get("cents") is None:
        return None
    return fmt.dollars(row.get("cents"))


def with_money(parts: list[str], amount: str | None) -> list[str]:
    return parts + [amount] if amount else parts


def format_row(row: dict, look: Lookups) -> str:
    action = str(row.get("action") or "")
    ref = str(row.get("ref") or "")
    detail = str(row.get("detail") or "")
    role = str(row.get("actor_role") or "unknown")
    day = f"day {row.get('day')}"

    if action == "hold":
        amount = money_from(look.by_txn("hold", ref))
        return ", ".join(with_money([f"hold {ref} opened: {detail or 'held'}"], amount) + [day])
    if action == "hold_recoded":
        return f"hold {ref} recoded: {clip(detail)}, {day}"
    if action == "auto_pay":
        m = re.match(r"^(-?\d+) cents$", detail)
        amount = fmt.dollars(m.group(1)) if m else money_from(look.by_txn("match_result", ref))
        return ", ".join(with_money([f"auto-paid {ref}"], amount) + [day])
    if action == "cleared_by_rule":
        amount = money_from(look.by_txn("match_result", ref))
        return ", ".join(with_money([f"cleared {ref} by {detail or 'rule'}"], amount) + [day])
    if action == "auto_reject":
        amount = money_from(look.by_txn("match_result", ref))
        return ", ".join(with_money([f"rejected {ref}: {clip(detail).replace('duplicate_toll of', 'duplicate toll of')}"], amount) + [day])
    if action in ("record_investigation", "claim_task"):
        task = look.by_id("agent_task", ref)
        kind = "vendor check" if (task or {}).get("kind") == "vendor_check" else "investigation"
        if action == "claim_task":
            return f"{kind} {detail or '?'} claimed by {role} (task {ref}), {day}"
        m = INVESTIGATION.match(detail)
        txn, rec, source = (m.group(1), m.group(2), m.group(3)) if m else (detail, "", "")
        finding = fmt.parse_json((task or {}).get("finding_json"))
        label = fmt.source_label(task, finding) if task else ("replayed" if source == "replayed" else source or "unknown")
        text = f"{kind} {txn} ({label}): {RECOMMENDATION.get(rec, rec or 'recorded')}."
        question = finding.get("question_for_controller")
        if question and rec in ("hold_and_ask", "hold", "clear"):
            text += f" {clip(question)}"
        return text
    if action == "approve_payment":
        amount = money_from(look.by_txn("hold", ref))
        text = ", ".join(with_money([f"approve_payment {ref} by {role}"], amount) + [day])
        return text + (f" (call-back note: {clip(detail)})" if detail else "")
    if action == "reject_payment":
        amount = money_from(look.by_txn("hold", ref))
        return ", ".join(with_money([f"reject_payment {ref} by {role}"], amount) + [day]) + f": {clip(detail)}"
    if action == "settle":
        tag = " (replay, no bank call)" if "bank id offline-" in detail else ""
        return f"settled {ref}: {clip(detail)}{tag}, {day}"
    if action == "refused":
        return f"refused: {short_ref(ref)} by {role} ({clip(detail)})"
    if action == "seat_refused":
        sender = detail.split("not authorised for this seat:", 1)[-1].strip()
        return f"seat refused: write from {sender[:16] or 'unknown sender'} (not on the sender allowlist), {day}"
    if action in ("create_rule", "approve_rule", "reject_rule"):
        rule = look.by_id("rule", ref)
        scope = (rule or {}).get("scope_json") or ""
        window = f"days {rule['valid_from_day']} to {rule['valid_to_day']}" if rule else ""
        if action == "create_rule":
            source = f" from {rule['source_txn_ref']}" if rule and rule.get("source_txn_ref") else ""
            backtest = detail.split("; ", 1)[1] if "; " in detail else ""
            parts = [f"rule {ref} drafted{source} by {role}"] + ([f"scope {clip(scope, 80)}"] if scope else []) \
                + ([window] if window else []) + ([clip(backtest, 80)] if backtest else [])
            return ", ".join(parts) if (scope or window) else f"rule {ref} drafted by {role}: {clip(detail)}"
        if action == "approve_rule":
            parts = [f"rule {ref} approved by {role}"] + ([f"scope {clip(scope, 80)}"] if scope else []) + ([window] if window else [])
            return ", ".join(parts) if (scope or window) else f"rule {ref} approved by {role}: {clip(detail)}"
        return f"rule {ref} rejected by {role}: {clip(detail) or 'no reason given'}"
    if action == "answer_question":
        return f"answer on {ref} by {role}, {day}: {clip(detail)}"
    if action == "set_clock":
        verb = "paused" if detail == "paused" else "resumed" if detail == "running" else f"clock {clip(detail)}"
        return f"{verb} by {role}, {day}"
    if action == "set_tick":
        m = re.match(r"^(\d+) us$", detail)
        tick = f"{int(m.group(1)) / 1_000_000:g} s" if m else clip(detail)
        return f"clock tick set to {tick} by {role}, {day}"
    if action == "inject":
        return f"injected {ref} by {role}: {clip(detail)}, {day}"
    if action == "ingest":
        return f"ingested {ref}: {clip(detail)}"
    if action == "rematch":
        return f"rematched {ref} by {role}, {day}"
    if action == "vendor_bank_change":
        return f"vendor {ref} bank details changed, {clip(detail) or day}"
    if action == "reset_sim":
        return f"simulation reset to day {clip(detail) or '0'}"
    if action == "grant_role":
        return f"role {clip(detail)} granted to {short_ref(ref)}, {day}"
    if action == "seed":
        return f"seeded {ref}: {clip(detail)}, {day}"
    if action == "init":
        return f"module initialised: {clip(detail)}"
    return f"{action} {short_ref(ref)}: {clip(detail)}"


# ---- the webhooks ----

class Target:
    """One outbound webhook. Subclasses fix the payload shape and the service's limits."""

    name = "webhook"
    min_gap = 2.0        # seconds between posts to this webhook
    max_content = 1900   # characters per message

    def __init__(self, url: str) -> None:
        self._url = url                      # kept private; never printed
        self._last = 0.0
        self._client = httpx.Client(timeout=POST_TIMEOUT)

    def payload(self, content: str) -> dict:
        raise NotImplementedError

    def retry_after(self, r: httpx.Response) -> float:
        raise NotImplementedError

    def post(self, content: str) -> bool:
        """One message. At most one post per min_gap seconds; on 429 sleep retry_after then retry once."""
        wait = self.min_gap - (time.monotonic() - self._last)
        if wait > 0:
            time.sleep(wait)
        payload = self.payload(content)
        for attempt in (1, 2):
            try:
                r = self._client.post(self._url, json=payload)
            except httpx.HTTPError as e:
                self._last = time.monotonic()
                say(f"{self.name}: {type(e).__name__}, will keep polling")
                return False
            self._last = time.monotonic()
            if 200 <= r.status_code < 300:
                return True
            if r.status_code == 429 and attempt == 1:
                delay = self.retry_after(r)
                say(f"{self.name}: rate limited, retrying once in {delay:.1f} s")
                time.sleep(min(max(delay, 0.0), 60.0))
                continue
            say(f"{self.name}: HTTP {r.status_code}, will keep polling")
            return False
        return False

    def post_lines(self, lines: list[str]) -> int:
        """Join lines with newlines, split at max_content, post each chunk. Returns chunks posted."""
        limit = self.max_content
        chunks: list[str] = []
        current = ""
        for line in lines:
            line = line if len(line) <= limit else line[: limit - 3] + "..."
            candidate = line if not current else current + "\n" + line
            if len(candidate) > limit:
                chunks.append(current)
                current = line
            else:
                current = candidate
        if current:
            chunks.append(current)
        return sum(1 for c in chunks if self.post(c))


class Discord(Target):
    """Discord incoming webhook: 2,000 characters, retry_after as seconds in the 429 JSON body."""

    name = "discord"
    min_gap = 2.0
    max_content = 1900

    def payload(self, content: str) -> dict:
        return {"username": USERNAME, "content": content, "allowed_mentions": {"parse": []}}

    def retry_after(self, r: httpx.Response) -> float:
        try:
            return float(r.json().get("retry_after", 1.0))
        except (ValueError, AttributeError):
            return 1.0


class Slack(Target):
    """Slack incoming webhook: {"text": ...}, about 4,000 characters, Retry-After header in seconds.
    Slack reads &, < and > as markup, so they are escaped the way its docs ask."""

    name = "slack"
    min_gap = 1.0
    max_content = 3900

    def payload(self, content: str) -> dict:
        text = content.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        return {"text": text}

    def retry_after(self, r: httpx.Response) -> float:
        try:
            return float(r.headers.get("Retry-After", "1"))
        except ValueError:
            return 1.0


def targets_from_env() -> list[Target]:
    out: list[Target] = []
    discord = (os.getenv("DISCORD_WEBHOOK_URL") or "").strip()
    slack = (os.getenv("SLACK_WEBHOOK_URL") or "").strip()
    if discord:
        out.append(Discord(discord))
    if slack:
        out.append(Slack(slack))
    return out


# ---- the loop ----

def read_audit() -> list[dict]:
    return ledger.sql("SELECT * FROM audit_event")


def connected_line() -> str:
    days = ledger.sql("SELECT * FROM business_day WHERE id = 1")
    day = days[0].get("day") if days else "?"
    holds = ledger.sql("SELECT * FROM hold")
    open_count = sum(1 for h in holds if h.get("status") not in CLOSED_HOLD)
    return f"Caliber feed connected: day {day} of {TOTAL_DAYS}, {open_count} open holds (simulated carrier)"


def run(targets: list[Target], interval: float, backfill: int) -> int:
    seen: set[int] = set()
    # start: wait for the ledger, announce, remember what is already there
    warned = False
    while True:
        try:
            with ledger.using("reader"):
                rows = read_audit()
                hello = connected_line()
                reader = ledger.identity_label()
            break
        except ledger.LedgerError as e:
            if not warned:
                say(f"ledger: {e}; retrying every {interval:g} s")
                warned = True
            time.sleep(interval)
    rows.sort(key=lambda r: int(r.get("id") or 0))
    seen.update(int(r.get("id") or 0) for r in rows)
    names = " and ".join(t.name for t in targets)
    say(f"reading as {reader}; {len(rows)} audit rows on file; posting rows newer than now to {names}")
    for t in targets:
        t.post(hello)
    say(hello)
    if backfill > 0 and rows:
        with ledger.using("reader"):
            look = Lookups()
            lines = [format_row(r, look) for r in rows[-backfill:]]
        for t in targets:
            n = t.post_lines([f"backfill, last {len(lines)} rows:"] + lines)
            say(f"{t.name}: backfilled {len(lines)} row(s) in {n} message(s)")

    while True:
        time.sleep(interval)
        try:
            with ledger.using("reader"):
                rows = read_audit()
                fresh = sorted((r for r in rows if int(r.get("id") or 0) not in seen), key=lambda r: int(r.get("id") or 0))
                if not fresh:
                    continue
                look = Lookups()
                lines = [format_row(r, look) for r in fresh]
        except ledger.LedgerError as e:
            say(f"ledger: {e}; will keep polling")
            continue
        seen.update(int(r.get("id") or 0) for r in fresh)
        for line in lines:
            say(f"row {line}")
        for t in targets:
            n = t.post_lines(lines)
            say(f"{t.name}: posted {len(lines)} line(s) in {n} message(s)")


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Caliber chat feed: posts new audit_event rows to Discord and Slack incoming webhooks. Outbound only.")
    p.add_argument("--interval", type=float, default=2.0, help="seconds between polls (default 2)")
    g = p.add_mutually_exclusive_group()
    g.add_argument("--since-start", action="store_true", default=True, help="post only rows newer than start (default)")
    g.add_argument("--backfill", type=int, default=0, metavar="N", help="also post the last N rows once on start")
    args = p.parse_args(argv)
    if args.interval < 0.5:
        p.error("--interval must be at least 0.5 s")
    if args.backfill < 0:
        p.error("--backfill must be 0 or more")

    targets = targets_from_env()
    if not targets:
        print("neither DISCORD_WEBHOOK_URL nor SLACK_WEBHOOK_URL is set; the feed is off", flush=True)
        return 0

    def stop(*_):
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, stop)
    try:
        return run(targets, args.interval, args.backfill)
    except KeyboardInterrupt:
        say("Caliber feed stopped")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
