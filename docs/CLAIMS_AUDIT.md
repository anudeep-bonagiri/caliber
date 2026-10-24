# Claims audit

Every claim in the README, the Devpost text and the video, with where it is made, what backs it, and a verdict: backed, softened, removed, or not verifiable. Run Sunday after the offline run. Backing must be a named test, a dated status entry, or a command run for the audit.

| # | Claim | Where | Backing | Verdict |
| --- | --- | --- | --- | --- |
| 1 | The kernel never calls a model | README Principles | `spacetimedb/src/kernel.ts` imports only `./thresholds`; grep for `fetch`, `http`, `anthropic` returns nothing | backed |
| 2 | Money is integer cents everywhere | README Principles | `t.i64()` on every cents column in `schema.ts`; kernel tests use bigint | backed |
| 3 | The agent identity cannot approve a payment | README Principles, video | `module.test.ts` roles scenario; live `try_approve_payment` with the agent token returns `[false, "agent may not do this"]` and writes an audit row | backed |
| 4 | The requester of a release cannot approve it | README Principles | `checkApprovePayment` in `index.ts`; module test SoD scenario | backed |
| 5 | Rules are backtested by the database before they are stored | README Principles | `backtest()` in `index.ts`, called inside `create_rule`; module test rules scenario | backed |
| 6 | A rule that would clear a confirmed exception is refused | README Principles | `create_rule` refusal `would clear`; module test | backed |
| 7 | Every refusal is in the audit trail with the caller's role | README Principles | `try_*` procedures; live audit rows dated 2026-10-24 | backed |
| 8 | Recall 1.0 on 52 planted exceptions | README What is measured | `docs/FACTS.json` `overall.recall` from the final run | backed (1.0) |
| 9 | Precision at or above 0.95 | README What is measured | `docs/FACTS.json` `overall.precision` | backed (1.0) |
| 10 | 6 decoys cleared with exactly one controller answer each | README What is measured | `docs/FACTS.json` `decoysClearedWithOneAnswer` | backed (6 of 6) |
| 11 | Zero planted exceptions cleared by a rule | README What is measured | `docs/FACTS.json` `plantedClearedByRule` is empty | backed (0) |
| 12 | 92 days replay in under 4 minutes | Tasks target | `scripts/run_days.ts` timing line from the final run | backed (under 1 s of module time; 10 s cycle) |
| 13 | The dashboard updates without refresh on a second laptop | Tasks target | observed at the table | softened: dashboard and database listen on 127.0.0.1, so the second laptop runs ASI:One, not the dashboard |
| 14 | Droid runs with autonomy Off and only MCP tool calls allowed | README Where Droid runs | `worker/src/droid.ts` options block; SDK type names confirmed in `worker/README.md` | backed by types; live run not performed |
| 15 | Live Droid investigated hold 2231 and named truck 22 | video (only if live keys were used) | `seed/fixtures/investigations/2231.json` is hand-written unless `WORKER_MODE=record` ran; say "recorded" or "scripted" accordingly | removed from the video: the recordings are hand-written, labelled as such |
| 16 | The Elastic tools work through the MCP endpoint | README Elastic | `elastic/smoke.py` output, only with a real project | not verifiable without a Serverless project |
| 17 | The agent is discoverable on ASI:One | README Agent addresses | Agentverse profile URL and address after registration | pending registration |
| 18 | The company is simulated and the key is published | README disclaimer | `seed/fixtures/answer_key.json` in the repo | backed |
