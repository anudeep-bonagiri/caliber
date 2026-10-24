"""Offline tests for the Elastic layer. No network: everything runs in dry-run or on pure functions.

    cd elastic && .venv/bin/python -m pytest -q
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import pytest

ELASTIC_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ELASTIC_DIR))

import common  # noqa: E402
import ingest  # noqa: E402
import setup_agent  # noqa: E402
import smoke  # noqa: E402

MAPPINGS = ("telematics_log", "receipts", "contracts", "invoices")
TOOLS = {
    "find_trips_near": {"point_wkt", "radius_m", "since", "until"},
    "find_trips_near_ms": {"point_wkt", "radius_m", "since_ms", "until_ms"},
    "contract_rate_for_vendor": {"vendor_id", "item", "on"},
}


@pytest.fixture
def no_elastic_env(monkeypatch):
    for name in ("ELASTICSEARCH_URL", "ELASTIC_API_KEY", "KIBANA_URL", "EMBEDDING_INFERENCE_ID", "AGENT_ID"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setattr(common, "ENV_FILE", ELASTIC_DIR / "tests" / "does-not-exist.env")


# ---------------------------------------------------------------- mappings


@pytest.mark.parametrize("name", MAPPINGS)
def test_mapping_files_parse(name):
    mapping = json.loads((ELASTIC_DIR / "mappings" / f"{name}.json").read_text())
    assert mapping["dynamic"] == "strict"
    assert isinstance(mapping["properties"], dict) and mapping["properties"]


def test_telematics_mapping_fields():
    props = json.loads((ELASTIC_DIR / "mappings" / "telematics_log.json").read_text())["properties"]
    assert props["at"]["type"] == "date"
    assert props["at_ms"]["type"] == "long"
    assert props["truck_id"]["type"] == "keyword"
    assert props["day"]["type"] == "integer"
    assert props["location"]["type"] == "geo_point"
    assert props["engine_on"]["type"] == "boolean"
    assert props["odometer"]["type"] == "float"


def test_receipts_and_contracts_have_semantic_fields():
    receipts = json.loads((ELASTIC_DIR / "mappings" / "receipts.json").read_text())["properties"]
    contracts = json.loads((ELASTIC_DIR / "mappings" / "contracts.json").read_text())["properties"]
    assert receipts["body_semantic"]["type"] == "semantic_text"
    assert receipts["body_semantic"]["inference_id"] == common.DEFAULT_INFERENCE_ID
    assert contracts["clause_semantic"]["type"] == "semantic_text"
    for key in ("txn_ref", "truck_id", "driver_id", "station"):
        assert receipts[key]["type"] == "keyword"
    assert receipts["cents"]["type"] == "long" and receipts["gallons"]["type"] == "float"
    assert contracts["rate_cents"]["type"] == "long"
    assert contracts["valid_from"]["type"] == "integer" and contracts["valid_to"]["type"] == "integer"


def test_load_mapping_semantic_switches():
    without = ingest.load_mapping("receipts", semantic=False, inference_id="x")["properties"]
    assert "body_semantic" not in without
    custom = ingest.load_mapping("receipts", semantic=True, inference_id="my-endpoint")["properties"]
    assert custom["body_semantic"]["inference_id"] == "my-endpoint"
    default = ingest.load_mapping("contracts", semantic=True, inference_id=None)["properties"]
    assert default["clause_semantic"]["type"] == "semantic_text"
    assert "inference_id" not in default["clause_semantic"]


# ---------------------------------------------------------------- tools


@pytest.mark.parametrize("tool_id,params", TOOLS.items())
def test_tool_files_parse_with_expected_params(tool_id, params):
    body = json.loads((ELASTIC_DIR / "tools" / f"{tool_id}.json").read_text())
    assert body["id"] == tool_id
    assert body["type"] == "esql"
    assert body["description"]
    cfg = body["configuration"]
    assert set(cfg["params"]) == params
    for spec in cfg["params"].values():
        assert spec["type"] and spec["description"]
    for name in params:
        assert f"?{name}" in cfg["query"], f"{tool_id} query does not reference ?{name}"


def test_find_trips_near_query_matches_spec():
    body = json.loads((ELASTIC_DIR / "tools" / "find_trips_near.json").read_text())
    assert body["configuration"]["query"] == (
        "FROM telematics_log | WHERE at >= ?since AND at <= ?until "
        "| EVAL dist_m = ST_DISTANCE(location, TO_GEOPOINT(?point_wkt)) "
        "| WHERE dist_m < ?radius_m | SORT dist_m ASC | KEEP truck_id, at, dist_m | LIMIT 20"
    )
    assert body["configuration"]["params"]["since"]["type"] == "date"
    assert body["configuration"]["params"]["radius_m"]["type"] == "float"


def test_ms_variant_uses_at_ms_and_not_at_dates():
    q = json.loads((ELASTIC_DIR / "tools" / "find_trips_near_ms.json").read_text())["configuration"]["query"]
    assert "at_ms >= ?since_ms" in q and "at_ms <= ?until_ms" in q
    assert "?since " not in q and "?until " not in q


def test_contract_tool_query():
    q = json.loads((ELASTIC_DIR / "tools" / "contract_rate_for_vendor.json").read_text())["configuration"]["query"]
    assert q.startswith("FROM contracts | WHERE vendor_id == ?vendor_id AND item == ?item")
    assert "valid_from <= ?on AND valid_to >= ?on" in q
    assert "rate_cents" in q and "clause" in q and "LIMIT 1" in q


# ---------------------------------------------------------------- ingest transforms


def test_ping_to_doc():
    row = {"truckId": 22, "day": 41, "at": "2026-08-27T13:05:00Z", "lat": 29.6819, "lon": -96.9033,
           "odometer": 184210.5, "engineOn": False}
    doc = ingest.ping_to_doc(row)
    assert doc["_id"] == "22-2026-08-27T13:05:00Z"
    assert doc["truck_id"] == "22"
    assert doc["day"] == 41
    assert doc["at"] == "2026-08-27T13:05:00Z"
    assert doc["at_ms"] == 1787835900000
    assert doc["location"] == {"lat": 29.6819, "lon": -96.9033}
    assert doc["engine_on"] is False
    assert doc["odometer"] == pytest.approx(184210.5)


def test_iso_to_ms_handles_offsets_and_naive():
    assert ingest.iso_to_ms("2026-08-27T13:05:00Z") == 1787835900000
    assert ingest.iso_to_ms("2026-08-27T08:05:00-05:00") == 1787835900000
    assert ingest.iso_to_ms("2026-08-27T13:05:00") == 1787835900000
    assert ingest.iso_to_ms("2026-08-27T13:05:00.250Z") == 1787835900250


def test_sample_fixtures_load_and_transform():
    sample = ELASTIC_DIR / "sample"
    pings = list(ingest.telematics_docs(sample))
    assert len(pings) == 20
    assert all(set(d) >= {"truck_id", "at", "at_ms", "location", "day"} for d in pings)
    receipts = list(ingest.receipt_docs(sample, semantic=True))
    r2231 = next(d for d in receipts if d["txn_ref"] == "2231")
    assert r2231["truck_id"] == "15" and r2231["driver_id"] == "22"
    assert r2231["station_location"] == {"lat": 29.6816, "lon": -96.9036}
    assert "LOVES" in r2231["body"] and r2231["body_semantic"] == r2231["body"]
    contracts = list(ingest.contract_docs(sample, semantic=False))
    brake = next(d for d in contracts if d["contract_id"] == "C-003-BRK")
    assert brake["vendor_id"] == "3" and brake["rate_cents"] == 48500
    assert brake["valid_from"] <= 44 <= brake["valid_to"]
    assert "clause_semantic" not in brake and "MAINTENANCE SERVICES AGREEMENT" in brake["body"]
    invoices = list(ingest.invoice_docs(sample))
    inv = next(d for d in invoices if d["invoice_id"] == "INV-3-1044")
    assert inv["po_id"] == "PO-0771" and inv["cents"] == 105000 and inv["received_day"] == 44
    no_po = next(d for d in invoices if d["invoice_id"] == "INV-5-0210")
    assert "po_id" not in no_po


def test_read_rows_accepts_jsonl(tmp_path):
    (tmp_path / "trip_pings.jsonl").write_text('{"truckId": 1, "day": 1, "at": "2026-07-01T10:00:00Z", "lat": 1, "lon": 2}\n\n'
                                               '{"truckId": 2, "day": 1, "at": "2026-07-01T10:05:00Z", "lat": 3, "lon": 4}\n')
    rows = ingest.read_rows(tmp_path, "trip_pings")
    assert [r["truckId"] for r in rows] == [1, 2]
    assert ingest.read_rows(tmp_path, "card_txns") == []


def test_ingest_dry_run_on_sample(no_elastic_env, capsys):
    rc = ingest.main(["--dry-run", "--fixtures", str(ELASTIC_DIR / "sample"), "--limit", "5"])
    out = capsys.readouterr().out
    assert rc == 0
    assert "PUT https://my-project.es.us-east-1.aws.elastic.cloud/telematics_log" in out
    assert "POST https://my-project.es.us-east-1.aws.elastic.cloud/_bulk" in out
    assert "ApiKey <ELASTIC_API_KEY unset>" in out


# ---------------------------------------------------------------- common


def test_kibana_url_derivation():
    es = "https://abc123.es.us-east-1.aws.elastic.cloud"
    assert common.derive_kibana_url(es) == "https://abc123.es.us-east-1.aws.elastic.cloud".replace(".es.", ".kb.")
    assert common.derive_kibana_url(es + "/") == "https://abc123.kb.us-east-1.aws.elastic.cloud"
    assert common.derive_kibana_url(es, "https://custom.kb.example/") == "https://custom.kb.example"
    assert common.derive_kibana_url("http://localhost:9200") == ""


def test_settings_from_env_uses_dotenv_and_derives_kibana(monkeypatch, tmp_path):
    for name in ("ELASTICSEARCH_URL", "ELASTIC_API_KEY", "KIBANA_URL"):
        monkeypatch.delenv(name, raising=False)
    env = tmp_path / ".env"
    env.write_text("ELASTICSEARCH_URL=https://proj.es.us-west-2.aws.elastic.cloud/\nELASTIC_API_KEY='abcdefghijkl'\n# KIBANA_URL=\n")
    monkeypatch.setattr(common, "ENV_FILE", env)
    s = common.Settings.from_env()
    assert s.es_url == "https://proj.es.us-west-2.aws.elastic.cloud"
    assert s.kibana_url == "https://proj.kb.us-west-2.aws.elastic.cloud"
    assert s.api_key == "abcdefghijkl"
    headers = s.kibana_headers()
    assert headers["Authorization"] == "ApiKey abcdefghijkl"
    assert headers["kbn-xsrf"] == "true"
    assert headers["x-elastic-internal-origin"] == "Kibana"
    assert common.redacted_headers(headers, s.api_key)["Authorization"] == "ApiKey ****ijkl"


def test_settings_missing_env_fails_fast_unless_dry_run(no_elastic_env):
    with pytest.raises(SystemExit):
        common.Settings.from_env()
    s = common.Settings.from_env(dry_run=True)
    assert s.kibana_url.startswith("https://my-project.kb.")


def test_esql_rows_flattens_execute_results():
    results = [{"type": "query", "data": {"columns": [{"name": "truck_id", "type": "keyword"}, {"name": "dist_m", "type": "double"}],
                                           "values": [["22", 47.1], ["7", 1750.2]]}}]
    assert common.esql_rows(results) == [{"truck_id": "22", "dist_m": 47.1}, {"truck_id": "7", "dist_m": 1750.2}]
    assert common.esql_rows([{"type": "other"}]) == []


def test_forbidden_hint_names_the_privilege():
    assert "feature_agentBuilder.read" in common.FORBIDDEN_HINT


# ---------------------------------------------------------------- setup_agent and smoke dry runs


def test_setup_agent_dry_run_prints_both_tool_ids(no_elastic_env, capsys):
    rc = setup_agent.main(["--dry-run"])
    out = capsys.readouterr().out
    assert rc == 0
    assert "POST https://my-project.kb.us-east-1.aws.elastic.cloud/api/agent_builder/tools" in out
    assert "tool find_trips_near: created" in out
    assert "tool contract_rate_for_vendor: created" in out
    assert "find_trips_near_ms" not in out.split("Registering agent")[0].split("Registering tools")[1]
    assert "agent dispatch-investigator: created" in out
    assert "Authorization: ApiKey <ELASTIC_API_KEY unset>" in out
    assert "kbn-xsrf: true" in out
    assert "/api/agent_builder/mcp" in out


def test_setup_agent_include_ms(no_elastic_env, capsys):
    rc = setup_agent.main(["--dry-run", "--include-ms"])
    out = capsys.readouterr().out
    assert rc == 0 and "tool find_trips_near_ms: created" in out


def test_agent_body_instructions():
    body = setup_agent.agent_body("dispatch-investigator", ["find_trips_near", "contract_rate_for_vendor"])
    text = body["configuration"]["instructions"]
    assert "one accounts-payable exception at a time" in text
    assert "only from tool results" in text
    assert "Never recommend paying" in text
    assert "verbatim" in text
    assert body["configuration"]["tools"] == [{"tool_ids": ["find_trips_near", "contract_rate_for_vendor"]}]
    assert "id" not in setup_agent.put_body(body) and "name" not in setup_agent.put_body(body)


def test_smoke_window_from_fixture_and_fallback(tmp_path):
    w = smoke.hold_2231_window(ELASTIC_DIR / "sample" / "card_txns.json")
    assert w["point_wkt"] == "POINT(-96.9036 29.6816)"
    assert w["since"] == "2026-08-27T13:02:00Z" and w["until"] == "2026-08-27T13:22:00Z"  # ten-minute window each side, matching smoke.py and the brief
    fb = smoke.hold_2231_window(tmp_path / "missing.json")
    assert fb == {"source": "spec literals", "point_wkt": "POINT(-96.9036 29.6816)",
                  "since": "2026-08-27T12:30:00Z", "until": "2026-08-27T14:00:00Z"}


def test_smoke_dry_run(no_elastic_env, capsys):
    rc = smoke.main(["--dry-run", "--card-txns", str(ELASTIC_DIR / "sample" / "card_txns.json")])
    out = capsys.readouterr().out
    assert rc == 0
    assert "/api/agent_builder/tools/_execute" in out
    assert '"tool_id": "find_trips_near"' in out and '"tool_id": "contract_rate_for_vendor"' in out
    assert '"method": "initialize"' in out and '"method": "tools/list"' in out
    assert "checks passed" in out
