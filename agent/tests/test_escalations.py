"""reads.escalations_line against a mocked httpx transport (Task 26.3). No network."""

import httpx
import pytest

from agent import reads


@pytest.fixture(autouse=True)
def elastic_env(monkeypatch):
    monkeypatch.setenv("ELASTICSEARCH_URL", "https://es.test")
    monkeypatch.setenv("ELASTIC_MCP_API_KEY", "scoped-test-key")
    monkeypatch.delenv("ELASTIC_API_KEY", raising=False)
    yield
    reads._escalations_transport = None


def mock(handler):
    reads._escalations_transport = httpx.MockTransport(handler)


def hits(total, rows):
    return {"hits": {"total": {"value": total, "relation": "eq"}, "hits": [{"_source": r} for r in rows]}}


def test_newest_brief_with_count_and_80_chars():
    seen = {}

    def handler(req):
        seen["url"] = str(req.url)
        seen["auth"] = req.headers.get("authorization")
        seen["body"] = req.read()
        long = "Hold INV-1003 is a rate variance of 19.2 percent on an oil service; the contract clause 4.2 says the unit rate is firm for the term."
        return httpx.Response(200, json=hits(3, [{"hold_ref": "INV-1003", "brief": long, "at": "2026-10-24T23:00:00Z"}]))

    mock(handler)
    line = reads.escalations_line()
    assert line.startswith("3 escalations, newest: INV-1003: Hold INV-1003 is a rate variance")
    assert line.endswith("...")
    text = line.split("INV-1003: ", 1)[1]
    assert len(text) == 83  # 80 chars plus the ellipsis
    assert seen["url"] == "https://es.test/escalations/_search"
    assert seen["auth"] == "ApiKey scoped-test-key"   # the scoped key wins over the project key
    assert b'"sort"' in seen["body"] and b'"at"' in seen["body"]


def test_single_escalation_is_singular():
    mock(lambda req: httpx.Response(200, json=hits(1, [{"hold_ref": "2231", "brief": "Truck 22 was at the station.", "at": "x"}])))
    assert reads.escalations_line() == "1 escalation, newest: 2231: Truck 22 was at the station."


def test_zero_escalations():
    mock(lambda req: httpx.Response(200, json=hits(0, [])))
    assert reads.escalations_line() == "0 escalations"


def test_unset_env_says_not_connected(monkeypatch):
    monkeypatch.delenv("ELASTICSEARCH_URL")
    mock(lambda req: (_ for _ in ()).throw(AssertionError("must not be called")))
    assert reads.escalations_line() == "escalations: not connected"


def test_falls_back_to_project_key(monkeypatch):
    monkeypatch.delenv("ELASTIC_MCP_API_KEY")
    monkeypatch.setenv("ELASTIC_API_KEY", "project-key")
    seen = {}

    def handler(req):
        seen["auth"] = req.headers.get("authorization")
        return httpx.Response(200, json=hits(0, []))

    mock(handler)
    assert reads.escalations_line() == "0 escalations"
    assert seen["auth"] == "ApiKey project-key"


@pytest.mark.parametrize("response", [
    lambda req: httpx.Response(403, json={"error": "forbidden"}),
    lambda req: httpx.Response(404, json={"error": {"type": "index_not_found_exception"}}),
    lambda req: httpx.Response(200, content=b"not json"),
    lambda req: (_ for _ in ()).throw(httpx.ConnectError("refused")),
    lambda req: (_ for _ in ()).throw(httpx.ReadTimeout("slow")),
])
def test_any_failure_says_not_connected(response):
    mock(response)
    assert reads.escalations_line() == "escalations: not connected"


def test_status_reply_ends_with_the_escalations_line(monkeypatch):
    monkeypatch.setattr(reads.ledger, "sql", lambda q: [])
    mock(lambda req: httpx.Response(200, json=hits(2, [{"hold_ref": "INV-1003", "brief": "short", "at": "x"}])))
    out = reads.status()
    assert out.splitlines()[-1] == "2 escalations, newest: INV-1003: short"

    monkeypatch.delenv("ELASTICSEARCH_URL")
    out = reads.status()
    assert out.splitlines()[-1] == "escalations: not connected"
