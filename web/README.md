# Caliber dashboard

Read-only operations console for the simulated carrier. It subscribes to the public tables of the `dispatch-ledger` SpacetimeDB module with an anonymous identity and never calls a reducer. Approvals, answers and the clock are driven from ASI:One or the terminal.

## Run

```
cp .env.development .env.local   # optional, edit if the database is elsewhere
npm install
npm run dev                      # http://localhost:5173
npm run build                    # dist/
npm run typecheck
```

`VITE_STDB_URI` (default `http://127.0.0.1:3100`) and `VITE_STDB_DB` (default `dispatch-ledger`) come from `.env.development`. The root `.env` is not read by Vite.

## How it connects

`src/stdb.ts` builds one `DbConnection.builder()` from `../module_bindings` with the anonymous token cached in `localStorage` under `${uri}/${db}/auth_token`. `src/main.tsx` wraps the app in `SpacetimeDBProvider` from `spacetimedb/react`. `src/App.tsx` calls `useTable(tables.x)` once per public table (`business_day`, `hold`, `agent_task`, `rule`, `day_total`, `audit_event`, `match_result`, `payment`); each call registers its own subscription and re-renders on every committed transaction. The top bar reads `useSpacetimeDB()` for the connection state and identity.

The module identity, used to label a hold's requester as `kernel` or `agent`, comes from `GET {uri}/v1/database/{db}` at load.

## Panels

1. Day clock from `business_day`, with the paused or running pill and the tick interval. No pause control here.
2. Queue: holds grouped by code with count and dollar total per group. Released, rejected and cleared-by-rule holds collapse into a resolved section. Clicking a hold selects it.
3. Investigation for the selected hold: the brief, the agent steps as tool call and tool result pairs, the finding, evidence quotes, recommendation and confidence. The badge reads `live`, `replayed` or `scripted stand-in, not a model` from `agent_task.source` and `finding.status`.
4. Rules with scope, condition, window, uses, status and the backtest line. Candidates are highlighted as waiting for the controller.
5. Ledger of trust: counters for today from `day_total` and the newest 300 `audit_event` rows. `refused` rows are marked.

Two charts read `/FACTS.json` (copy `docs/FACTS.json` into `public/`). A `model offline` pill appears when the newest investigated task has `source = none`.

Every number carries its source row id in its `title` attribute, so hovering shows `hold 2231`, `day_total day 41`, `audit_event 1182` and so on.
