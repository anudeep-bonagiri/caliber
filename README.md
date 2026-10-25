# Caliber

Caliber, an autonomous accounts-payable clerk for a trucking carrier (repo caliber; the ledger and the local folder keep the name dispatch-ledger).

**The money does not move until the code has matched the line, and the agent can never approve what it proposed.**

Links: site https://caliber.compare, dashboard (local, see Run it), video (to come), Agentverse profiles `@caliber-controller` and `@caliber-investigator` (see Agent addresses).

> Simulated carrier with a published answer key. No real money: settlement goes to Capital One's Nessie mock bank. Every figure on screen and in this file is read from the ledger or from `docs/FACTS.json`. Not for operational use.

![tag:innovationlab](https://img.shields.io/badge/innovationlab-3D8BD3)
![tag:hackathon](https://img.shields.io/badge/hackathon-5F43F1)

## What it does

An autonomous accounts-payable clerk for a 40-truck carrier. It matches every fuel, toll and maintenance charge against telematics and contracts in plain code, pays clean lines, holds the rest, hands each hold to an investigator (Factory's Droid over Elastic Agent Builder tools when keys are present; the recordings of that live run offline, labelled as such), asks the fleet controller one question when it cannot decide (in ASI:One, or in the terminal twin that runs the same code), and turns the answer into a scoped rule that the database backtests before it is stored. All state and every permission check live in one SpacetimeDB module.

### Principles

- **Code first.** The kernel (`spacetimedb/src/kernel.ts`) is pure TypeScript with integer cents. It never calls a model.
- **Agents for judgment.** Droid investigates and recommends. Its output type has no `pay`.
- **No agent is trusted.** Three identities (seed, agent, controller) in a `role` table; every reducer checks the caller first; the agent cannot approve, and the requester of a release cannot approve it either.
- **Ask once.** A controller answer becomes a rule with a scope and an expiry. The database backtests it before it is stored and refuses any rule that would clear a confirmed exception.
- **Audit-ready.** Every action is an `audit_event` row with the actor's role. Refusals persist when the action goes through the `try_*` procedures, which is how the agent, the scripts and the demo call the module; a reducer refusal rolls back with its transaction and only the caller sees the message.

### Hold 2231, the worked case

| | |
| --- | --- |
| Transaction | Fuel, 120.0 gal, $412.00, Love's 412, Schulenburg TX, business day 41 |
| Card | FC-1017, assigned to truck 17 |
| Telematics | Truck 17 parked at the San Antonio terminal, engine off, 97 miles away |
| Kernel | `location_mismatch` (threshold 25 miles). Hold raised, task opened |
| Investigator | Recorded from a live Droid run on 2026-10-24 and replayed offline with the badge `replayed`: `find_trips_near` names truck 22 at the pump within the window; `swap_log.txt` line 8: Ortiz moved to unit 22, unit 17 in the shop. Every quote is verified against its source file or tool result before it is written. Recommendation `hold_and_ask`, confidence 0.97 |
| Question to the controller | Can Ramon Ortiz or the San Antonio dispatcher confirm that Ortiz used FC-1017 to fuel truck 22 for transaction 2231 while truck 17 was in the shop under PO-1026? |
| Answer | Yes. Ortiz drove relief unit 22 that week while unit 17 was in the shop, per the swap log |
| Rule | `location_mismatch`, scope driver 23, days 41 to 46, one-time. Backtest by the module: would clear 1 past row, 0 confirmed exceptions |
| Verdict | The controller approves the rule (ASI:One at the table; `scripts/controller_sim.py` in the measured run, which reads only the public tables and the dispatcher's swap log); the kernel re-runs and clears 2231; the payment row is written with role `rule` |

### What is measured

`scripts/facts.py` writes `docs/FACTS.json`, `docs/FACTS.md` and `docs/RESULTS.md` from the public tables and the answer key; the tables below are copied from that output and say when. Last run 2026-10-25T00:22:27+00:00, 7944 transactions over 92 business days, produced by `scripts/full_run.sh` (fresh publish, fixtures, worker in replay, 92 days, the agent identity asking to approve INV-1077, the scripted controller pass, facts).

#### Benchmark at a glance

Same 558 rows (all 52 planted errors, all 6 decoys, 500 clean rows), same records, one attempt per row, the prompt listing the codes and thresholds; the kernel's line is the full 7,944-row run. Costs are Anthropic list rates; latency is the median per row from the committed outputs in `bench/outputs/`.

| System | Precision | Recall | False holds | Model calls per paid line | Cost for the 558 rows | Median per row |
| --- | --- | --- | --- | --- | --- | --- |
| Caliber kernel | 1.00 | 1.00 | 0 | 0 | $0, plain code | 41 business days in 0.2 s |
| Caliber on a hold (Droid, recorded live run) | not a classifier | | | 1 per hold, 52 holds | 2,016,204 Factory credits | 25.6 s per hold |
| Claude Sonnet 5.5 alone | 1.00 | 1.00 | 0 | 1 | $6.38 | 3.0 s |
| Claude Opus 5.5 alone, default effort | 0.81 | 1.00 | 14 | 1 | $12.85 | 3.5 s |
| asi1-mini alone, free plan | 0.31 | 0.81 | 101 | 1 | $0 on the free plan | 9.1 s, paced to the quota |

At this carrier's volume (7,944 rows a quarter) the model-alone clerks cost about $91 (Sonnet) and $183 (Opus) a quarter at list; the kernel costs nothing per line and spends Droid credits on the holds only. A kernel decision is an audit row with its source rows on it; a model's hold-or-clear answer is a sentence. Caveats: synthetic rows from our own generator, a hinted prompt, the kernel measured on the full run and the models on the sample, each model at its API default effort (Sonnet high, Opus medium).

| Code | Planted | Raised | Precision | Recall |
| --- | --- | --- | --- | --- |
| location_mismatch | 20 | 20 | 1.0 | 1.0 |
| capacity_exceeded | 6 | 6 | 1.0 | 1.0 |
| rate_variance | 9 | 9 | 1.0 | 1.0 |
| duplicate_toll | 11 | 11 | 1.0 | 1.0 |
| duplicate_invoice | 4 | 4 | 1.0 | 1.0 |
| vendor_bank_change | 3 | 3 | 1.0 | 1.0 |
| short_received | 5 | 5 | 1.0 | 1.0 |

| Metric | Result |
| --- | --- |
| Overall precision and recall on the 58 answer-key rows (52 planted exceptions and 6 decoys) | 1.0 and 1.0 |
| Decoys (legitimate unit swaps) cleared through an approved rule after exactly one controller answer | 6 of 6 |
| Planted exceptions cleared by a rule | 0 |
| Policy holds from the auto-pay limit (correct behaviour, not exceptions) | 6 |
| Auto-paid by the kernel or a rule | 7886 payments, $1,083,630.52 |
| Released by the controller | 8 payments, $32,097.00 |
| Refusals in the audit trail, by role | {'agent': 1} |
| Investigations by source in the offline run | {'replayed': 47} |
| Droid cost per investigation, from the recorded live run of 2026-10-24, 52 investigations | 1,033 input tokens, 1,354 output tokens, 70,386 cache tokens (cacheCreationTokens plus cacheReadTokens), 25.6 s; 2,016,204 Factory credits for the 52 |
| Droid cost of the six decoy re-recordings (2026-10-24, now the fixtures) | 6,529 input tokens, 7,036 output tokens, 420,407 cache tokens (cacheCreationTokens plus cacheReadTokens) in total; 196,074 Factory credits |

The whole offline cycle runs in about ten seconds.

### How it works

1. `seed/generate.py` renders the company and plants 52 exceptions and 6 decoys, writing `seed/fixtures/answer_key.json`. In the demo path only `scripts/facts.py` reads the key; the generator's own mirror and the seed tests read it to prove the generator, and nothing in `spacetimedb/`, `worker/`, `agent/` or `web/` can.
2. `scripts/load_fixtures.ts` loads the rows through `seed_*` reducers as the seed identity (SpacetimeDB).
3. `advance_day`, a scheduled reducer, ticks every 2 seconds and runs `matchDay`: the kernel evaluates every row dated that day and writes `match_result`, then a `payment` or a `hold` plus an `agent_task` (SpacetimeDB).
4. `worker/` holds the agent identity, claims tasks with a version-locked `claim_task`, and runs Droid with scoped tools over the evidence folder and the Elastic MCP endpoint when `FACTORY_API_KEY` is set; offline it replays the 52 recordings of the 2026-10-24 live run (the six decoys re-recorded the same day so the investigator asks instead of clearing) and writes a deterministic stand-in for any task without a recording, labelled `scripted stand-in, not a model` on the card (Factory, Elastic).
5. The controller talks to a uAgent on ASI:One: list holds, ask why, answer, approve a rule, approve a payment. Each is a `try_*` procedure call with the controller token (Fetch.ai).
6. `create_rule` backtests inside the database; `approve_rule` re-runs the kernel on the source transaction; the dashboard, subscribed anonymously to the public tables, shows all of it live (SpacetimeDB).

## Seats it fills

The AP clerk who matches and codes bills. It asks the fleet controller, who approves payments, and never sits in that seat.

## What is real and what is simulated

Is the company real? No. It is generated by us, with a published answer key. Only `scripts/facts.py` and `bench/` read that key (`bash bench/carrierbench/key_readers.sh` lists every file that names it); the rule backtest reads `match_result` and `hold` rows and counts as confirmed exceptions only holds the controller has rejected, and a planted count appears on a rule card only under the BENCHMARK chip.

<!-- honesty:start -->
What is live: the module, the kernel, the clock, the roles and refusals, the dashboard subscriptions, the controller agent against the local database, the rule backtest. What is simulated: the company, the money, the vendors. What is replayed or scripted in the offline demo: the investigator's findings, labelled on every card. In the measured run of 2026-10-25T00:22:27+00:00, 0 investigations were produced by a live model, 47 replayed recorded findings, and 0 were scripted stand-ins, each labelled on its card. The audit trail recorded 1 refusal through the `try_*` procedures in that run, all by the agent role. Not built: `docs/not-built.md`. Everything fails toward no money moving.
<!-- honesty:end -->

The 47 replayed findings are the recordings in `seed/fixtures/investigations/`, each written by `WORKER_MODE=record` from a live Droid run on 2026-10-24 and carrying `recordedAt`; the card says "replayed from a recording made 2026-10-24 by droid live run". The previous six decoy recordings, which recommended `clear` without a question, are kept under `seed/fixtures/investigations/_v1/` and are not served.

### Connectors

One connector exists, a file connector: `scripts/ingest_watch.py` watches `inbox/` for a WEX-style fuel-card CSV, a toll statement CSV and a maintenance invoice CSV (layouts in `docs/CONNECTORS.md`) and hands the rows to the `ingest_rows` reducer, which matches them through the same path the clock uses. The three sample files in `seed/fixtures/inbox/` carry the full seeded dataset, so `scripts/full_run.sh --inbox` reproduces the seeded facts apart from timestamps. API connectors are not built.

## Measurement

**Model baseline.** On a 558-row sample (all 52 planted errors, all 6 decoys, 500 clean rows) given the same records the kernel reads, Claude Sonnet 5.5 alone tied the kernel on every code: precision 1.00, recall 1.00, 58 of 58 held, 0 false holds. Claude Opus 5.5 alone, at its API default effort, tied the kernel on 4 of 7 codes and matched its recall everywhere (1.00) but held 14 clean rows, 10 of them as rate variance, for precision 0.81 overall (0.47 on rate variance, 0.62 on short received, 0.95 on location mismatch); 558 of 558 rows answered, $12.85 at list rates. asi1-mini alone scored precision 0.31, recall 0.81 (0.33 / 0.84 counting any hold), holding 101 clean rows, 82 of them as duplicate tolls. Caveat: synthetic data from the same generator as the clean rows, identical inputs, no fine-tuning; the kernel's precision was measured on all 7,944 rows, the models' on the sample; the kernel is plain code with no model call, the Sonnet run cost $6.38. Table, prompt and raw outputs: `bench/BASELINE.md`.

The technical note [docs/paper/caliber.pdf](docs/paper/caliber.pdf) (IEEE two-column, 4 pages, authors Anudeep Bonagiri and Shrithik Senthilkumar) puts the measurement in one place; `make -C docs/paper` rebuilds it from `docs/paper/caliber.tex`, and every number in it is generated into `numbers.tex` by `docs/paper/numbers.py` from `docs/FACTS.json`, `bench/BASELINE.json` and `bench/carrierbench/*.json`, none typed. CarrierBench (`python3 bench/carrierbench/carrierbench.py --seed 42`, how to run it in `bench/README.md`) is the synthetic carrier as a benchmark: 7,944 payable rows over 92 business days with 52 planted errors in 7 classes and 6 decoys, regenerated byte for byte from seed 42 (checked), with a machine audit in which the kernel's Python mirror raised 58 of 58 answer-key rows from the row's own evidence and nothing outside the key. The model-only baseline (`bench/BASELINE.md`) gave Claude Sonnet 5.5, Claude Opus 5.5 and asi1-mini exactly the records the kernel sees for 558 rows, one hinted prompt, and scored them against the answer key: code-exact precision / recall Caliber 1.00 / 1.00, Claude Sonnet 1.00 / 1.00, asi1-mini 0.31 / 0.81 (synthetic data from the same generator, identical inputs, no fine-tuning; ties or wins against the kernel: Claude Sonnet tied the kernel on 8 of 8 rows of the table (location_mismatch, capacity_exceeded, rate_variance, duplicate_toll, duplicate_invoice, vendor_bank_change, short_received, overall); asi1-mini tied the kernel on 1 of 8 rows of the table (short_received); no model beat it on any code). The oracle run (`bench/carrierbench/oracle.py`), the kernel handed the answer key, posts 7,886 payments without a person and still needs 47 human decisions; the measured run posts the same 7,886 and differs from the ceiling only by the 6 questions asked on the decoys. The saboteur run (`spacetimedb/src/saboteur.test.ts`, output in `bench/carrierbench/saboteur.json`) feeds a finding that recommends release at confidence 0.99 with fabricated evidence through the real reducers for 2 planted holds: `approve_payment` as the agent identity is refused on both entry points, 0 payment rows are created, the hold stays `awaiting_controller`, and the 2 refusals are audit rows.

## Where Droid runs

`worker/src/droid.ts`, the `createSession` options block quoted verbatim from the code between its `BEGIN` and `END` comments:

```ts
  // BEGIN createSession options (quoted verbatim in README.md)
  return {
    cwd: opts.evidenceDir,                                   // seed/fixtures/evidence; read-only by the OS, not by Droid
    autonomyLevel: AutonomyLevel.Off,                        // Off: MCP calls ask the handler; Read, Grep, Glob, LS run without asking
    disabledToolIds,                                         // ['Execute', 'Edit', 'Create', 'ApplyPatch'] plus listTools() edit/execute ids; subtractive, no allowlist in TS
    systemPrompt: { type: 'preset' as const, preset: 'droid' as const, append: SYSTEM_PROMPT_APPEND },
    mcpServers,                                              // Elastic Agent Builder MCP only when KIBANA_URL and a key are set; the key is ELASTIC_MCP_API_KEY (least privilege) when present, else ELASTIC_API_KEY
    permissionHandler({ toolUses, options }: RequestPermissionRequestParams) {
      // Subtractive: anything that writes, executes, escalates or asks a human is cancelled; MCP tool calls and
      // read-only confirmations proceed once. Read and Grep need no confirmation at all in autonomy Off.
      const WRITE_LIKE = new Set<string>([
        ToolConfirmationType.Edit, ToolConfirmationType.Execute, ToolConfirmationType.Create, ToolConfirmationType.ApplyPatch,
        ToolConfirmationType.AskUser, ToolConfirmationType.ExitSpecMode, ToolConfirmationType.RecommendMission,
        ToolConfirmationType.ProposeMission, ToolConfirmationType.StartMissionRun,
        ToolConfirmationType.SandboxViolation, ToolConfirmationType.DroidShieldViolation,
      ]);
      const details = toolUses.flatMap(u => (u.details.type === ToolConfirmationType.Script ? u.details.calls.map(c => c.confirmation) : [u.details]));
      const blocked = details.length === 0 || details.some(d => WRITE_LIKE.has(d.type as string));
      const want = blocked ? ToolConfirmationOutcome.Cancel : ToolConfirmationOutcome.ProceedOnce;
      const names = toolUses.map(u => `${u.toolUse?.name ?? '?'}:${u.details.type}`).join(', ');
      opts.steps?.push({ type: 'note', at: nowIso(), text: `permission ${want === ToolConfirmationOutcome.Cancel ? 'cancelled' : 'proceed once'}: ${names}` });
      return options.some(o => o.value === want) ? want : ToolConfirmationOutcome.Cancel;
    },
    abortSignal: ac.signal,                                  // 90 s AbortController; there is no timeout option
  };
  // END createSession options
```

The prompt is streamed with `session.stream(prompt, { outputFormat: { type: OutputFormatType.JsonSchema, schema: FINDING_SCHEMA } })`; the `result` message carries `structuredOutput`, `tokenUsage` and `durationMs`, and every `tool_call`, `tool_result` and `assistant` message is kept as a step the dashboard renders. The structured output goes through a zod gate (`worker/src/finding.ts`) whose `recommendation` is one of `clear`, `hold`, `hold_and_ask` and nothing else, and every evidence quote is checked against its file or tool result before the write.

`session.listTools()` on 2026-10-24 returned these ids (`docs/evidence/droid_listTools_2026-10-24.txt`); the ones marked disabled are off for every session, and the worker adds any allowed tool in the `edit` or `execute` category to `disabledToolIds` on startup:

```
ApplyPatch (disabled), AskUser (disabled), ConnectApp (disabled), CreateAutomation (disabled), DeleteAutomation (disabled), DismissHandoffItems (disabled), EditAutomation (disabled), elastic___contract_rate_for_vendor, elastic___find_trips_near, elastic___platform_context_engine_install_automation_template, elastic___platform_core_execute_esql, elastic___platform_core_execute_workflow, elastic___platform_core_generate_esql, elastic___platform_core_generate_workflow, elastic___platform_core_get_document_by_id, elastic___platform_core_get_index_mapping, elastic___platform_core_get_workflow_execution_status, elastic___platform_core_index_explorer, elastic___platform_core_list_indices, elastic___platform_core_list_inference_endpoints, elastic___platform_core_list_workflow_executions, elastic___platform_core_product_documentation, elastic___platform_core_resume_workflow_execution, elastic___platform_core_search, elastic___platform_workflows_get_connectors, elastic___platform_workflows_get_examples, elastic___platform_workflows_get_step_definitions, elastic___platform_workflows_get_trigger_definitions, elastic___platform_workflows_get_workflow, elastic___platform_workflows_validate_workflow, elastic___platform_workflows_workflow_execute_step, EndFeatureRun (disabled), Execute (disabled), ExitSpecMode (disabled), FetchUrl (disabled), GenerateDroid (disabled), GenerateImage (disabled), Glob, Grep, ListAutomations (disabled), ListAutomationTemplates (disabled), Loop (disabled), LS, ProposeMission (disabled), Read, ReadAutomation (disabled), RunAutomation (disabled), Script, Skill (disabled), StageSettingsChanges (disabled), StartMissionRun (disabled), Task (disabled), TaskOutput (disabled), TaskStop (disabled), TodoWrite (disabled), ToolSearch, WaitForScript, WebSearch (disabled)
```

Droid 0.249 runs tools through `Script` and loads MCP tools with `ToolSearch`, so both stay enabled; the handler decides per confirmation inside a script. Honesty note: Droid's `Read` is not confined to `cwd` (in one recorded run, 770003, it read `~/AGENTS.md` above the evidence folder; nine other probes found nothing); the OS, not the session options, is the real boundary. See `docs/not-built.md` and `worker/README.md`.

## Agent addresses

![tag:innovationlab](https://img.shields.io/badge/innovationlab-3D8BD3)
![tag:hackathon](https://img.shields.io/badge/hackathon-5F43F1)

| Name | Handle | Address | Role | Code |
| --- | --- | --- | --- | --- |
| caliber-controller | `@caliber-controller` | `agent1qt278cr9luj7xw9cs6c47lnfl9tvx9xsu7asxtmhuqkcqq920m6ju5y5yge` | controller seat (approve, answer, reject, rules; writes only for senders on the allowlist) | `agent/` |
| caliber-investigator | `@caliber-investigator` | `agent1qvwvlc0vz2amjh4q4yf0p2fglqrzw2rmfm6afrsq82e8lq5df7yyxnrxaqh` | read-only investigator (`reader` identity; answers `why <id>` and `status`) | `agent/investigator.py` |

The addresses are derived from `AGENT_SEED` and `INVESTIGATOR_SEED` and are fixed; they are the ones the running agents printed in `logs/agent.log` and `logs/investigator.log`. Both agents speak the Chat Protocol and run the same handlers as the terminal CLI (`python3 -m agent.cli "..."`). The agent that explains cannot pay: the reader role is refused by `approve_payment` and the refusal is an audit row. Commands and reply shapes are in `agent/README.md` and `agent/INVESTIGATOR_README.md`.

**Discord feed.** `scripts/discord_feed.py` mirrors the public `audit_event` table into a Discord channel through an incoming webhook (`DISCORD_WEBHOOK_URL` in `.env`), and into a Slack channel the same way when `SLACK_WEBHOOK_URL` is set (same lines, Slack's own payload and limits): one plain line per audit row, such as `hold 2231 opened: location_mismatch, $412.00, day 41`, `approve_payment INV-1075 by controller, $2,450.00, day 41` or `settled INV-1075: bank id <id>, day 41`, posted within a few seconds of the row and at most one message every two seconds. It is outbound only and read-only: it reads as the `reader` identity, never calls a reducer, never touches a private table, and nothing typed in Discord or Slack reaches the ledger. A finding that comes from a recording is labelled `replayed` in its line, as it is on the card. Approving or answering from Discord or Slack is not built; writes go through ASI:One or the terminal twin, gated by the sender allowlist and the reducers. With neither URL set the script prints one labelled line and exits.

## Elastic

Four indices on a Serverless project (`my-elasticsearch-project-b5e003`): `telematics_log` (154,846 `geo_point` pings with `@timestamp`), `receipts` and `contracts` (with JINA `semantic_text`), `invoices` (`elastic/mappings/`). Depth: four hand-written ES|QL tools in Agent Builder (`elastic/tools/`), two exact (`find_trips_near` with date params and a point built in the query from lat and lon, `contract_rate_for_vendor`) and two semantic (`find_contract_clause`, `find_receipt_text`), created over the API by `elastic/setup_agent.py`, executed by `elastic/smoke.py`, and reached by Droid over the MCP endpoint `{KIBANA_URL}/api/agent_builder/mcp`. Every recorded run used the project API key. A least-privilege key (`elastic/make_mcp_key.py`: read and view_index_metadata on six indices plus the Kibana Agent Builder and actions read features, as elastic/make_mcp_key.py requests) is prepared, and the worker sends it as `ELASTIC_MCP_API_KEY` when it exists; it does not exist yet, because Serverless refused to derive it from the project key and the Kibana UI step is pending (`docs/evidence/elastic/scoped_key_request.md`). JINA: `clause_semantic` and `body_semantic` are `semantic_text` fields on `.jina-embeddings-v5-text-small`, and the two semantic tools run `MATCH(...)` against them with the investigator's plain-language question; the recorded INV-1003 investigation (`seed/fixtures/investigations/INV-1003.json`) contains the live `elastic___find_contract_clause` call and quotes the clause it returned. Agent Builder and Workflows: the agent `dispatch-investigator` owns the four tools, and the Workflow `caliber-stale-holds` (`elastic/workflows/stale_holds.yaml`, registered by `elastic/setup_workflow.py`, manual trigger only since 2026-10-24) reads the `holds` index that `elastic/mirror_holds.py` copies from the ledger, asks the agent for a brief on every hold open more than two business days, and writes it to the `escalations` index that the controller agent's `status` reply reads (`agent/reads.py`). Serverless: everything above ran on the Serverless project on 2026-10-24 (context/PROJECT_STATUS.md, 17:20 entry; screenshots in docs/evidence/elastic/). Elastic is not the system of record and not the dashboard's data source.

The Workflow `caliber-stale-holds` (id `caliber-stale-holds-5`, `elastic/workflows/stale_holds.yaml`) runs on a manual trigger only: we removed its hourly schedule on 2026-10-24 because the `holds` index changes only when `elastic/mirror_holds.py` runs by hand, so hourly runs re-briefed the same holds and spent the Elastic trial model quota, and a guard that skips holds already briefed since the last mirror is in the YAML but has not yet completed a run, because the trial quota returned 429.

## Vendor checks

On a `vendor_bank_change` hold, and on a vendor's first invoice, nothing inside the carrier's data can say whether the vendor is who it claims to be. The module inserts an `agent_task` of kind `vendor_check` for both, and the worker (`worker/src/vendor_check.ts`, client in `worker/src/crs.ts`) asks the CRS Credit API three things about the business:

- business credit (`crs:business_credit`)
- public records: liens, judgments, bankruptcy (`crs:public_records`)
- OFAC screen (`crs:ofac`)

Only the vendor's business name goes out. No consumer credit, no driver or person data is ever sent. The result is rule-based, not a model: clean on all three suggests approve, which writes `hold` with the question "Vendor check clean: approve with a call-back note?"; any hit or failed call suggests escalate (an OFAC match suggests reject), which writes `hold_and_ask` with "Vendor has <reasons>; reject or call back?". The agent never rejects on its own, and `approve_payment` still demands a call-back note on a bank-change hold. A vendor with a hit is rejected by the controller by hand, from ASI:One or the terminal, with the audit row; there is no auto-reject rule, because rules only ever clear and the module refuses rules on bank-change holds (context/DECISIONS.md, D-1).

Live calls need `CRS_USERNAME` and `CRS_PASSWORD` and `WORKER_MODE` of `live` or `record` (the Droid key does not gate them); `record` also writes the raw responses to `seed/fixtures/vendor_checks/<vendorId>.json`. Without them the worker replays `seed/fixtures/vendor_checks/<vendorId>.<trigger>.json` or `<vendorId>.json` (trigger is `bank_change` or `first_invoice`): a recorded sandbox response (`recorded: true`) is labelled `REPLAYED (recorded live)`; a hand-authored file carries the source `fixture:hand-authored (CRS sandbox pending)` on every evidence row and the amber `FIXTURE` chip on the card, never `REPLAYED`. With no file at all the worker writes a stand-in that says "Scripted stand-in, not a vendor check" with recommendation escalate and confidence 0. `CRS_DRY_RUN=1` prints the requests with credentials redacted and sends nothing. The dashboard shows a "Vendor check" block under the investigation with the three rows, the recommendation and a live, REPLAYED, FIXTURE or stand-in badge.

Sandbox caveat: the CRS account is a sandbox, so a live answer is sandbox data, not a real report on a real company. The CRS hit has not been produced by the sandbox yet; the hit vendor's check (vendor 1, `1.bank_change.json`, a public-records judgment) is a hand-authored fixture labelled FIXTURE on the card and in every evidence row, and the clean checks for vendors 1, 3 and 5 are hand-authored the same way (context/DECISIONS.md, D-3). The three endpoint paths and request bodies are pending the sandbox collection: they sit in `CRS_ENDPOINTS` in `worker/src/crs.ts`, marked `TODO(crs-sandbox)`.

## Settlement

Verified live on 2026-10-24: an auto-paid fuel line produced one transfer on the carrier's Nessie account with the id on the payment row and in the audit feed. The mock bank accepts whole-dollar amounts only, so the exact cents and the payee ride in the transfer description.

When a payment row appears (kernel auto-pay, a rule clearing a hold, or a controller approval), the worker's settlement watcher (`worker/src/settle.ts`) makes one call to Capital One's Nessie per payment: a transfer from the carrier's Checking account to the payee (the invoice's vendor, or a single fuel-and-tolls payee for card and toll payments) described as `txn_ref <ref>`. It writes the returned transfer id with `record_settlement(txnRef, bankTxnId)`, an agent-only reducer that refuses without a payment row or when the payment is already settled, sets `payment.bank_txn_id` and adds a `settle` audit row the dashboard shows as "paid, bank id <id>". Live settlement needs `NESSIE_API_KEY`, `WORKER_MODE` other than `replay`, and the accounts `scripts/nessie_seed.py` writes to `seed/fixtures/nessie_accounts.json`; otherwise the id is `offline-<txnRef>` and the Queue says "settlement offline". The worker can settle a payment but never create one. Nessie is a mock bank: no money moves, and a bank id proves only that the mock recorded the transfer.

## SpacetimeDB

Module in `spacetimedb/src/`. Tables and access in `schema.ts`; reducers, procedures and the kernel driver in `index.ts`; thresholds in `thresholds.ts`. Three identities are minted with `POST /v1/identity` and granted by `grant_role`: `seed` loads fixtures, `agent` is the worker and can never approve, `controller` is the ASI:One agent and the terminal CLI. The segregation-of-duties check is `checkApprovePayment` in `index.ts`: the role check runs first, then the requester check (whoever raised the hold cannot release it), then the call-back note on a bank change. `audit_event` has no update or delete reducer.

## Run it

Tests first. The root `npm ci` is the first step; `scripts/demo_up.sh` performs it and creates `agent/.venv` when either is missing, which needs the network the first time:

```
npm ci && (cd spacetimedb && npm ci && npx vitest run)
(cd worker && npm ci && npm test)
python3 -m venv seed/.venv && seed/.venv/bin/pip install -r seed/requirements.txt && seed/.venv/bin/python -m pytest -q seed
python3 -m venv agent/.venv && agent/.venv/bin/pip install -r agent/requirements.txt && agent/.venv/bin/python -m pytest -q agent
python3 -m venv elastic/.venv && elastic/.venv/bin/pip install -r elastic/requirements.txt && elastic/.venv/bin/python -m pytest -q elastic
```

Then the demo month, no model calls, no network. `demo_up.sh` builds the web app and serves the production build with `vite preview` on http://127.0.0.1:5173 ("/" the controller's view, "/console" the dashboard); the Vite dev server trails the ledger at the demo's 0.5 s tick, so the table never runs it:

```
scripts/demo_up.sh
scripts/clock.sh run
agent/.venv/bin/python -m agent.cli "what needs me"
python3 scripts/facts.py
```

Or start with data arriving: `scripts/demo_up.sh --inbox`, then `cp seed/fixtures/inbox/fuel_card_wex_sample.csv inbox/`; hold 2231 appears about one second after the copy once the clock is on day 41.

`scripts/full_run.sh` is the measured cycle (fresh publish, fixtures, worker in replay, 92 days, scripted controller pass, facts); `scripts/rehearse.sh` walks the judging runbook from a cold start.

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `STDB_URI`, `STDB_DB` | yes | local server and database name |
| `STDB_SEED_TOKEN` | yes | the publisher; loads fixtures |
| `STDB_AGENT_TOKEN` | yes | the worker; can never approve |
| `STDB_CONTROLLER_TOKEN` | yes | the ASI:One agent and the terminal CLI |
| `WORKER_MODE` | yes | `replay` for the offline demo, `record` or `live` with keys |
| `FACTORY_API_KEY` | live only | Droid SDK |
| `ELASTICSEARCH_URL`, `ELASTIC_API_KEY`, `KIBANA_URL` | live only | Serverless project and Agent Builder MCP |
| `ANTHROPIC_API_KEY` | optional | rule drafting and explanations; templates otherwise |
| `ASI_ONE_API_KEY`, `AGENT_SEED`, `AGENT_PORT` | agent | ASI:One free-text classification and the agent's address |
| `CRS_USERNAME`, `CRS_PASSWORD` | live only | CRS sandbox login for the vendor check (business entity only; nothing on people) |
| `NESSIE_API_KEY`, `NESSIE_BASE` | live only | Capital One Nessie mock bank; one transfer per approved payment, `offline-<txnRef>` without a key |

`scripts/demo_up.sh` exports every model key as empty on purpose so the offline run cannot make a paid call.

### Repo map

| Path | What |
| --- | --- |
| `spacetimedb/` | the module: schema, kernel, reducers, procedures, tests |
| `module_bindings/` | generated client bindings, committed |
| `worker/` | Droid investigator, replay, rule drafting, vendor check, settlement |
| `agent/` | uAgent for ASI:One and its terminal twin |
| `web/` | read-only live dashboard |
| `elastic/` | mappings, ingest, Agent Builder tools and agent |
| `seed/` | generator, planted errors, answer key, evidence, recorded investigations |
| `scripts/` | demo_up, full_run, rehearse, clock, inject, facts, honesty, load_fixtures, mint_identities |
| `docs/` | CONTRACT.md, FACTS.json, RESULTS.md, RUNBOOK.md, DEVPOST.md, not-built.md, evidence/ |
| `context/` | PROJECT_STATUS.md, DECISIONS.md, JUDGE_QA.md, CLAIMS_AUDIT.md |

## Not built

"Not built" is a complete answer. The list is in [`docs/not-built.md`](docs/not-built.md): no real connectors, no payment execution beyond the mock bank, no OCR, no hard sandbox around Droid, CRS live calls pending the sandbox collection, and the rest.

## Team

Anudeep Bonagiri (UTSA, founder of Cruze) with review by Shrithik.
