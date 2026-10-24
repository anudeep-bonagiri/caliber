# Claims audit

Every claim in the README, the Devpost text and the video, with where it is made, what backs it, and a verdict: backed, softened, removed, or not verifiable. Run Sunday after the offline run. Backing must be a named test, a dated status entry, or a command run for the audit.

| # | Claim | Where | Backing | Verdict |
| --- | --- | --- | --- | --- |
| 1 | The kernel never calls a model | README Principles | `spacetimedb/src/kernel.ts` imports only `./thresholds`; grep for `fetch`, `http`, `anthropic` returns nothing | |
| 2 | Money is integer cents everywhere | README Principles | `t.i64()` on every cents column in `schema.ts`; kernel tests use bigint | |
| 3 | The agent identity cannot approve a payment | README Principles, video | `module.test.ts` roles scenario; live `try_approve_payment` with the agent token returns `[false, "agent may not do this"]` and writes an audit row | |
| 4 | The requester of a release cannot approve it | README Principles | `checkApprovePayment` in `index.ts`; module test SoD scenario | |
| 5 | Rules are backtested by the database before they are stored | README Principles | `backtest()` in `index.ts`, called inside `create_rule`; module test rules scenario | |
| 6 | A rule that would clear a confirmed exception is refused | README Principles | `create_rule` refusal `would clear`; module test | |
| 7 | Every refusal is in the audit trail with the caller's role | README Principles | `try_*` procedures; live audit rows dated 2026-10-24 | |
| 8 | Recall 1.0 on 52 planted exceptions | README What is measured | `docs/FACTS.json` `overall.recall` from the final run | |
| 9 | Precision at or above 0.95 | README What is measured | `docs/FACTS.json` `overall.precision` | |
| 10 | 6 decoys cleared with exactly one controller answer each | README What is measured | `docs/FACTS.json` `decoysClearedWithOneAnswer` | |
| 11 | Zero planted exceptions cleared by a rule | README What is measured | `docs/FACTS.json` `plantedClearedByRule` is empty | |
| 12 | 92 days replay in under 4 minutes | Tasks target | `scripts/run_days.ts` timing line from the final run | |
| 13 | The dashboard updates without refresh on a second laptop | Tasks target | observed at the table | |
| 14 | Droid runs with autonomy Off and only MCP tool calls allowed | README Where Droid runs | `worker/src/droid.ts` options block; SDK type names confirmed in `worker/README.md` | |
| 15 | Live Droid investigated hold 2231 and named truck 22 | video (only if live keys were used) | `seed/fixtures/investigations/2231.json` is hand-written unless `WORKER_MODE=record` ran; say "recorded" or "scripted" accordingly | |
| 16 | The Elastic tools work through the MCP endpoint | README Elastic | `elastic/smoke.py` output, only with a real project | |
| 17 | The agent is discoverable on ASI:One | README Agent addresses | Agentverse profile URL and address after registration | |
| 18 | The company is simulated and the key is published | README disclaimer | `seed/fixtures/answer_key.json` in the repo | |
