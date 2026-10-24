# Scoped API key for Droid's MCP entry (Task 26.1)

Why this is a hand step: on 2026-10-24 16:06 `elastic/make_mcp_key.py` sent `POST /_security/api_key` with the role descriptor below and the Serverless project answered

```
HTTP 400 illegal_argument_exception
creating derived api keys requires an explicit role descriptor that is empty (has no privileges)
```

`ELASTIC_API_KEY` is itself an API key, and Elasticsearch will not derive a key with privileges from another API key. A logged-in user can. Kibana's `POST /api/security/api_key` returned 404 on this project, so the UI is the path.

## Click path (Anudeep, logged in to the project)

1. Open the project in Kibana: `KIBANA_URL` from `.env` (the `.kb.` host), then the hamburger menu, **Stack Management** (Serverless calls it **Project settings** > **Management**), **API keys**.
2. **Create API key**.
3. Name: `caliber-droid-mcp`.
4. Turn on **Restrict privileges** (the toggle that opens the role descriptors JSON editor) and paste the JSON below, replacing what is there.
5. Leave expiration off (the project is deleted after the weekend). **Create API key**.
6. Copy the **Encoded** value once. Then in a terminal, without echoing it:

```bash
cd ~/dev/hackathons/dispatch-ledger/elastic
pbpaste | .venv/bin/python make_mcp_key.py --write-from-stdin
```

That writes exactly one line, `ELASTIC_MCP_API_KEY=...`, into `.env` (appended, or replaced when present) and prints only the length. Then run the proof:

```bash
.venv/bin/python smoke.py --mcp-key-env ELASTIC_MCP_API_KEY      # expect 200 and all four tools
```

## Role descriptor JSON (paste as the whole editor content)

```json
{
  "caliber_droid_mcp": {
    "cluster": [],
    "indices": [
      {
        "names": ["receipts", "contracts", "telematics_log", "invoices", "holds", "escalations"],
        "privileges": ["read", "view_index_metadata"]
      }
    ],
    "applications": [
      {
        "application": "kibana-.kibana",
        "privileges": ["feature_agentBuilder.read", "feature_actions.read"],
        "resources": ["space:default"]
      }
    ]
  }
}
```

What it can do: read six indices, list Agent Builder tools and call them over MCP. What it cannot do: write any index, create or edit tools or agents, read any other index, touch Workflows.

## The 403 proof (same login, two minutes)

Create a second key named `caliber-droid-mcp-noapp` with the same JSON minus the whole `"applications"` block. Paste it the same way but into a shell variable only:

```bash
NOAPP="$(pbpaste)"; .venv/bin/python smoke.py --skip-tools --mcp-key-env NOAPP_KEY 2>&1 | tail -3   # with NOAPP_KEY="$NOAPP" exported
```

Expected: `MCP initialize: HTTP 403` and the check FAILs, which is the point: the Kibana application privilege is the one that gates MCP. Then invalidate `caliber-droid-mcp-noapp` in the same API keys page (or `make_mcp_key.py --invalidate <id>` with its id).
