"""Task 28 item 3: the seat's sender allowlist. Writes only for senders in ASI_ALLOWED_SENDERS; anyone else gets
exactly "not authorised for this seat" before any write call, and the refusal is recorded with one call to
try_record_seat_refusal; reads stay open to everyone. The ledger is mocked at the httpx transport, so a refused
write is proven to send nothing but that record."""

import json

import httpx
import pytest

from agent import handlers, ledger
from agent.relay import Relay
from agent.tests.test_intents import AUDIT, HOLD_AWAITING

ALLOWED = "agent1qallowed0000000000000000000000000000000000000000000000000000"
STRANGER = "agent1qstranger000000000000000000000000000000000000000000000000000"
INVESTIGATOR = "agent1qinvestigator000000000000000000000000000000000000000000000"

WRITES = [
    "answer 2231 yes, Ortiz drove unit 22 that week",
    "approve 2231 called Ramon on the number on file",
    "approve 2231",
    "reject 2231 card was cloned",
    "approve rule 1",
    "reject rule 1 too broad",
    "pause",
    "resume",
    "step",
]
READS = ["what needs me", "why 2231", "status", "rules", "help"]


@pytest.fixture
def wire(monkeypatch):
    """Every HTTP request the ledger client makes, as (path, body text)."""
    seen = []

    def transport(request):
        seen.append((request.url.path, request.content.decode()))
        if "/call/try_" in request.url.path:
            return httpx.Response(200, json=[True, "ok"])
        q = request.content.decode()
        if "FROM hold" in q:
            names = list(HOLD_AWAITING)
            return httpx.Response(200, json=[{"schema": {"elements": [{"name": {"some": n}, "algebraic_type": {"String": []}} for n in names]},
                                              "rows": [[HOLD_AWAITING[n] if HOLD_AWAITING[n] is not None else "" for n in names]]}])
        if "FROM audit_event" in q:
            names = list(AUDIT)
            return httpx.Response(200, json=[{"schema": {"elements": [{"name": {"some": n}, "algebraic_type": {"String": []}} for n in names]},
                                              "rows": [[str(AUDIT[n]) for n in names]]}])
        return httpx.Response(200, json=[{"schema": {"elements": []}, "rows": []}])

    monkeypatch.setenv("STDB_URI", "http://ledger.test")
    monkeypatch.setenv("STDB_DB", "dispatch-ledger")
    monkeypatch.setenv("STDB_CONTROLLER_TOKEN", "tok-controller")
    monkeypatch.setenv("ASI_ALLOWED_SENDERS", f" {ALLOWED} , agent1qsecond0000000000000000000000000000000000000000000000000000000")
    monkeypatch.delenv("ASI_ONE_API_KEY", raising=False)
    monkeypatch.setattr(ledger, "_transport", httpx.MockTransport(transport))
    handlers.LAST_REF.clear()
    return seen


RECORD = "try_record_seat_refusal"


def seat(sender, text, logged=None):
    """What agent.py's on_chat does for a line routed to the controller: the recorder is handlers.seat_refusal."""
    logged = [] if logged is None else logged
    return handlers.handle(sender, text, handlers.may_write(sender), handlers.seat_refusal(sender, logged.append))


def recorded_only(seen, sender):
    """Exactly one HTTP request, to try_record_seat_refusal, carrying the full sender and nothing else."""
    assert [path.rsplit("/", 1)[-1] for path, _ in seen] == [RECORD]
    assert json.loads(seen[0][1]) == [sender]
    return True


def writes(seen):
    return [path.rsplit("/", 1)[-1] for path, _ in seen if "/call/" in path]


def test_allowlist_parses_the_comma_separated_variable(wire):
    assert handlers.allowed_senders() == {ALLOWED, "agent1qsecond0000000000000000000000000000000000000000000000000000000"}
    assert handlers.may_write(ALLOWED) and not handlers.may_write(STRANGER)
    assert not handlers.may_write("")


@pytest.mark.parametrize("text,proc", [
    ("answer 2231 yes, Ortiz drove unit 22 that week", "try_answer_question"),
    ("approve 2231 called Ramon on the number on file", "try_approve_payment"),
    ("reject 2231 card was cloned", "try_reject_payment"),
    ("approve rule 1", "try_approve_rule"),
    ("reject rule 1 too broad", "try_reject_rule"),
    ("pause", "try_set_clock"),
    ("resume", "try_set_clock"),
    ("step", "try_step_day"),
])
def test_allowed_sender_writes(wire, text, proc):
    logged = []
    out = seat(ALLOWED, text, logged)
    assert writes(wire) == [proc]       # and no try_record_seat_refusal
    assert handlers.NOT_AUTHORISED not in out
    assert logged == []


@pytest.mark.parametrize("text", WRITES)
def test_unknown_sender_is_refused_with_the_exact_text_and_only_the_refusal_reaches_the_ledger(wire, text):
    logged = []
    assert seat(STRANGER, text, logged) == "not authorised for this seat"
    assert recorded_only(wire, STRANGER)   # no SQL, no write procedure: one audit record of the refusal
    assert len(logged) == 1                # the seat logs it with the full sender address
    assert logged[0].endswith(f" from {STRANGER}: not authorised for this seat (not in ASI_ALLOWED_SENDERS)")


def test_free_text_that_would_become_an_answer_is_refused_for_a_stranger(wire):
    handlers.LAST_REF[STRANGER] = "2231"
    assert seat(STRANGER, "yes he drove truck 22 that week") == "not authorised for this seat"
    assert writes(wire) == [RECORD]
    handlers.LAST_REF[ALLOWED] = "2231"
    seat(ALLOWED, "yes he drove truck 22 that week")
    assert writes(wire) == [RECORD, "try_answer_question"]


@pytest.mark.parametrize("sender", [ALLOWED, STRANGER])
@pytest.mark.parametrize("text", READS)
def test_reads_work_for_both(wire, sender, text):
    out = seat(sender, text)
    assert handlers.NOT_AUTHORISED not in out
    assert writes(wire) == []
    assert out


def test_why_and_status_are_forwarded_to_the_investigator_for_anyone():
    relay = Relay(INVESTIGATOR, None, None)
    for sender in (ALLOWED, STRANGER):
        assert relay.route(sender, "why") == "forward"
        assert relay.route(sender, "status") == "forward"
        assert relay.route(sender, "approve") == "controller"   # then the allowlist decides


def test_empty_allowlist_refuses_everyone_and_says_so(wire, monkeypatch):
    monkeypatch.setenv("ASI_ALLOWED_SENDERS", " , ")
    assert handlers.allowed_senders() == set()
    out = seat(ALLOWED, "approve 2231")
    assert out.splitlines() == ["not authorised for this seat", handlers.NOBODY_ALLOWED]
    assert recorded_only(wire, ALLOWED)
    assert handlers.NOT_AUTHORISED not in seat(ALLOWED, "status")


def test_unset_allowlist_is_the_same_as_empty(wire, monkeypatch):
    monkeypatch.delenv("ASI_ALLOWED_SENDERS")
    assert seat(ALLOWED, "step").startswith("not authorised for this seat")
    assert recorded_only(wire, ALLOWED)


def test_the_terminal_twin_is_not_gated(wire):
    """agent/cli.py calls handle() without may_write: the local operator holds the controller token itself."""
    handlers.handle("cli", "approve rule 1")
    assert writes(wire) == ["try_approve_rule"]


def test_the_refusal_is_recorded_with_the_controller_token(wire, monkeypatch):
    tokens = []

    def transport(request):
        tokens.append(request.headers.get("Authorization"))
        return httpx.Response(200, json=[True, "recorded"])

    monkeypatch.setattr(ledger, "_transport", httpx.MockTransport(transport))
    with ledger.using("reader"):   # even inside a reader context the record is signed as the controller
        seat(STRANGER, "approve 2231")
    assert tokens == ["Bearer tok-controller"]


@pytest.mark.parametrize("failure", [
    lambda request: httpx.Response(200, json=[False, "anonymous may not do this (needs controller)"]),
    lambda request: httpx.Response(500, text="boom"),
    lambda request: (_ for _ in ()).throw(httpx.ConnectError("down")),
])
def test_a_failed_record_is_logged_and_never_changes_the_reply(wire, monkeypatch, failure):
    monkeypatch.setattr(ledger, "_transport", httpx.MockTransport(failure))
    logged = []
    assert seat(STRANGER, "approve 2231", logged) == "not authorised for this seat"
    assert len(logged) == 2
    assert logged[1].startswith(f"seat refusal for {STRANGER} not recorded in audit_event: ")


def test_a_recorder_that_raises_never_changes_the_reply(wire):
    def broken(intent_name):
        raise RuntimeError("logger down")
    assert handlers.handle(STRANGER, "approve 2231", False, broken) == "not authorised for this seat"
