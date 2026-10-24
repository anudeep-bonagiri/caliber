"""Turns one chat line into an Intent: regex fast paths first, then one ASI:One call for free text.

Nothing here touches the database. The handler validates references before any SQL.

ASI_MOCK=1 (set by agent/conftest.py for the test run) replaces the one HTTP call with a deterministic canned
classification, so no test can reach asi1.ai even when ASI_ONE_API_KEY is in .env.
"""

from __future__ import annotations

import difflib
import json
import os
import re
from dataclasses import dataclass

import httpx

ASI_URL = "https://api.asi1.ai/v1/chat/completions"
ASI_MODEL = os.getenv("ASI_ONE_MODEL", "asi1-mini")
ASI_TIMEOUT = 8.0
MAX_CLASSIFY_CHARS = 2000   # cap on the user text sent to the classifier

INTENTS = {
    "holds", "why", "answer", "approve_rule", "reject_rule", "approve", "reject",
    "rules", "status", "pause", "resume", "step", "help",
}


@dataclass
class Intent:
    name: str
    ref: str | None = None      # txnRef, or the rule id for *_rule intents (unvalidated text)
    text: str | None = None     # answer text, call-back note or reason
    via: str = "regex"          # regex | model | fallback


_TRAIL = r"[\s?.!]*$"

FAST: list[tuple[re.Pattern, str]] = [
    (re.compile(r"^(?:help|\?|commands|menu)" + _TRAIL, re.I), "help"),
    (re.compile(r"^(?:what\s+needs\s+me|needs\s+me|holds?|queue|what'?s\s+waiting|anything\s+for\s+me)" + _TRAIL, re.I), "holds"),
    (re.compile(r"^(?:status|day|clock)" + _TRAIL, re.I), "status"),
    (re.compile(r"^(?:pause|stop\s+the\s+clock|pause\s+the\s+clock)" + _TRAIL, re.I), "pause"),
    (re.compile(r"^(?:resume|unpause|run|start\s+the\s+clock|resume\s+the\s+clock)" + _TRAIL, re.I), "resume"),
    (re.compile(r"^(?:step|step\s+day|next\s+day|advance)" + _TRAIL, re.I), "step"),
    (re.compile(r"^(?:rules?|rule\s+board|show\s+rules)" + _TRAIL, re.I), "rules"),
]

WHY = re.compile(r"^why\s+(?:is\s+|hold\s+)?(.+?)" + _TRAIL, re.I)
ANSWER = re.compile(r"^answer\s+(\S+)\s+(.+)$", re.I | re.S)
APPROVE_RULE = re.compile(r"^approve\s+rule\s+#?(.+?)" + _TRAIL, re.I)
REJECT_RULE = re.compile(r"^reject\s+rule\s+#?(\S+)(?:\s+(.+))?$", re.I | re.S)
APPROVE = re.compile(r"^approve\s+(?:hold\s+|payment\s+)?(\S+)(?:\s+(.+))?$", re.I | re.S)
REJECT = re.compile(r"^reject\s+(?:hold\s+|payment\s+)?(\S+)(?:\s+(.+))?$", re.I | re.S)


def _clean(s: str | None) -> str | None:
    if s is None:
        return None
    s = s.strip()
    return s or None


def parse(text: str) -> Intent | None:
    """The regex fast paths. Returns None when the line is free text."""
    t = (text or "").strip()
    if not t:
        return Intent("help")
    for pattern, name in FAST:
        if pattern.match(t):
            return Intent(name)
    if m := APPROVE_RULE.match(t):
        return Intent("approve_rule", ref=m.group(1))
    if m := REJECT_RULE.match(t):
        return Intent("reject_rule", ref=m.group(1), text=_clean(m.group(2)))
    if m := ANSWER.match(t):
        return Intent("answer", ref=m.group(1), text=_clean(m.group(2)))
    if m := WHY.match(t):
        return Intent("why", ref=m.group(1).strip())
    if m := APPROVE.match(t):
        return Intent("approve", ref=m.group(1), text=_clean(m.group(2)))
    if m := REJECT.match(t):
        return Intent("reject", ref=m.group(1), text=_clean(m.group(2)))
    return None


# ---- command look-alikes ----

COMMAND_WORDS = ("approve", "reject", "why", "answer", "rules", "status", "pause", "resume", "step", "help")


def looks_like_command(text: str) -> bool:
    """True when an unparsed line starts like a command ("approve" with no ref, "aprove 2231", "rejected").

    Such a line is a mistyped command, never free text, so it must not become the answer to a hold.
    """
    words = (text or "").strip().lower().split(maxsplit=1)
    if not words:
        return False
    word = re.sub(r"[^a-z]+$", "", words[0])
    if not word:
        return False
    if any(word.startswith(c) for c in COMMAND_WORDS):
        return True
    return bool(difflib.get_close_matches(word, COMMAND_WORDS + ("rule",), n=1, cutoff=0.8))


# ---- free text: one ASI:One call ----

SYSTEM = """You route one message from a trucking fleet controller to exactly one intent for an autonomous accounts-payable clerk.
Intents: holds (list what needs the controller), why (explain one hold), answer (answer the investigator's pending question about one hold), approve (release one payment), reject (refuse one payment), approve_rule, reject_rule, rules (show the rule board), status (day clock), pause, resume, step (advance one day), help.
Rules:
- If the message reads as an answer to one of the pending questions below, the intent is "answer", txnRef is that hold, and text is the controller's message verbatim.
- "approve" and "reject" need the hold's txnRef; text carries a call-back note or reason if present.
- For approve_rule and reject_rule put the rule number in txnRef and any reason in text.
- When nothing fits, use "help".
Reply with strict JSON only, no prose: {"intent": "<intent>", "txnRef": "<ref or null>", "text": "<text or null>"}"""


def _pending_block(awaiting: list[dict]) -> str:
    if not awaiting:
        return "Pending questions: none."
    lines = ["Pending questions:"]
    for h in awaiting:
        lines.append(f"- {h.get('txn_ref')} ({h.get('code')}): {str(h.get('question') or '').strip()[:300]}")
    return "\n".join(lines)


# The canned reply the mock returns: a status request, which the handler can always serve.
MOCK_REPLY = '{"intent": "status", "txnRef": null, "text": null}'


def mock_enabled() -> bool:
    return os.getenv("ASI_MOCK", "") == "1"


def _chat_completion(api_key: str, messages: list[dict]) -> str:
    if mock_enabled():
        return MOCK_REPLY
    r = httpx.post(
        ASI_URL,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={"model": ASI_MODEL, "temperature": 0, "messages": messages},
        timeout=ASI_TIMEOUT,
    )
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"]


def _extract_json(raw: str) -> dict:
    s = (raw or "").strip()
    s = re.sub(r"^```(?:json)?\s*|\s*```$", "", s, flags=re.I | re.S)
    try:
        data = json.loads(s)
        return data if isinstance(data, dict) else {}
    except ValueError:
        pass
    m = re.search(r"\{.*\}", s, re.S)
    if m:
        try:
            data = json.loads(m.group(0))
            return data if isinstance(data, dict) else {}
        except ValueError:
            return {}
    return {}


def classify(text: str, awaiting: list[dict], api_key: str | None = None) -> Intent | None:
    """One model call. Returns None when the key is missing or the call fails or returns junk."""
    api_key = api_key or os.getenv("ASI_ONE_API_KEY")
    if not api_key:
        return None
    try:
        raw = _chat_completion(api_key, [
            {"role": "system", "content": SYSTEM + "\n\n" + _pending_block(awaiting)},
            {"role": "user", "content": (text or "")[:MAX_CLASSIFY_CHARS]},
        ])
    except Exception:
        return None
    data = _extract_json(raw)
    name = str(data.get("intent") or "").strip().lower()
    if name not in INTENTS:
        return None
    ref = data.get("txnRef")
    ref = str(ref).strip() if ref not in (None, "", "null") else None
    body = data.get("text")
    body = str(body).strip() if body not in (None, "", "null") else None
    if name == "answer" and not body:
        body = text
    return Intent(name, ref=ref, text=body, via="model")
