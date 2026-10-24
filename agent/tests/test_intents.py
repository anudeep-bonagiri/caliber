"""Intent parsing and the shared handler with the ledger faked out. No network."""

import json

import pytest

from agent import formatting as fmt
from agent import handlers, intents, ledger


# ---- parse: every fast path ----

@pytest.mark.parametrize("text,name", [
    ("what needs me", "holds"), ("What Needs Me?", "holds"), ("needs me", "holds"), ("holds", "holds"), ("queue", "holds"),
    ("rules", "rules"), ("Rules", "rules"), ("rule board", "rules"),
    ("status", "status"), ("day", "status"), ("STATUS", "status"),
    ("pause", "pause"), ("resume", "resume"), ("step", "step"),
    ("help", "help"), ("", "help"),
])
def test_bare_fast_paths(text, name):
    it = intents.parse(text)
    assert it is not None and it.name == name and it.ref is None


@pytest.mark.parametrize("text,name,ref,body", [
    ("why 2231", "why", "2231", None),
    ("Why INV-1077?", "why", "INV-1077", None),
    ("why hold T1042", "why", "T1042", None),
    ("answer 2231 yes, Ramon drove 22 that day", "answer", "2231", "yes, Ramon drove 22 that day"),
    ("approve rule 1", "approve_rule", "1", None),
    ("Approve Rule #3", "approve_rule", "3", None),
    ("reject rule 2 too broad", "reject_rule", "2", "too broad"),
    ("reject rule 2", "reject_rule", "2", None),
    ("approve 2231", "approve", "2231", None),
    ("approve 2231 spoke to Ramon, confirmed", "approve", "2231", "spoke to Ramon, confirmed"),
    ("approve INV-1077 called Maria at Acme on the number on file", "approve", "INV-1077", "called Maria at Acme on the number on file"),
    ("reject 2231 card was cloned", "reject", "2231", "card was cloned"),
    ("reject 2231", "reject", "2231", None),
])
def test_argument_fast_paths(text, name, ref, body):
    it = intents.parse(text)
    assert it is not None
    assert (it.name, it.ref, it.text) == (name, ref, body)


@pytest.mark.parametrize("text", ["yes he did, truck 17 was in the shop", "the vendor confirmed by phone", "hello there"])
def test_free_text_is_not_a_fast_path(text):
    assert intents.parse(text) is None


# ---- handler with a fake ledger ----

class FakeLedger:
    def __init__(self, tables=None):
        self.tables = tables or {}
        self.calls = []
        self.queries = []

    def call(self, reducer, *args):
        self.calls.append((reducer, list(args)))

    def sql(self, query):
        self.queries.append(query)
        for name, rows in self.tables.items():
            if f"FROM {name}" in query:
                return [dict(r) for r in rows]
        return []


HOLD_AWAITING = {"txn_ref": "2231", "kind": "card", "code": "location_mismatch", "cents": 41200, "day": 41,
                 "status": "awaiting_controller", "question": "Did Ramon Ortiz drive truck 22 on Aug 27?",
                 "answer": None, "callback_note": None, "reason": "kernel: location_mismatch"}
HOLD_OPEN = {"txn_ref": "9901", "kind": "card", "code": "location_mismatch", "cents": 28000, "day": 0,
             "status": "open", "question": None, "answer": None, "callback_note": None, "reason": "kernel: location_mismatch"}
HOLD_BANK = {"txn_ref": "INV-1077", "kind": "invoice", "code": "vendor_bank_change", "cents": 124000, "day": 42,
             "status": "open", "question": None, "answer": None, "callback_note": None, "reason": "kernel: vendor_bank_change"}
FINDING = {"finding": "The card for truck 17 was used while truck 22 was at the pump.",
           "evidence": [{"source": "find_trips_near", "ref": "truck 22 @ 2026-08-27T13:07Z", "quote": "truck_id=22 dist_m=41"},
                        {"source": "swap_log.txt", "ref": "line 14", "quote": "08/27 Ortiz R. -> unit 22 (17 in shop)"},
                        {"source": "third", "ref": "x", "quote": "must not show"}],
           "recommendation": "hold_and_ask", "question_for_controller": "Did Ramon Ortiz drive truck 22 on Aug 27?",
           "confidence": 0.86, "status": "ok"}
TASK = {"id": 3, "txn_ref": "2231", "kind": "investigate", "status": "investigated", "source": "live",
        "finding_json": json.dumps(FINDING)}
AUDIT = {"id": 41, "day": 41, "actor_role": "controller", "action": "approve_payment", "ref": "2231", "detail": ""}


@pytest.fixture
def fake(monkeypatch):
    f = FakeLedger()
    monkeypatch.setattr(ledger, "call", f.call)
    monkeypatch.setattr(ledger, "sql", f.sql)
    monkeypatch.delenv("ASI_ONE_API_KEY", raising=False)
    handlers.LAST_REF.clear()
    return f


def test_holds_lists_awaiting_with_question_and_open_as_investigating(fake):
    fake.tables["hold"] = [HOLD_OPEN, HOLD_AWAITING, HOLD_BANK]
    out = handlers.handle("u1", "what needs me")
    lines = out.splitlines()
    assert lines[0] == "Needs you (2):"
    assert lines[1] == "2231  $412.00  location_mismatch  day 41  Q: Did Ramon Ortiz drive truck 22 on Aug 27?"
    assert lines[2].startswith("INV-1077  $1,240.00  vendor_bank_change  day 42  needs a call-back note")
    assert lines[3] == "Investigating (1):"
    assert lines[4] == "9901  $280.00  location_mismatch  day 0  investigating"
    assert "awaiting_controller" in fake.queries[0] and "'open'" in fake.queries[0]
    assert handlers.LAST_REF["u1"] == "2231"  # the single awaiting hold becomes the default for free text


def test_holds_empty(fake):
    fake.tables["hold"] = []
    assert handlers.handle("u1", "holds") == "Nothing is waiting on you."


def test_why_shows_finding_two_quotes_recommendation_question_source(fake):
    fake.tables["hold"] = [HOLD_AWAITING]
    fake.tables["agent_task"] = [TASK]
    out = handlers.handle("u1", "why 2231")
    assert out.splitlines() == [
        "2231  location_mismatch  $412.00  day 41  status awaiting_controller",
        "Finding: The card for truck 17 was used while truck 22 was at the pump.",
        'Evidence: "truck_id=22 dist_m=41" (find_trips_near, truck 22 @ 2026-08-27T13:07Z)',
        'Evidence: "08/27 Ortiz R. -> unit 22 (17 in shop)" (swap_log.txt, line 14)',
        "Recommendation: hold_and_ask (confidence 0.86)",
        "Question: Did Ramon Ortiz drive truck 22 on Aug 27?",
        "source: live",
    ]
    assert "WHERE txn_ref = '2231'" in fake.queries[0]
    assert handlers.LAST_REF["u1"] == "2231"


def test_why_before_investigation_and_source_labels(fake):
    fake.tables["hold"] = [HOLD_OPEN]
    fake.tables["agent_task"] = [{"id": 1, "txn_ref": "9901", "kind": "investigate", "status": "open", "source": "none", "finding_json": ""}]
    out = handlers.handle("u1", "why 9901")
    assert "Finding: investigation open. Kernel reason: kernel: location_mismatch" in out
    assert out.endswith("source: scripted stand-in")
    replayed = dict(TASK, source="replayed", finding_json=json.dumps(dict(FINDING, status="replayed")))
    assert fmt.format_why(HOLD_AWAITING, replayed).endswith("source: replayed")


def test_why_unknown_hold(fake):
    fake.tables["hold"] = []
    assert handlers.handle("u1", "why 4444") == "No hold for 4444."


def test_injection_in_txn_ref_never_reaches_sql_or_reducers(fake):
    fake.tables["hold"] = [HOLD_AWAITING]
    for text in ["why 2231' OR 1=1", "approve 2231' OR 1=1", "reject 2231'; DROP TABLE hold; because", "answer 2231' yes"]:
        out = handlers.handle("u1", text)
        assert "not a transaction reference" in out, text
    assert fake.queries == []
    assert fake.calls == []


def test_approve_calls_reducer_with_option_note_and_echoes_audit(fake):
    fake.tables["audit_event"] = [dict(AUDIT, id=40, action="hold"), AUDIT]
    out = handlers.handle("u1", "approve 2231")
    assert fake.calls == [("approve_payment", ["2231", {"none": []}])]
    assert out == "approve_payment 2231 written to audit_event by controller (event 41, day 41)"
    assert "action = 'approve_payment' AND ref = '2231'" in fake.queries[-1]

    fake.tables["audit_event"] = [dict(AUDIT, id=42, detail="spoke to Ramon")]
    out = handlers.handle("u1", "approve 2231 spoke to Ramon")
    assert fake.calls[-1] == ("approve_payment", ["2231", {"some": "spoke to Ramon"}])
    assert out == "approve_payment 2231 written to audit_event by controller (event 42, day 41, spoke to Ramon)"


def test_refusal_shows_reducer_message_verbatim(fake, monkeypatch):
    def refuse(reducer, *args):
        raise ledger.LedgerRefused("call-back note required for a bank change")

    monkeypatch.setattr(ledger, "call", refuse)
    assert handlers.handle("u1", "approve INV-1077") == "Refused: call-back note required for a bank change"


def test_ledger_error_is_reported_not_raised(fake, monkeypatch):
    def down(query):
        raise ledger.LedgerError("ledger unreachable at http://127.0.0.1:3100")

    monkeypatch.setattr(ledger, "sql", down)
    assert handlers.handle("u1", "status").startswith("Ledger error: ledger unreachable")


def test_reject_requires_reason(fake):
    assert "needs a reason" in handlers.handle("u1", "reject 2231")
    assert fake.calls == []
    handlers.handle("u1", "reject 2231 card cloned")
    assert fake.calls == [("reject_payment", ["2231", "card cloned"])]


def test_answer_calls_answer_question(fake):
    fake.tables["audit_event"] = [dict(AUDIT, id=50, action="answer_question", detail="yes")]
    out = handlers.handle("u1", "answer 2231 yes he drove 22")
    assert fake.calls == [("answer_question", ["2231", "yes he drove 22"])]
    assert out.startswith("answer_question 2231 written to audit_event by controller (event 50")


def test_rule_intents(fake):
    fake.tables["audit_event"] = [dict(AUDIT, id=60, action="approve_rule", ref="1", detail="location_mismatch {}")]
    out = handlers.handle("u1", "approve rule 1")
    assert fake.calls == [("approve_rule", [1])]
    assert out.startswith("approve_rule 1 written to audit_event by controller (event 60")
    assert "needs a reason" in handlers.handle("u1", "reject rule 2")
    handlers.handle("u1", "reject rule 2 too broad")
    assert fake.calls[-1] == ("reject_rule", [2, "too broad"])
    assert "not a rule id" in handlers.handle("u1", "approve rule 1 OR 1=1")
    assert len(fake.calls) == 2


def test_rules_board(fake):
    fake.tables["rule"] = [{
        "id": 1, "status": "candidate", "condition": "location_mismatch", "scope_json": '{"truckIds": [17, 22]}',
        "uses": "one_time", "valid_from_day": 41, "valid_to_day": 46, "source_txn_ref": "2231",
        "backtest_json": json.dumps({"n": 3, "wouldClear": 3, "trueExceptionsCleared": 0}),
    }]
    out = handlers.handle("u1", "rules")
    assert out.splitlines()[0] == "Rules (1):"
    assert "#1  candidate  location_mismatch  scope {\"truckIds\": [17, 22]}  one_time  days 41-46  from 2231" in out
    assert "would have cleared 3 of 3 past rows; 0 were true exceptions" in out
    fake.tables["rule"] = []
    assert handlers.handle("u1", "rules").startswith("No rules yet")


def test_status_reads_business_day_and_day_total(fake):
    fake.tables["business_day"] = [{"id": 1, "day": 41, "date": "2026-08-27", "paused": True, "tick_micros": 2000000}]
    fake.tables["day_total"] = [{"day": 41, "auto_paid_cents": 1421000, "auto_paid_count": 12, "hold_count": 3, "rejected_count": 1, "txn_count": 16}]
    out = handlers.handle("u1", "status")
    assert out == "Day 41 of 92 (2026-08-27), clock paused, tick 2 s. Today: 16 transactions, 12 auto-paid ($14,210.00), 3 held, 1 rejected."
    assert "WHERE day = 41" in fake.queries[1]
    fake.tables["day_total"] = []
    assert handlers.handle("u1", "day").endswith("Nothing settled today yet.")


def test_pause_resume_step(fake):
    fake.tables["audit_event"] = [{"id": 5, "day": 0, "actor_role": "controller", "action": "set_clock", "ref": "0", "detail": "paused"}]
    fake.tables["business_day"] = [{"id": 1, "day": 1, "date": "2026-07-02", "paused": True, "tick_micros": 2000000}]
    out = handlers.handle("u1", "pause")
    assert fake.calls == [("set_clock", [True])]
    assert out.startswith("set_clock 0 written to audit_event by controller (event 5, day 0, paused). clock paused")
    handlers.handle("u1", "resume")
    assert fake.calls[-1] == ("set_clock", [False])
    out = handlers.handle("u1", "step")
    assert fake.calls[-1] == ("step_day", [])
    assert out.startswith("Stepped one day. Day 1 of 92")


def test_help(fake):
    assert handlers.handle("u1", "help") == fmt.HELP
    assert "what needs me" in fmt.HELP


# ---- free text ----

def test_free_text_without_key_answers_last_discussed_hold_per_sender(fake):
    fake.tables["hold"] = [HOLD_AWAITING]
    fake.tables["agent_task"] = [TASK]
    assert handlers.handle("u1", "yes he drove truck 22") == fmt.HELP          # nothing discussed yet
    handlers.handle("u1", "why 2231")
    out = handlers.handle("u1", "yes he drove truck 22 while 17 was in the shop")
    assert fake.calls == [("answer_question", ["2231", "yes he drove truck 22 while 17 was in the shop"])]
    assert out.startswith("answer_question 2231 written to audit_event")
    assert handlers.handle("u2", "me too") == fmt.HELP                            # other sender has no context


def test_free_text_with_key_makes_one_model_call(fake, monkeypatch):
    monkeypatch.setenv("ASI_ONE_API_KEY", "k")
    fake.tables["hold"] = [HOLD_AWAITING]
    calls = []

    def fake_completion(api_key, messages):
        calls.append((api_key, messages))
        return '```json\n{"intent": "answer", "txnRef": "2231", "text": null}\n```'

    monkeypatch.setattr(intents, "_chat_completion", fake_completion)
    handlers.handle("u9", "Ramon did drive 22 that day, 17 was in the shop")
    assert len(calls) == 1
    assert calls[0][0] == "k"
    assert "2231 (location_mismatch): Did Ramon Ortiz drive truck 22" in calls[0][1][0]["content"]
    assert fake.calls == [("answer_question", ["2231", "Ramon did drive 22 that day, 17 was in the shop"])]


def test_model_failure_falls_back_to_last_hold(fake, monkeypatch):
    monkeypatch.setenv("ASI_ONE_API_KEY", "k")
    fake.tables["hold"] = [HOLD_AWAITING]

    def boom(api_key, messages):
        raise RuntimeError("asi down")

    monkeypatch.setattr(intents, "_chat_completion", boom)
    handlers.LAST_REF["u1"] = "2231"
    handlers.handle("u1", "confirmed with the driver")
    assert fake.calls == [("answer_question", ["2231", "confirmed with the driver"])]


def test_model_output_with_injection_ref_is_rejected(fake, monkeypatch):
    monkeypatch.setenv("ASI_ONE_API_KEY", "k")
    fake.tables["hold"] = [HOLD_AWAITING]
    monkeypatch.setattr(intents, "_chat_completion", lambda k, m: '{"intent": "approve", "txnRef": "2231\' OR 1=1", "text": null}')
    out = handlers.handle("u1", "go ahead and pay it")
    assert "not a transaction reference" in out
    assert fake.calls == []


def test_extract_json_shapes():
    assert intents._extract_json('{"intent": "holds"}') == {"intent": "holds"}
    assert intents._extract_json('Sure: {"intent": "status", "txnRef": null, "text": null}')["intent"] == "status"
    assert intents._extract_json("no json here") == {}
    assert intents.classify("x", [], api_key=None) is None


def test_dollars():
    assert fmt.dollars(41200) == "$412.00"
    assert fmt.dollars("28000") == "$280.00"
    assert fmt.dollars(-150) == "-$1.50"
    assert fmt.dollars(None) == "$?"
