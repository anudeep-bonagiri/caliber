"""The investigator's handler: `handle(sender_id, text) -> str`, shared by agent/investigator.py, the
controller's relay fallback and the terminal twin (agent/cli.py).

The investigator is read-only by database role, not by prompt. It answers `why <id>` and `status` from the
public tables and the stored finding as the `reader` identity (anonymous when STDB_READER_TOKEN is absent,
and the reply footer says so). A money or rule command sent to it is not filtered here: it is forwarded to the
matching `try_*` procedure with the reader's own token, so the database refuses it, writes the refusal to
audit_event with actor_role reader, and the reply shows that message verbatim. Anything else gets one line.
"""

from __future__ import annotations

from . import intents, ledger, reads
from .ledger import BadReference, LedgerError, LedgerRefused

PREFIX = "investigator:"
ONLY = "I answer why <id> and status; ask the controller agent."
MISCONFIGURED = (
    "the ledger accepted a write from the investigator identity. That is a misconfiguration (the reader token "
    "is not a reader); stop and check STDB_READER_TOKEN."
)

# Money and rule intents the investigator forwards so the refusal is the database's, on the record.
FORWARDED = {
    "approve": ("try_approve_payment", lambda it: [it.ref, ledger.opt(it.text)]),
    "approve_rule": ("try_approve_rule", lambda it: [ledger.check_rule_id(it.ref or "")]),
    "answer": ("try_answer_question", lambda it: [it.ref, it.text or "(no answer text)"]),
    "reject": ("try_reject_payment", lambda it: [it.ref, it.text or "(no reason given)"]),
}


def attribute(text: str) -> str:
    """Prefix a reply with the investigator's name unless it already carries it."""
    return text if text.startswith(PREFIX) else f"{PREFIX} {text}"


def answers(intent: intents.Intent | None) -> bool:
    """True when the investigator answers this intent itself (the two read intents)."""
    return intent is not None and intent.name in ("why", "status")


def handle(sender_id: str, text: str) -> str:
    """Un-prefixed reply text. Front doors call attribute() on it."""
    text = (text or "").strip()
    it = intents.parse(text)
    if it is None:
        return ONLY
    try:
        with ledger.using("reader"):
            if it.name == "why":
                return _footer(reads.why(ledger.check_txn_ref(it.ref or "")))
            if it.name == "status":
                return _footer(reads.status())
            if it.name in FORWARDED:
                return _forward(it)
    except BadReference as e:
        return str(e)
    except LedgerError as e:
        return f"Ledger error: {e}"
    return ONLY


def _footer(reply: str) -> str:
    label = ledger.identity_label()
    return reply if label == "reader" else f"{reply}\nread as {label}"


def _forward(it: intents.Intent) -> str:
    name, build = FORWARDED[it.name]
    if it.name != "approve_rule":
        it.ref = ledger.check_txn_ref(it.ref or "")
    args = build(it)
    try:
        ok, message = ledger.call_try(name, *args)
    except LedgerRefused as e:
        return f"refused by the ledger: {e}"
    if ok:
        return MISCONFIGURED
    return f"refused by the ledger: {message}"
