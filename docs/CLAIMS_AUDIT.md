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
| 14 | Droid runs with autonomy Off and only MCP tool calls allowed | README Where Droid runs | `worker/src/droid.ts` options block; SDK type names confirmed in `worker/README.md` | backed: `worker/src/droid.ts` options block pasted in the README; the handler is subtractive (cancels write-like confirmations, lets MCP and read confirmations proceed once); 52 live investigations recorded 2026-10-24 with no Execute, Edit, Create or ApplyPatch call (PROJECT_STATUS 13:55 and 13:58) |
| 15 | Live Droid investigated hold 2231 and named truck 22 | README Hold 2231, video | `seed/fixtures/investigations/2231.json` recorded by `WORKER_MODE=record` on 2026-10-24 21:07Z; `find_trips_near` result names truck 22; replayed offline with the `replayed` badge and recordedAt | backed (recording; the offline demo replays it and says so) |
| 16 | The Elastic tools work through the MCP endpoint | README Elastic | all 52 recordings contain an `elastic___find_trips_near` or `elastic___contract_rate_for_vendor` tool call with a result; director's fresh run 2026-10-24 13:58 | backed |
| 17 | The agent is discoverable on ASI:One | README Agent addresses | Agentverse profile URL and address after registration | pending registration |
| 18 | The company is simulated and the key is published | README disclaimer | `seed/fixtures/answer_key.json` in the repo | backed |
| 19 | The six decoy recordings recommend hold_and_ask with a one-sentence question naming the driver | README What is real, Hold 2231 | `worker/tools/rerecord_decoys.mts` run 2026-10-24 21:07 to 21:09Z; each fixture has recommendation hold_and_ask, question_for_controller, evidence from find_trips_near and swap_log.txt; `worker/test/replay.test.ts` asserts it for 2231 | backed |
| 20 | Droid cost per investigation: 1,033 input, 1,354 output, 70,386 cache tokens, 25.6 s | README What is measured, DEVPOST, RESULTS | `docs/FACTS.json` worker_cost.perTask.avg, computed by scripts/facts.py from docs/evidence/cost_log_live_record_2026-10-24.jsonl (52 lines); cache is cacheCreationTokens plus cacheReadTokens and never folded into input | backed |
| 21 | Six decoy re-recordings cost 6,529 input, 7,036 output, 420,407 cache tokens | README What is measured | `docs/FACTS.json` worker_cost.decoyRerecord from docs/evidence/cost_log_decoy_rerecord_2026-10-24.jsonl (6 lines) | backed |
| 22 | The uAgent address is agent1qt278cr9luj7xw9cs6c47lnfl9tvx9xsu7asxtmhuqkcqq920m6ju5y5yge | README Agent addresses | printed by the running agent in logs/agent.log (4 times); derived from AGENT_SEED | backed; Agentverse registration and handle pending |
| 23 | A vendor with a CRS hit is rejected by the controller by hand; no auto-reject rule | README Vendor checks, JUDGE_QA | context/DECISIONS.md D-1; `create_rule` refuses vendor_bank_change (module test) | backed |
| 24 | The offline run's 47 investigations are replays of live recordings, 0 stand-ins | README What is real | `docs/FACTS.json` investigations.bySource {'replayed': 47}; every fixture note says live Droid run | backed |
