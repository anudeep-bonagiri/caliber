"""ASI:One prepends the mention to every message it delivers ("@caliber-controller why 2231",
"@agent1q<58 chars> what needs me"). Leading mentions are stripped at every front door before intent
parsing, so the regex fast paths hit and the controller's relay fires. A mention inside a sentence stays."""

import pytest

from agent import cli, handlers, intents, investigate, ledger
from agent.relay import Relay
from agent.tests.test_intents import HOLD_AWAITING, TASK, FakeLedger

CONTROLLER = "agent1qt278cr9luj7xw9cs6c47lnfl9tvx9xsu7asxtmhuqkcqq920m6ju5y5yge"
INVESTIGATOR = "agent1qvwvlc0vz2amjh4q4yf0p2fglqrzw2rmfm6afrsq82e8lq5df7yyxnrxaqh"
USER = "agent1quser00000000000000000000000000000000000000000000000000000"


class RefusingLedger(FakeLedger):
    def call_try(self, name, *args):
        self.calls.append((name, list(args)))
        return False, "reader may not do this (needs controller)"


@pytest.fixture
def fake(monkeypatch):
    f = FakeLedger()
    monkeypatch.setattr(ledger, "call", f.call)
    monkeypatch.setattr(ledger, "call_try", f.call_try)
    monkeypatch.setattr(ledger, "sql", f.sql)
    monkeypatch.setenv("STDB_READER_TOKEN", "tok-reader")
    monkeypatch.delenv("ASI_ONE_API_KEY", raising=False)
    handlers.LAST_REF.clear()
    return f


# ---- the strip itself ----

@pytest.mark.parametrize("text,expected", [
    ("@caliber-controller why 2231", "why 2231"),
    ("@caliber-controller what needs me", "what needs me"),
    (f"@{CONTROLLER} what needs me", "what needs me"),
    (f"@{INVESTIGATOR} approve 2231", "approve 2231"),
    ("@caliber-controller   status", "status"),
    ("@caliber-controller @caliber-investigator status", "status"),          # two mentions
    ("  @caliber-controller rules  ", "rules"),
    ("@caliber-controller answer 2231 Yes. Ortiz drove unit 22 that week.", "answer 2231 Yes. Ortiz drove unit 22 that week."),
    ("@caliber-controller", ""),                                               # a bare mention is an empty line
])
def test_leading_mentions_are_stripped(text, expected):
    assert intents.strip_mentions(text) == expected


@pytest.mark.parametrize("text", [
    "why 2231",
    "tell @caliber-controller the swap log is wrong",
    "answer 2231 ask @dispatch about unit 22",
    "email me at ops@carrier.example",
    "",
])
def test_mentions_inside_a_sentence_and_plain_lines_are_untouched(text):
    assert intents.strip_mentions(text) == text.strip()


@pytest.mark.parametrize("text,name,ref", [
    ("@caliber-controller why 2231", "why", "2231"),
    ("@caliber-controller what needs me", "holds", None),
    (f"@{CONTROLLER} what needs me", "holds", None),
    ("@caliber-controller status", "status", None),
    ("@caliber-controller approve rule 1", "approve_rule", "1"),
    ("@caliber-controller approve 2231", "approve", "2231"),
])
def test_stripped_line_hits_the_regex_fast_path(text, name, ref):
    it = intents.parse(intents.strip_mentions(text))
    assert it is not None and it.name == name and it.ref == ref and it.via == "regex"


def test_without_the_strip_the_mention_misses_every_fast_path():
    # The defect: the raw line is free text, so the controller answered `why` locally without the relay.
    assert intents.parse("@caliber-controller why 2231") is None
    assert intents.parse(f"@{CONTROLLER} what needs me") is None


# ---- the controller's relay fires on the stripped line ----

def test_relay_routes_a_mentioned_why_to_the_investigator():
    relay = Relay(INVESTIGATOR, send=None, fallback=None)
    it = intents.parse(intents.strip_mentions("@caliber-controller why 2231"))
    assert relay.route(USER, it.name if it else None) == "forward"
    it = intents.parse(intents.strip_mentions(f"@{CONTROLLER} status"))
    assert relay.route(USER, it.name if it else None) == "forward"
    it = intents.parse(intents.strip_mentions("@caliber-controller what needs me"))
    assert relay.route(USER, it.name if it else None) == "controller"


# ---- the controller's handler ----

def test_controller_handler_strips_the_mention_before_dispatch(fake):
    fake.tables["hold"] = [HOLD_AWAITING]
    out = handlers.handle(USER, f"@{CONTROLLER} what needs me")
    assert out.startswith("Needs you (1):")
    assert "2231" in out


def test_controller_handler_bare_mention_is_help(fake):
    assert handlers.handle(USER, "@caliber-controller") == handlers.fmt.HELP


def test_controller_free_text_after_a_mention_is_the_answer_without_the_mention(fake):
    fake.tables["hold"] = [HOLD_AWAITING]
    handlers.LAST_REF[USER] = "2231"
    handlers.handle(USER, "@caliber-controller Yes. Ortiz drove unit 22 that week.")
    assert fake.calls[-1] == ("try_answer_question", ["2231", "Yes. Ortiz drove unit 22 that week."])


# ---- the investigator's handler ----

def test_investigator_answers_a_mentioned_why(fake):
    fake.tables["hold"] = [HOLD_AWAITING]
    fake.tables["agent_task"] = [TASK]
    out = investigate.handle(USER, f"@{INVESTIGATOR} why 2231")
    assert out.splitlines()[0].startswith("2231  location_mismatch")
    assert "Finding:" in out


def test_investigator_forwards_a_mentioned_approve_so_the_ledger_refuses_it(monkeypatch):
    f = RefusingLedger()
    monkeypatch.setattr(ledger, "call_try", f.call_try)
    monkeypatch.setattr(ledger, "sql", f.sql)
    monkeypatch.setenv("STDB_READER_TOKEN", "tok-reader")
    out = investigate.handle(USER, f"@{INVESTIGATOR} approve 2231")
    assert out == "refused by the ledger: reader may not do this (needs controller)"
    assert f.calls == [("try_approve_payment", ["2231", {"none": []}])]


def test_investigator_one_liner_for_a_bare_mention(fake):
    assert investigate.handle(USER, "@caliber-investigator") == investigate.ONLY


# ---- the terminal twin ----

def test_cli_strips_the_mention_and_keeps_the_investigator_prefix(fake):
    fake.tables["hold"] = [HOLD_AWAITING]
    fake.tables["agent_task"] = [TASK]
    out = cli.answer("@caliber-controller why 2231")
    assert out.startswith("investigator: 2231  location_mismatch")
    assert handlers.LAST_REF[cli.SENDER] == "2231"


def test_cli_strips_the_mention_on_a_controller_command(fake):
    fake.tables["hold"] = [HOLD_AWAITING]
    assert cli.answer("@caliber-controller what needs me").startswith("Needs you (1):")
