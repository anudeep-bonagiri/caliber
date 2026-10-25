"""`handle(sender_id, text) -> str`: the one entry point the uAgent and the CLI share.

Every controller action goes through the module's `try_*` procedures, so a refusal comes back as
`[false, message]` and is kept in audit_event; the reply shows that message verbatim after "Refused: ".

Per sender it remembers the last transaction discussed, so a bare free-text line with no model key
still lands as the answer to the right hold. A line that looks like a mistyped command never does.

Controller text is bounded here, before any network call, with the same limits the module enforces
(docs/CONTRACT.md): answers up to 1000 characters, call-back notes and reasons up to 500, none blank.

The seat on ASI:One is open to anyone who finds it, so every write is gated on the sender (Task 28 item 3):
`may_write=False` refuses any intent in WRITE_INTENTS, including free text that resolves to an answer, with
exactly NOT_AUTHORISED and before any write call. Reads stay open. The uAgent decides `may_write` from
ASI_ALLOWED_SENDERS and passes `seat_refusal(sender, log)`, whose one ledger call is try_record_seat_refusal
(an audit_event row, action seat_refused); the terminal twin holds the controller token itself and always may.
"""

from __future__ import annotations

import os
import unicodedata

from . import formatting as fmt
from . import intents, ledger, reads
from .ledger import BadReference, LedgerError, LedgerRefused

LAST_REF: dict[str, str] = {}   # sender -> last txnRef discussed
TOTAL_DAYS = reads.TOTAL_DAYS

MAX_ANSWER = 1000
MAX_NOTE = 500      # call-back notes, payment rejection reasons, rule rejection reasons

# Every intent that reaches a try_ procedure. Everything else (holds, why, status, rules, help) is a read.
WRITE_INTENTS = {"answer", "approve", "reject", "approve_rule", "reject_rule", "pause", "resume", "step"}
NOT_AUTHORISED = "not authorised for this seat"
NOBODY_ALLOWED = "No ASI:One sender may write to this seat yet: ASI_ALLOWED_SENDERS is empty."


def allowed_senders() -> set[str]:
    """ASI_ALLOWED_SENDERS from .env: comma-separated agent1q... addresses. Empty means nobody may write."""
    return {a.strip() for a in os.getenv("ASI_ALLOWED_SENDERS", "").split(",") if a.strip()}


def may_write(sender_id: str) -> bool:
    return sender_id in allowed_senders()


def not_authorised() -> str:
    """The refusal reply: exactly NOT_AUTHORISED, plus one line saying so when the allowlist is empty."""
    return NOT_AUTHORISED if allowed_senders() else f"{NOT_AUTHORISED}\n{NOBODY_ALLOWED}"


class TextRefused(ValueError):
    """Controller text the module would refuse; reported as "Refused: ..." without calling it."""


def _js_length(text: str) -> int:
    """Length as the module counts it (JavaScript string length, UTF-16 code units)."""
    return len(text.encode("utf-16-le")) // 2


def bound_text(text: str | None, max_len: int, what: str) -> str:
    """Drop control characters other than newline, strip, refuse blank or over-long text."""
    cleaned = "".join(ch for ch in (text or "") if ch == "\n" or unicodedata.category(ch) != "Cc").strip()
    if not cleaned:
        raise TextRefused(f"{what} is empty")
    if _js_length(cleaned) > max_len:
        raise TextRefused(f"{what} is longer than {max_len} characters")
    return cleaned


def seat_refusal(sender_id: str, log):
    """The uAgent's `on_refused`: log the refusal with the full sender, then record it in audit_event through
    try_record_seat_refusal (controller token). A failure to record is logged and never changes the reply."""
    def record(intent_name: str) -> None:
        log(f"refused {intent_name} from {sender_id}: {NOT_AUTHORISED} (not in ASI_ALLOWED_SENDERS)")
        try:
            ledger.record_seat_refusal(sender_id)
        except Exception as e:
            log(f"seat refusal for {sender_id} not recorded in audit_event: {e}")
    return record


def handle(sender_id: str, text: str, may_write: bool = True, on_refused=None) -> str:
    """`on_refused(intent_name)` is called when a write is refused for the sender, after the reply is decided, so
    the seat can log and record it."""
    text = intents.strip_mentions(text)   # ASI:One prepends "@caliber-controller " to every line
    intent = intents.parse(text)
    try:
        if intent is None:
            intent = _free_text(sender_id, text)
        if not may_write and intent.name in WRITE_INTENTS:
            answer = not_authorised()
            if on_refused is not None:
                try:
                    on_refused(intent.name)
                except Exception:   # recording the refusal never changes the reply
                    pass
            return answer
        return _dispatch(sender_id, intent)
    except BadReference as e:
        return str(e)
    except (LedgerRefused, TextRefused) as e:
        return fmt.refused(str(e))
    except LedgerError as e:
        return f"Ledger error: {e}"


# ---- free text ----

def _awaiting() -> list[dict]:
    return ledger.sql("SELECT * FROM hold WHERE status = 'awaiting_controller'")


def _free_text(sender_id: str, text: str) -> intents.Intent:
    if intents.looks_like_command(text):
        return intents.Intent("help")
    awaiting = _awaiting() if os.getenv("ASI_ONE_API_KEY") else []
    intent = intents.classify(text, awaiting)
    if intent is not None:
        if intent.name == "answer" and not intent.ref:
            intent.ref = LAST_REF.get(sender_id) or (awaiting[0]["txn_ref"] if len(awaiting) == 1 else None)
        if intent.name == "answer" and not intent.ref:
            return intents.Intent("help")
        return intent
    last = LAST_REF.get(sender_id)
    if last:
        return intents.Intent("answer", ref=last, text=text, via="fallback")
    return intents.Intent("help")


# ---- dispatch ----

def _dispatch(sender_id: str, it: intents.Intent) -> str:
    name = it.name
    if name == "help":
        return fmt.HELP
    if name == "holds":
        return _holds(sender_id)
    if name == "status":
        return _status()
    if name == "rules":
        return fmt.format_rules(ledger.sql("SELECT * FROM rule"))
    if name == "pause":
        ledger.call_try("try_set_clock", True)
        return _confirm("set_clock", None, "clock paused")
    if name == "resume":
        ledger.call_try("try_set_clock", False)
        return _confirm("set_clock", None, "clock running")
    if name == "step":
        ledger.call_try("try_step_day")
        return _status(prefix="Stepped one day. ")
    if name == "approve_rule":
        rid = ledger.check_rule_id(it.ref or "")
        ledger.call_try("try_approve_rule", rid)
        return _confirm("approve_rule", str(rid))
    if name == "reject_rule":
        rid = ledger.check_rule_id(it.ref or "")
        if not it.text:
            return f"reject rule {rid} needs a reason: reject rule {rid} <reason>"
        ledger.call_try("try_reject_rule", rid, bound_text(it.text, MAX_NOTE, "reason"))
        return _confirm("reject_rule", str(rid))

    ref = ledger.check_txn_ref(it.ref or "")
    LAST_REF[sender_id] = ref
    if name == "why":
        return _why(ref)
    if name == "answer":
        if not it.text:
            return f"answer {ref} needs the text of your answer."
        ledger.call_try("try_answer_question", ref, bound_text(it.text, MAX_ANSWER, "answer"))
        return _confirm("answer_question", ref) + "\nThe worker will draft a rule from this answer; check `rules` shortly."
    if name == "approve":
        note = bound_text(it.text, MAX_NOTE, "call-back note") if it.text else None
        ledger.call_try("try_approve_payment", ref, ledger.opt(note))
        return _confirm("approve_payment", ref)
    if name == "reject":
        if not it.text:
            return f"reject {ref} needs a reason: reject {ref} <reason>"
        ledger.call_try("try_reject_payment", ref, bound_text(it.text, MAX_NOTE, "reason"))
        return _confirm("reject_payment", ref)
    return fmt.HELP


# ---- reads ----

def _holds(sender_id: str) -> str:
    rows = ledger.sql("SELECT * FROM hold WHERE status = 'awaiting_controller' OR status = 'open'")
    awaiting = [h for h in rows if h.get("status") == "awaiting_controller"]
    if len(awaiting) == 1:
        LAST_REF[sender_id] = str(awaiting[0]["txn_ref"])
    return fmt.format_holds(rows)


# `why` and `status` live in reads.py (shared with the investigator agent, Task 18).
_why = reads.why
_status = reads.status


def remember(sender_id: str, ref: str) -> str:
    """Record the hold a sender is discussing (used when `why` is answered by the investigator instead of here),
    so a later free-text line still lands as the answer to the right hold. Validates the reference first."""
    ref = ledger.check_txn_ref(ref)
    LAST_REF[sender_id] = ref
    return ref


def _confirm(action: str, ref: str | None, note: str | None = None) -> str:
    """Echo the audit row the reducer just wrote. Reads only; a failed read still confirms the call."""
    audit = None
    try:
        where = f"action = '{action}'" + (f" AND ref = {ledger.quote(ref)}" if ref else "")
        rows = ledger.sql(f"SELECT * FROM audit_event WHERE {where}")
        if rows:
            audit = max(rows, key=lambda r: int(r.get("id") or 0))
    except (LedgerError, BadReference):
        audit = None
    label = ref if ref else (audit or {}).get("ref") or "clock"
    out = fmt.confirmation(action, label, audit)
    return f"{out}. {note}" if note else out
