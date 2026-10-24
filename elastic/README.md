# Elastic layer for Caliber (repo and ledger name: dispatch-ledger)

Elastic Cloud Serverless holds the evidence the investigator may touch: telematics pings, fuel receipts, vendor contracts and invoices. Four hand-written ES|QL tools live in Elastic Agent Builder (two exact, two semantic over the JINA `semantic_text` fields), and the worker's Droid session reaches them over the Agent Builder MCP endpoint under a least-privilege key. One Workflow (`workflows/stale_holds.yaml`) briefs holds nobody has answered into an `escalations` index that the controller agent's `status` reply reads. Nothing here writes ES|QL at runtime; the queries are fixed in `tools/*.json`.

```
seed/fixtures ──► ingest.py ──► telematics_log, receipts, contracts, invoices
                                   │
                 setup_agent.py ──► Agent Builder tools: find_trips_near, contract_rate_for_vendor,
                                   │                     find_contract_clause, find_receipt_text (JINA semantic)
                                   │                     agent: dispatch-investigator
                 smoke.py ────────► tools/_execute (all four) + MCP initialize + tools/list
                                   │
                 make_mcp_key.py ─► ELASTIC_MCP_API_KEY (read on six indices + Agent Builder read)
                 worker/ (Droid) ──► {KIBANA_URL}/api/agent_builder/mcp
                 mirror_holds.py ─► holds  (public hold table, anonymous SpacetimeDB SQL)
                 setup_workflow.py ► Workflow caliber-stale-holds: holds ─► ai.agent ─► escalations
                 agent/reads.py ──► "N escalations, newest: ..." in the status reply
```

Everything has `--dry-run`: it prints every request (method, URL, headers with the key redacted, body) and sends nothing. Run that first; the same commands go live the moment the three env vars are set.

## 0. Install

```bash
cd elastic
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m pytest -q tests          # offline, no network
```

## 1. Create the Serverless project and key

1. Go to https://cloud.elastic.co/serverless-registration (ela.st/calhacks redirects there) and create an **Elasticsearch Serverless** project. Default settings are fine. Wait until it says ready.
2. Open the project, then **Connection details**. Copy the **Elasticsearch endpoint**. It looks like `https://<project>.es.<region>.aws.elastic.cloud`.
3. In the same panel create an **API key** and copy the encoded key once; it is not shown again.
4. Add to the repo root `.env` (never commit it; `.gitignore` already covers it):

```
ELASTICSEARCH_URL=https://<project>.es.<region>.aws.elastic.cloud
ELASTIC_API_KEY=<encoded key>
KIBANA_URL=           # optional; derived as the endpoint with .es. replaced by .kb.
```

`KIBANA_URL` is derived from `ELASTICSEARCH_URL` by replacing the first `.es.` with `.kb.` (paper-scout and Peel both do this). Set it only when that guess is wrong.

Exact env var names: `ELASTICSEARCH_URL`, `ELASTIC_API_KEY`, `KIBANA_URL`. Optional: `EMBEDDING_INFERENCE_ID` (default `.jina-embeddings-v5-text-small`), `AGENT_ID` (default `dispatch-investigator`).

## 2. Headers

Every Kibana (Agent Builder) call sends:

```
Authorization: ApiKey <ELASTIC_API_KEY>      # ApiKey, not Bearer
kbn-xsrf: true
Content-Type: application/json
x-elastic-internal-origin: Kibana
```

Elasticsearch calls (index create, bulk) go through the official `elasticsearch` 9 client with the same API key. MCP calls send `Authorization: ApiKey ...` and `Accept: application/json, text/event-stream`.

## 3. Ingest

```bash
.venv/bin/python ingest.py --dry-run                      # look at the requests
.venv/bin/python ingest.py                                # seed/fixtures -> four indices
.venv/bin/python ingest.py --only telematics_log,receipts --limit 500
.venv/bin/python ingest.py --fixtures elastic/sample      # 20 synthetic pings, 2 receipts, 4 contracts, 2 invoices
.venv/bin/python ingest.py --no-semantic                  # skip semantic_text (no inference endpoint needed)
.venv/bin/python ingest.py --recreate                     # drop and rebuild
```

Index creation is idempotent (HEAD then PUT). Mappings are in `mappings/*.json` with `dynamic: strict`.

| Index | Source | Notes |
| --- | --- | --- |
| `telematics_log` | `trip_pings.json` or `.jsonl` | `at` is the ISO string as given; `at_ms` (long) is the epoch-millis copy for the fallback tool; `location` is `{lat, lon}`; `_id` is `<truckId>-<at>` so reruns overwrite instead of duplicating |
| `receipts` | `card_txns.json` joined with `evidence/receipts/<txnRef>.txt` | receipt text files with no card row still get indexed; `body_semantic` is `semantic_text` |
| `contracts` | `contracts.json` plus `evidence/contracts/<id>.txt` | `vendor_id` is stored as a keyword string ("3"); `valid_from`/`valid_to` are business-day integers; `clause_semantic` is `semantic_text` |
| `invoices` | `invoices.json` plus `evidence/invoices/<id>.txt` | `po_id` omitted when null |

`semantic_text` uses `.jina-embeddings-v5-text-small` when the project has it (ingest checks `GET /_inference/<id>` first) and falls back to the cluster default when it does not. Embeddings are computed during bulk, so `--batch` stays modest (default 200).

## 4. Tools and agent

```bash
.venv/bin/python setup_agent.py --dry-run
.venv/bin/python setup_agent.py                 # find_trips_near, contract_rate_for_vendor, agent
.venv/bin/python setup_agent.py --include-ms    # also find_trips_near_ms (epoch-millis fallback)
```

Upsert is paper-scout's pattern: `GET /api/agent_builder/tools/<id>`; 200 means `PUT` with the mutable fields (`description`, `tags`, `configuration`); 404 means `POST /api/agent_builder/tools` with the full body. Same for `/api/agent_builder/agents/dispatch-investigator`. Run ingest first: Agent Builder validates ES|QL tools against real mappings, so a tool over a missing index is rejected.

`find_trips_near(lat, lon, radius_m, start, end)` (Task 26.1, Jd Armada's answers: `date` params compared against `@timestamp` with ISO-8601 strings; no `geo_point` param, `lat` and `lon` are `float` and the query builds the point; `@timestamp` is a mapping alias of `at`, added with one `PUT telematics_log/_mapping`, no re-ingest):

```
FROM telematics_log
| WHERE @timestamp >= ?start AND @timestamp <= ?end
| EVAL dist_m = ST_DISTANCE(location, TO_GEOPOINT(CONCAT("POINT(", TO_STRING(?lon), " ", TO_STRING(?lat), ")")))
| WHERE dist_m < ?radius_m
| SORT dist_m ASC | KEEP truck_id, @timestamp, dist_m | LIMIT 20
```

`contract_rate_for_vendor(vendor_id, item, on)`:

```
FROM contracts
| WHERE vendor_id == ?vendor_id AND item == ?item AND valid_from <= ?on AND valid_to >= ?on
| KEEP contract_id, rate_cents, clause | LIMIT 1
```

`find_contract_clause(vendor_id, question)` and `find_receipt_text(txn_ref, question)` (Task 26.2) are semantic: `FROM contracts METADATA _score | WHERE vendor_id == ?vendor_id AND MATCH(clause_semantic, ?question) | SORT _score DESC | KEEP contract_id, item, rate_cents, valid_from, valid_to, clause, _score | LIMIT 3`, and the same shape over `receipts` with `MATCH(body_semantic, ?question)` restricted to one `txn_ref`. Both fields are `semantic_text` with `inference_id: .jina-embeddings-v5-text-small`, so the question is embedded by JINA at query time; Serverless accepts `MATCH` on `semantic_text` (verified 2026-10-24, brake clause ranks first at score 0.776).

`find_trips_near_ms(point_wkt, radius_m, since_ms, until_ms)` is the same spatial query over the stored `at_ms` long column. Register it with `--include-ms` only if the date version misbehaves (see caveats), so Droid does not see two near-identical tools without reason.

The agent `dispatch-investigator` gets both tool ids and instructions that it investigates one accounts-payable exception at a time, answers only from tool results, never recommends paying, and cites tool outputs verbatim. You can chat with it in Kibana under Agents to show it off; the worker does not use `converse`, it calls the tools through MCP.

## 5. Smoke test

```bash
.venv/bin/python smoke.py --dry-run
.venv/bin/python smoke.py              # green means Task 7 is done
.venv/bin/python smoke.py --ms         # also run the epoch-millis variant
```

It runs three checks:

1. `POST /api/agent_builder/tools/_execute` with `{"tool_id": "find_trips_near", "tool_params": {...}}` for hold 2231's station and window. The point and window are read from `seed/fixtures/card_txns.json` (txn 2231: `stationLon`, `stationLat`, `at` plus or minus 45 minutes) when the file exists, else the spec literals `POINT(-96.9036 29.6816)`, 3000 m, `2026-08-27T12:30:00Z` to `2026-08-27T14:00:00Z`. Pass means truck `22` is the first row.
2. `contract_rate_for_vendor` for vendor `3`, `brake_job`, day `44`. Pass means a `rate_cents` comes back.
3. `POST {KIBANA_URL}/api/agent_builder/mcp` with a JSON-RPC `initialize`, then `notifications/initialized`, then `tools/list`; prints the tool names the endpoint exposes and passes when both tools are there. The Streamable HTTP transport may answer as JSON or as one SSE `data:` frame; both are parsed, and an `mcp-session-id` response header is echoed back when present.

If check 1 returns zero rows or a 400 about the date params, the script tries `find_trips_near_ms` automatically; register it with `setup_agent.py --include-ms` and switch the worker brief to pass epoch millis.

## 6. The scoped MCP key and the 403 fix

Droid's MCP entry should carry `ELASTIC_MCP_API_KEY`, the key named `caliber-droid-mcp`: read and `view_index_metadata` on `receipts`, `contracts`, `telematics_log`, `invoices`, `holds`, `escalations`, and the Kibana application privileges `feature_agentBuilder.read` and `feature_actions.read` on `space:default`. Nothing else. `make_mcp_key.py --dry-run` prints the exact role descriptor; `make_mcp_key.py` creates it and writes the one `.env` line. On this Serverless project the create call from an API key fails (`creating derived api keys requires an explicit role descriptor that is empty`), so the key is made once in the Kibana UI (`docs/evidence/elastic/scoped_key_request.md`) and stored with `pbpaste | make_mcp_key.py --write-from-stdin`. The worker (`worker/src/config.ts`) uses it when set and falls back to `ELASTIC_API_KEY`. `smoke.py --mcp-key-env ELASTIC_MCP_API_KEY` is the 200 proof; the same with a key that lacks the application privilege is the 403 proof.

If any `/api/agent_builder/...` call (REST or MCP) returns **403**, the API key lacks the `feature_agentBuilder.read` application privilege. The scripts print this when it happens. Fix: create a new API key that carries it, either in Kibana (Stack Management > API keys > Create API key, and under Kibana privileges grant Agent Builder read or all), or with

```bash
curl -X POST "$ELASTICSEARCH_URL/_security/api_key" \
  -H "Authorization: ApiKey $ELASTIC_API_KEY" -H "Content-Type: application/json" \
  -d '{"name":"dispatch-agent-builder","role_descriptors":{"ab":{"cluster":["monitor"],"indices":[{"names":["telematics_log","receipts","contracts","invoices"],"privileges":["read","view_index_metadata"]}],"applications":[{"application":"kibana-.kibana","privileges":["feature_agentBuilder.read","feature_agentBuilder.all"],"resources":["*"]}]}}}'
```

and put the returned `encoded` value in `ELASTIC_API_KEY`. Peel's project-level key worked without this, so try the plain key first.

Other first-contact errors: **401** means the key is wrong or the header says `Bearer`; **404** on an Agent Builder route usually means `KIBANA_URL` still points at the `.es.` host.

## 7. ES|QL caveats on Serverless

- `==` on a multi-valued keyword matches nothing. Use `MV_CONTAINS(field, ?value)` for any field that can hold several values. Our keyword fields are single-valued on purpose.
- `LOOKUP JOIN`, `FIRST` and `LAST` are not available on Serverless. Do the join in the worker, or store the denormalised value (that is why `contracts` carries `vendor_id` and `item` directly).
- A `date` typed parameter in `WHERE at >= ?since` is documented but was not exercised by a winner. If it comes back empty or with a type error, use `find_trips_near_ms`, which compares the stored `at_ms` long against epoch-millis params (`since_ms`, `until_ms`, typed `float`). `ingest.py` writes `at_ms` for every ping, so no re-ingest is needed.
- If tool creation fails with a 400 that mentions `params`, this Kibana build names param types after field types (`keyword`, `long`, `double`) instead of `string`/`integer`/`float`. `setup_agent.py` retries once with `string` mapped to `keyword`; adjust the JSON if the integer or float names are also rejected.
- `TO_GEOPOINT` wants WKT with longitude first: `POINT(-96.9036 29.6816)`. `ST_DISTANCE` on `geo_point` returns meters.
- Models confuse ES|QL with SQL. The queries stay hand-written in `tools/*.json`; Droid only chooses parameters.

## 8. The Workflow (Task 26.3)

`workflows/stale_holds.yaml` is `caliber-stale-holds`: a `scheduled` trigger every 1h and a `manual` trigger with one input `min_age_bd` (default 2). Steps: `elasticsearch.esql.query` over `holds` (`is_open == true AND age_bd > min_age_bd`, LIMIT 3), a `foreach` with an `ai.agent` step (`agent-id: dispatch-investigator`, the Agent Builder agent that owns the four tools) asking for a one-paragraph brief, then `elasticsearch.index` into `escalations` with `{hold_ref, code, cents, day, age_bd, min_age_bd, brief, at, workflow_run, workflow, agent_id, source}`.

```bash
.venv/bin/python mirror_holds.py            # public hold + business_day tables -> holds index (age_bd per hold); run by hand before the demo, the worker does not run it yet
.venv/bin/python setup_workflow.py          # validate-free upsert: list by name, delete when the stored YAML differs, POST /api/workflows {"workflows":[{"yaml"}]}
.venv/bin/python setup_workflow.py --run    # one manual run through Agent Builder's platform.core.execute_workflow, then the escalations count
.venv/bin/python setup_workflow.py --status <execution_id>
```

The Workflows API on this build has bulk create and bulk delete only (`docs/evidence/elastic/workflows_api_probe.txt`); runs and status go through the Agent Builder tools. Measured 2026-10-24: the first escalation lands about 90 s after the run starts, the agent step takes about 80 s per hold with tool calls. A new copy of the workflow also fires its scheduled trigger once on creation, so a recreate produces two runs.

## 9. How the worker consumes it

The worker passes the MCP endpoint to Droid's session config and sends only the Authorization header:

```ts
mcpServers: [{
  type: 'http', name: 'elastic',
  url: `${process.env.KIBANA_URL}/api/agent_builder/mcp`,
  headers: [{ name: 'Authorization', value: `ApiKey ${process.env.ELASTIC_API_KEY}` }],
}]
```

MCP exposes every Agent Builder tool in the project (there is no per-tool selection), so keep the project's tool list to the ones the investigator should see. To try the same endpoint from Claude Code:

```bash
claude mcp add --transport http dispatch "$KIBANA_URL/api/agent_builder/mcp" --header "Authorization: ApiKey $ELASTIC_API_KEY"
```

Tool results come back as `{"results": [{"type": "query", "data": {"columns": [...], "values": [[...]]}}]}`; `common.esql_rows` turns that into row dicts.

## Files

| Path | Purpose |
| --- | --- |
| `common.py` | `.env` loading, `KIBANA_URL` derivation, headers, `Client` with dry-run, redaction and friendly 401/403/404 messages, `esql_rows` |
| `mappings/*.json` | strict mappings for the four indices |
| `ingest.py` | idempotent index creation and bulk load of `seed/fixtures` |
| `tools/*.json` | the Agent Builder tool definitions (`find_trips_near`, `contract_rate_for_vendor`, `find_contract_clause`, `find_receipt_text`, `find_trips_near_ms`) |
| `setup_agent.py` | upserts the tools and the `dispatch-investigator` agent |
| `smoke.py` | executes all four tools and probes the MCP endpoint (`--mcp-key-env`, `--skip-tools` for the key proofs) |
| `make_mcp_key.py` | the least-privilege MCP key: role descriptors, `.env` line writer, `--write-from-stdin`, `--invalidate` |
| `mirror_holds.py` | mirrors the public `hold` table into the `holds` index with `age_bd` |
| `workflows/stale_holds.yaml`, `setup_workflow.py` | the stale-hold Workflow and its API upsert and manual run |
| `mappings/holds.json`, `mappings/escalations.json` | strict mappings for the two Workflow indices |
| `sample/` | 20 synthetic pings plus matching receipts, contracts and invoices, for parsing tests and dry runs |
| `tests/test_elastic.py` | offline pytest suite |
