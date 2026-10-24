"""ledger.py against a mocked httpx transport. No network."""

import json

import httpx
import pytest

from agent import ledger

IDENT = "0xc200c318a457f3819c54a2a7ad9a9c8fb39e200bc4c6e4b89fe486b66ed04d43"

OPTION_STRING = {"Sum": {"variants": [
    {"name": {"some": "some"}, "algebraic_type": {"String": []}},
    {"name": {"some": "none"}, "algebraic_type": {"Product": {"elements": []}}},
]}}
OPTION_U64 = {"Sum": {"variants": [
    {"name": {"some": "some"}, "algebraic_type": {"U64": []}},
    {"name": {"some": "none"}, "algebraic_type": {"Product": {"elements": []}}},
]}}
IDENTITY = {"Product": {"elements": [{"name": {"some": "__identity__"}, "algebraic_type": {"U256": []}}]}}
TIMESTAMP = {"Product": {"elements": [{"name": {"some": "__timestamp_micros_since_unix_epoch__"}, "algebraic_type": {"I64": []}}]}}

HOLD_SCHEMA = [
    ("txn_ref", {"String": []}),
    ("cents", {"I64": []}),
    ("requested_by", IDENTITY),
    ("question", OPTION_STRING),
    ("answer", OPTION_STRING),
    ("rule_id", OPTION_U64),
    ("updated_at", TIMESTAMP),
]
# The live server's positional encodings, captured 2026-10-24.
HOLD_ROW = ["2231", 41200, [IDENT], [0, "Did Ramon drive 22?"], [1, []], [1, []], [1792864611253547]]


def sql_payload(schema, rows):
    return [{
        "schema": {"elements": [{"name": {"some": n}, "algebraic_type": t} for n, t in schema]},
        "rows": rows,
        "total_duration_micros": 1,
    }]


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("STDB_URI", "http://ledger.test")
    monkeypatch.setenv("STDB_DB", "dispatch-ledger")
    monkeypatch.setenv("STDB_CONTROLLER_TOKEN", "tok-controller")
    yield
    ledger._transport = None


def mock(handler):
    ledger._transport = httpx.MockTransport(handler)


def test_sql_decodes_positional_option_identity_timestamp_and_bigint():
    seen = {}

    def handler(request: httpx.Request):
        seen["url"] = str(request.url)
        seen["auth"] = request.headers.get("authorization")
        seen["body"] = request.content.decode()
        return httpx.Response(200, json=sql_payload(HOLD_SCHEMA, [HOLD_ROW]))

    mock(handler)
    rows = ledger.sql("SELECT * FROM hold")
    assert seen["url"] == "http://ledger.test/v1/database/dispatch-ledger/sql"
    assert seen["auth"] == "Bearer tok-controller"
    assert seen["body"] == "SELECT * FROM hold"
    assert rows == [{
        "txn_ref": "2231",
        "cents": 41200,
        "requested_by": IDENT[2:],
        "question": "Did Ramon drive 22?",
        "answer": None,
        "rule_id": None,
        "updated_at": "2026-10-24T17:56:51Z",
    }]
    assert isinstance(rows[0]["cents"], int)


def test_sql_decodes_documented_dict_forms_too():
    row = ["2231", "41200", {"__identity__": IDENT}, {"some": "Q?"}, {"none": []}, {"some": 7}, {"__timestamp_micros_since_unix_epoch__": 1792864611253547}]
    mock(lambda req: httpx.Response(200, json=sql_payload(HOLD_SCHEMA, [row])))
    (r,) = ledger.sql("SELECT * FROM hold")
    assert r["cents"] == 41200 and isinstance(r["cents"], int)
    assert r["requested_by"] == IDENT[2:]
    assert r["question"] == "Q?" and r["answer"] is None and r["rule_id"] == 7
    assert r["updated_at"] == "2026-10-24T17:56:51Z"


def test_sql_empty_result_and_error_status():
    mock(lambda req: httpx.Response(200, json=sql_payload(HOLD_SCHEMA, [])))
    assert ledger.sql("SELECT * FROM hold") == []
    mock(lambda req: httpx.Response(400, text="no such table: `nope`"))
    with pytest.raises(ledger.LedgerError, match="no such table"):
        ledger.sql("SELECT * FROM nope")


def test_call_posts_json_array_with_bearer_and_returns_on_200():
    seen = {}

    def handler(request: httpx.Request):
        seen["url"] = str(request.url)
        seen["auth"] = request.headers.get("authorization")
        seen["json"] = json.loads(request.content)
        return httpx.Response(200, text="")

    mock(handler)
    ledger.call("approve_payment", "2231", ledger.opt("spoke to Ramon"))
    assert seen["url"].endswith("/call/approve_payment")
    assert seen["auth"] == "Bearer tok-controller"
    assert seen["json"] == ["2231", {"some": "spoke to Ramon"}]
    ledger.call("approve_payment", "2231", ledger.opt(None))
    assert seen["json"] == ["2231", {"none": []}]


def test_call_530_raises_refused_with_verbatim_message():
    mock(lambda req: httpx.Response(530, text="requester cannot approve"))
    with pytest.raises(ledger.LedgerRefused) as e:
        ledger.call("approve_payment", "2231", {"none": []})
    assert str(e.value) == "requester cannot approve"
    assert isinstance(e.value, ledger.LedgerError)


@pytest.mark.parametrize("status,needle", [(401, "token rejected"), (403, "token rejected"), (404, "no such reducer"), (500, "HTTP 500")])
def test_call_other_failures_raise_ledger_error_not_refused(status, needle):
    mock(lambda req: httpx.Response(status, text="boom"))
    with pytest.raises(ledger.LedgerError, match=needle) as e:
        ledger.call("set_clock", True)
    assert not isinstance(e.value, ledger.LedgerRefused)


def test_network_failures_become_ledger_error():
    def down(request):
        raise httpx.ConnectError("refused")

    mock(down)
    with pytest.raises(ledger.LedgerError, match="unreachable"):
        ledger.sql("SELECT * FROM hold")

    def slow(request):
        raise httpx.ReadTimeout("slow")

    mock(slow)
    with pytest.raises(ledger.LedgerError, match="timed out"):
        ledger.call("step_day")


def test_missing_env_is_a_clear_error(monkeypatch):
    monkeypatch.delenv("STDB_CONTROLLER_TOKEN")
    with pytest.raises(ledger.LedgerError, match="STDB_CONTROLLER_TOKEN"):
        ledger.sql("SELECT 1")


@pytest.mark.parametrize("bad", ["2231' OR 1=1", "2231; DROP TABLE hold", "", " ", "a" * 25, "INV_1077", "T1042'"])
def test_txn_ref_regex_rejects_injection_and_junk(bad):
    with pytest.raises(ledger.BadReference):
        ledger.check_txn_ref(bad)
    with pytest.raises(ledger.BadReference):
        ledger.quote(bad)


@pytest.mark.parametrize("good", ["2231", "T1042", "INV-1077", "9901"])
def test_txn_ref_regex_accepts_contract_shapes(good):
    assert ledger.check_txn_ref(good) == good
    assert ledger.quote(good) == f"'{good}'"


@pytest.mark.parametrize("bad", ["1 OR 1=1", "1'", "x", "", "1234567890123"])
def test_rule_id_regex(bad):
    with pytest.raises(ledger.BadReference):
        ledger.check_rule_id(bad)
    assert ledger.check_rule_id("#12") == 12
    assert ledger.check_rule_id("7") == 7


def test_decode_without_schema_recognizes_shapes():
    assert ledger.decode([1, []]) is None
    assert ledger.decode([0, "x"]) == "x"
    assert ledger.decode([IDENT]) == IDENT[2:]
    assert ledger.decode([1792864611253547]) == "2026-10-24T17:56:51Z"
    assert ledger.decode(41200) == 41200
    assert ledger.decode("plain") == "plain"
