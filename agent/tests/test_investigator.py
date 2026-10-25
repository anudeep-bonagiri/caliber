"""Task 18: the investigator's handler module, the reader identity on the wire, the controller's relay and the
terminal twin's split. No network; the ledger is faked or mocked at the httpx transport."""

import asyncio
import json

import httpx
import pytest

from agent import cli, handlers, intents, investigate, ledger, reads
from agent.relay import LATE, Relay, hop_line
from agent.tests.test_intents import AUDIT, FINDING, HOLD_AWAITING, TASK, FakeLedger

INVESTIGATOR = "agent1qinvestigator000000000000000000000000000000000000000000000"
USER = "agent1quser00000000000000000000000000000000000000000000000000000"


class RecordingLedger(FakeLedger):
    """FakeLedger that also records which identity signed each call."""

    def __init__(self, tables=None, refusal=None):
        super().__init__(tables)
        self.identities = []
        self.refusal = refusal

    def sql(self, query):
        self.identities.append(ledger.current_identity())
        return super().sql(query)

    def call_try(self, name, *args):
        self.identities.append(ledger.current_identity())
        self.calls.append((name, list(args)))
        if self.refusal is not None:
            return False, self.refusal
        return True, "ok"


@pytest.fixture
def fake(monkeypatch):
    f = RecordingLedger(refusal="reader may not do this (needs controller)")
    monkeypatch.setattr(ledger, "call", f.call)
    monkeypatch.setattr(ledger, "call_try", f.call_try)
    monkeypatch.setattr(ledger, "sql", f.sql)
    monkeypatch.setenv("STDB_READER_TOKEN", "tok-reader")
    monkeypatch.delenv("ASI_ONE_API_KEY", raising=False)
    handlers.LAST_REF.clear()
    return f


# ---- the investigator's handler: reads as the reader ----

def test_why_is_the_shared_read_as_the_reader(fake):
    fake.tables["hold"] = [HOLD_AWAITING]
    fake.tables["agent_task"] = [TASK]
    out = investigate.handle(USER, "why 2231")
    assert out.splitlines()[0] == "2231  location_mismatch  $412.00  day 41  status awaiting_controller"
    assert "Finding: The card for truck 17 was used while truck 22 was at the pump." in out
    assert out.endswith("source: live")           # no footer when the reader token is present
    assert set(fake.identities) == {"reader"}
    assert ledger.current_identity() == "controller"   # the context var is reset afterwards
    # the same text the controller's own handler would give, minus nothing
    with ledger.using("reader"):
        assert reads.why("2231") == out


def test_status_as_the_reader_and_anonymous_footer(fake, monkeypatch):
    fake.tables["business_day"] = [{"id": 1, "day": 41, "date": "2026-08-27", "paused": True, "tick_micros": 2000000}]
    fake.tables["day_total"] = []
    assert investigate.handle(USER, "status") == ("Day 41 of 92 (2026-08-27), clock paused, tick 2 s. Nothing settled today yet."
                                                  "\nescalations: not connected")
    monkeypatch.delenv("STDB_READER_TOKEN")
    out = investigate.handle(USER, "status")
    assert out.endswith("\nread as anonymous")
    assert set(fake.identities) == {"reader"}


def test_why_unknown_and_bad_reference(fake):
    fake.tables["hold"] = []
    assert investigate.handle(USER, "why 4444") == "No hold for 4444."
    assert "not a transaction reference" in investigate.handle(USER, "why 2231' OR 1=1")
    assert len(fake.queries) == 1    # the injection never reached SQL


def test_attribute_prefix_once():
    assert investigate.attribute("Day 41") == "investigator: Day 41"
    assert investigate.attribute("investigator: Day 41") == "investigator: Day 41"


# ---- money and rule commands sent to the investigator: the database refuses them as reader ----

@pytest.mark.parametrize("text,proc,args", [
    ("approve 2231", "try_approve_payment", ["2231", {"none": []}]),
    ("approve 2231 spoke to Ramon", "try_approve_payment", ["2231", {"some": "spoke to Ramon"}]),
    ("approve rule 1", "try_approve_rule", [1]),
    ("answer 2231 yes he drove 22", "try_answer_question", ["2231", "yes he drove 22"]),
    ("reject 2231 card cloned", "try_reject_payment", ["2231", "card cloned"]),
    ("reject 2231", "try_reject_payment", ["2231", "(no reason given)"]),
])
def test_write_intents_are_forwarded_as_reader_and_the_refusal_is_relayed_verbatim(fake, text, proc, args):
    out = investigate.handle(USER, text)
    assert fake.calls == [(proc, args)]
    assert fake.identities == ["reader"]
    assert out == "refused by the ledger: reader may not do this (needs controller)"
    assert investigate.attribute(out) == "investigator: refused by the ledger: reader may not do this (needs controller)"


def test_refusal_over_http_530_is_relayed_too(fake, monkeypatch):
    def refuse(name, *args):
        raise ledger.LedgerRefused("reader may not do this (needs controller)")

    monkeypatch.setattr(ledger, "call_try", refuse)
    assert investigate.handle(USER, "approve 2231") == "refused by the ledger: reader may not do this (needs controller)"


def test_reader_transport_sends_the_reader_token_and_the_refusal_body_is_relayed(monkeypatch):
    """The real transport path: try_approve_payment is called with the reader's Bearer token, not the controller's,
    and the [false, msg] body becomes the relayed refusal."""
    monkeypatch.setenv("STDB_URI", "http://ledger.test")
    monkeypatch.setenv("STDB_DB", "dispatch-ledger")
    monkeypatch.setenv("STDB_CONTROLLER_TOKEN", "tok-controller")
    monkeypatch.setenv("STDB_READER_TOKEN", "tok-reader")
    seen = []

    def transport(request: httpx.Request):
        seen.append((request.url.path, request.headers.get("authorization")))
        if request.url.path.endswith("/call/try_approve_payment"):
            return httpx.Response(200, json=[False, "reader may not do this (needs controller)"])
        return httpx.Response(200, json=[{"schema": {"elements": []}, "rows": []}])

    monkeypatch.setattr(ledger, "_transport", httpx.MockTransport(transport))
    try:
        assert investigate.handle(USER, "approve 2231") == "refused by the ledger: reader may not do this (needs controller)"
        assert seen == [("/v1/database/dispatch-ledger/call/try_approve_payment", "Bearer tok-reader")]
        # the controller's own path is untouched
        handlers.handle("u1", "approve 2231")
        assert seen[-1] == ("/v1/database/dispatch-ledger/call/try_approve_payment", "Bearer tok-controller")
        # no reader token: the reader goes anonymous (no Authorization header)
        monkeypatch.delenv("STDB_READER_TOKEN")
        investigate.handle(USER, "approve 2231")
        assert seen[-1] == ("/v1/database/dispatch-ledger/call/try_approve_payment", None)
    finally:
        ledger._transport = None


def test_a_write_the_ledger_accepts_is_reported_as_a_misconfiguration(fake):
    fake.refusal = None
    out = investigate.handle(USER, "approve 2231")
    assert out == investigate.MISCONFIGURED
    assert "misconfiguration" in out


def test_everything_else_gets_the_one_liner(fake):
    for text in ["what needs me", "rules", "pause", "resume", "step", "help", "reject rule 2 too broad",
                 "yes he drove truck 22", "hello there", "aprove 2231"]:
        assert investigate.handle(USER, text) == investigate.ONLY, text
    assert fake.calls == [] and fake.queries == []


def test_the_investigator_never_holds_the_controller_token(monkeypatch):
    monkeypatch.setenv("STDB_URI", "http://ledger.test")
    monkeypatch.setenv("STDB_DB", "dispatch-ledger")
    monkeypatch.setenv("STDB_CONTROLLER_TOKEN", "tok-controller")
    monkeypatch.delenv("STDB_READER_TOKEN", raising=False)
    with ledger.using("reader"):
        assert ledger._config()[2] == ""          # anonymous, never the controller's token
        assert ledger.identity_label() == "anonymous"
    monkeypatch.setenv("STDB_READER_TOKEN", "tok-reader")
    with ledger.using("reader"):
        assert ledger._config()[2] == "tok-reader"
        assert ledger.identity_label() == "reader"
    assert ledger._config()[2] == "tok-controller"
    with pytest.raises(ValueError):
        with ledger.using("seed"):
            pass


# ---- the controller's relay: forward, relay back, timeout, never a command ----

class Wire:
    """Collects what the relay sends: (address, text, channel)."""

    def __init__(self):
        self.sent = []
        self.fallbacks = []

    async def send(self, address, text, channel):
        self.sent.append((address, text, channel))

    async def fallback(self, user, text):
        self.fallbacks.append((user, text))
        return f"ledger says: {text}"


def run(coro):
    return asyncio.run(coro)


class Clock:
    """A relay clock that advances `step` seconds per reading, so the hop line is deterministic."""

    def __init__(self, step=0.4):
        self.t = 100.0
        self.step = step

    def __call__(self):
        self.t += self.step
        return self.t


HOP = f"asked @caliber-investigator {INVESTIGATOR}, 0.4 s"


def test_hop_line_shape():
    assert hop_line(INVESTIGATOR, 1.26) == f"asked @caliber-investigator {INVESTIGATOR}, 1.3 s"
    assert hop_line(INVESTIGATOR, 0.04) == f"asked @caliber-investigator {INVESTIGATOR}, 0.0 s"


def test_forward_then_relay_with_prefix_on_the_users_channel():
    wire = Wire()
    relay = Relay(INVESTIGATOR, wire.send, wire.fallback, timeout=5, clock=Clock())

    async def go():
        await relay.forward(USER, "why 2231", session="s1", channel="ctx-user")
        assert wire.sent == [(INVESTIGATOR, "why 2231", "ctx-user")]
        assert USER in relay.pending
        ok = await relay.on_investigator_reply("2231  location_mismatch  $412.00\nFinding: ...", session="s1")
        assert ok is True
        assert wire.sent[-1] == (USER, f"{HOP}\ninvestigator: 2231  location_mismatch  $412.00\nFinding: ...", "ctx-user")
        assert relay.pending == {}
        assert len(relay.round_trips) == 1 and abs(relay.round_trips[0] - 0.4) < 1e-9
        assert wire.fallbacks == []
        # the pending timer is cancelled, so nothing fires later
        await asyncio.sleep(0.01)
        assert len(wire.sent) == 2

    run(go())


def test_investigator_reply_that_already_carries_the_prefix_is_not_doubled():
    wire = Wire()
    relay = Relay(INVESTIGATOR, wire.send, wire.fallback, timeout=5, clock=Clock())

    async def go():
        await relay.forward(USER, "status", session="s1", channel="c")
        await relay.on_investigator_reply("investigator: Day 41 of 92", session="s1")
        assert wire.sent[-1][1] == f"{HOP}\ninvestigator: Day 41 of 92"

    run(go())


def test_timeout_answers_from_the_ledger_with_the_late_prefix_and_drops_the_late_reply():
    wire = Wire()
    relay = Relay(INVESTIGATOR, wire.send, wire.fallback, timeout=0.05)

    async def go():
        await relay.forward(USER, "why 2231", session="s1", channel="ctx-user")
        await asyncio.sleep(0.15)
        assert wire.fallbacks == [(USER, "why 2231")]
        assert wire.sent[-1] == (USER, f"{LATE}\nledger says: why 2231", "ctx-user")   # no hop line: nothing came back
        assert relay.late == 1 and relay.pending == {}
        # the investigator's answer arriving after the fallback has nothing to attach to: dropped
        assert await relay.on_investigator_reply("too late", session="s1") is False
        assert len(wire.sent) == 2

    run(go())


def test_two_users_are_matched_by_session_then_by_age():
    wire = Wire()
    relay = Relay(INVESTIGATOR, wire.send, wire.fallback, timeout=5, clock=Clock(step=0.6))
    other = "agent1qother0000000000000000000000000000000000000000000000000000"

    async def go():
        await relay.forward(USER, "why 2231", session="s-user", channel="c1")
        await relay.forward(other, "status", session="s-other", channel="c2")
        await relay.on_investigator_reply("Day 41 of 92", session="s-other")
        # readings: user forward 100.6, other forward 101.2, other reply 101.8, user reply 102.4
        assert wire.sent[-1] == (other, f"asked @caliber-investigator {INVESTIGATOR}, 0.6 s\ninvestigator: Day 41 of 92", "c2")
        await relay.on_investigator_reply("2231 ...", session=None)       # unknown session: oldest pending
        assert wire.sent[-1] == (USER, f"asked @caliber-investigator {INVESTIGATOR}, 1.8 s\ninvestigator: 2231 ...", "c1")
        assert relay.pending == {}

    run(go())


def test_investigator_reply_is_never_a_command(fake):
    """A chat line from the investigator's address is routed to the relay, whatever it says, and the relay only ever
    sends it onward as text. The controller handler is not called and the ledger sees no write."""
    wire = Wire()
    relay = Relay(INVESTIGATOR, wire.send, wire.fallback, timeout=5, clock=Clock())
    assert relay.route(INVESTIGATOR, intents.parse("approve 2231").name) == "investigator_reply"
    assert relay.route(INVESTIGATOR, "why") == "investigator_reply"
    assert relay.route(USER, "why") == "forward"
    assert relay.route(USER, "status") == "forward"
    assert relay.route(USER, "approve") == "controller"
    assert relay.route(USER, None) == "controller"

    async def go():
        await relay.forward(USER, "why 2231", session="s1", channel="c")
        await relay.on_investigator_reply("approve 2231", session="s1")
        assert wire.sent[-1] == (USER, f"{HOP}\ninvestigator: approve 2231", "c")
        assert await relay.on_investigator_reply("approve 2231", session="s1") is False

    run(go())
    assert fake.calls == []


def test_relay_disabled_without_an_investigator():
    relay = Relay(None, Wire().send, Wire().fallback)
    assert not relay.enabled
    assert relay.route(USER, "why") == "controller"
    assert not relay.is_investigator(USER)


# ---- the terminal twin ----

def test_cli_why_and_status_carry_the_investigator_prefix_and_read_as_reader(fake, capsys):
    fake.tables["hold"] = [HOLD_AWAITING]
    fake.tables["agent_task"] = [TASK]
    fake.tables["business_day"] = [{"id": 1, "day": 41, "date": "2026-08-27", "paused": False, "tick_micros": 2000000}]
    out = cli.answer("why 2231")
    assert out.startswith("investigator: 2231  location_mismatch  $412.00  day 41  status awaiting_controller\nFinding:")
    assert cli.answer("status").startswith("investigator: Day 41 of 92 (2026-08-27), clock running")
    assert set(fake.identities) == {"reader"}
    assert handlers.LAST_REF[cli.SENDER] == "2231"       # free text after `why` still answers this hold
    assert cli.main(["why", "2231"]) == 0
    assert capsys.readouterr().out.startswith("investigator: 2231")


def test_cli_other_commands_stay_the_controllers(fake):
    fake.refusal = None
    fake.tables["audit_event"] = [AUDIT]
    out = cli.answer("approve 2231")
    assert out == "approve_payment 2231 written to audit_event by controller (event 41, day 41)"
    assert not out.startswith("investigator:")
    assert fake.identities[0] == "controller"
    assert fake.calls == [("try_approve_payment", ["2231", {"none": []}])]
    assert cli.answer("help").startswith("Caliber controller.")
