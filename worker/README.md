# worker

The autonomous accounts-payable clerk's hands. It is the only process that holds the `agent` identity and the Factory and Elastic keys. It claims investigation tasks from the SpacetimeDB module, runs Factory's Droid SDK (or replays recorded findings offline), drafts and backtests rules, and writes results back through role-checked reducers.

It can never approve anything. `approve_payment` and `approve_rule` refuse the `agent` role in the module, and the worker has no code path that calls them.

## What the worker may and may not do

May:

- `claim_task(id, version)` on an open `agent_task` (version-locked; a lost race is logged as "another worker won").
- `record_investigation(id, stepsJson, findingJson, recommendation, question, source)` on a task it claimed. `recommendation` is `clear`, `hold`, `hold_and_ask`, `done` or `timeout`.
- `create_rule(...)` as a `candidate` rule, scoped to a driver, truck, card or vendor, with the backtest it computed from public tables.
- Read public tables: `agent_task`, `match_result`, `hold`, `rule`, `business_day`.
- Open files under `EVIDENCE_DIR` (`seed/fixtures/evidence`) through Droid's `Read` and `Grep`, and call the Elastic Agent Builder tools over MCP.

May not:

- Approve or reject a payment or a rule. The reducers refuse the agent role and refuse an author approving its own rule.
- Write, create, edit or execute anything through Droid. `Execute`, `Edit`, `Create` and `ApplyPatch` are disabled by id, autonomy is `Off`, and the permission handler is subtractive: it cancels edit, execute, create, apply_patch, ask_user, mission and violation confirmations and proceeds once otherwise (MCP tool calls and read-only confirmations). `Script` and `ToolSearch` stay enabled because Droid 0.249 routes every tool through `Script` and loads MCP tools with `ToolSearch`; the handler decides per confirmation inside a script.
- Read `seed/fixtures/answer_key.json`. The backtest uses `match_result` and `hold` only.
- Send a finding to the database that did not pass the zod schema in `src/finding.ts`. There is no `pay` recommendation.

## Three modes

`WORKER_MODE` selects the mode. An empty `FACTORY_API_KEY` forces `replay` whatever the variable says, so an offline demo cannot make a paid Droid call by accident.

| Mode | What happens on an `investigate` task |
| --- | --- |
| `live` | Droid runs in `EVIDENCE_DIR` with the options below. The structured output is validated and written with `source = 'live'`, `finding.status = 'ok'`. |
| `record` | Same as live, then `{finding, steps, recordedAt}` is written to `seed/fixtures/investigations/<txnRef>.json`. |
| `replay` | The fixture for the transaction is read and written back with `finding.status = 'replayed'`, `source = 'replayed'`, plus a steps entry `replayed from fixtures/investigations/<txnRef>.json`. |

Any live failure (abort at the time limit, SDK error, structured output that fails the schema) falls back to the fixture when one exists, and to the stand-in otherwise. A task that still has no result when `TASK_TIMEOUT_MS + TASK_GRACE_MS` elapses has its handler aborted (the Droid session and any later `create_rule` call are cut off), and the scripted stand-in is built from the brief and written with `recommendation = 'timeout'`, `source = 'none'` and `finding.status = 'timeout'`, so the dashboard never shows a spinner forever.

Terminal writes are retried up to 5 times (250 ms doubling, capped at 4 s). A refusal containing `task is ` means a terminal write already committed (for example a reply lost after the server applied it) and counts as success; nothing overwrites it. Before the call, `steps_json` is fitted under 180,000 characters (tool results capped at 4,000, then the middle cut with a note, keeping the first 10 and last 20 steps) and `finding_json` under 45,000. On SIGINT or SIGTERM the loop waits up to `TASK_TIMEOUT_MS + TASK_GRACE_MS + 20 s` for in-flight writes; on startup it also subscribes to claimed tasks and finishes any still claimed by its own identity.

Every evidence item is checked against its source before the write and dropped with a step note when it does not hold up: a file quote must appear in the file (whitespace normalised), a `kernel` ref must be a key path in the brief's evidence (`evidence.distanceMiles`), and a tool quote's first 12 characters must appear in a `tool_result` of that tool. With `EVIDENCE_DIR` absent, file-sourced items are dropped as unverifiable. If every item is dropped the finding stays, with confidence capped at 0.3.

`draft_rule` tasks never call Droid in any mode. See "Rules" below.

## Stand-in labelling

When no fixture exists, the worker writes a scripted stand-in. It is labelled in three places so nobody mistakes it for model output:

- `finding.finding` starts with `Scripted stand-in, not a model.` followed by the kernel code and the key numbers from the brief (distance, threshold, gallons, truck, driver, vendor).
- `finding.status = 'no_fixture'`, `finding.model = 'stand-in'`, and the task's `source = 'none'`.
- `steps_json` holds a note `scripted stand-in, not a model: no fixture at fixtures/investigations/<txnRef>.json`.

Recommendation by code: `capacity_exceeded` holds; `vendor_bank_change` holds with the question "Call the vendor on a known number; who confirmed the new account?"; `location_mismatch`, `rate_variance`, `duplicate_invoice` and `short_received` hold and ask the brief's `questionHint`. Confidence is 0.5. Evidence entries carry `source = 'kernel'` and quote the kernel's numbers.

The sentence after the label comes from `src/explain.ts`: a template built from the evidence, or, when `ANTHROPIC_API_KEY` is set, two sentences from `claude-haiku-4-5` that are discarded if they contain any digit sequence not present in the evidence JSON (G13). The template is used whenever the model text is rejected or the call fails.

## Where Droid runs

`src/droid.ts`, verified against the `.d.ts` files shipped in `@factory/droid-sdk@0.10.0` (`dist/node.d.mts` and `dist/index-*.d.mts`). The session options block, quoted verbatim from the code between its `BEGIN` and `END` comments (the handler is subtractive: anything that writes, executes, escalates or asks a human is cancelled; MCP tool calls and read-only confirmations proceed once, and each decision is written as a step note):

```ts
  // BEGIN createSession options (quoted verbatim in README.md)
  return {
    cwd: opts.evidenceDir,                                   // seed/fixtures/evidence; read-only by the OS, not by Droid
    autonomyLevel: AutonomyLevel.Off,                        // every action asks the handler
    disabledToolIds,                                         // ['Execute', 'Edit', 'Create', 'ApplyPatch'] plus listTools() edit/execute ids; subtractive, no allowlist in TS
    systemPrompt: { type: 'preset' as const, preset: 'droid' as const, append: SYSTEM_PROMPT_APPEND },
    mcpServers,                                              // Elastic Agent Builder MCP only when KIBANA_URL and ELASTIC_API_KEY are set
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

`SYSTEM_PROMPT_APPEND` is `You investigate one accounts-payable exception. Use your tools: call the MCP tools and read the evidence files before you conclude; never answer from the brief alone. Find the explanation if the evidence holds one. Never recommend paying.` `mcpServers` is `[{ type: 'http', name: 'elastic', url: `${KIBANA_URL}/api/agent_builder/mcp`, headers: [{ name: 'Authorization', value: `ApiKey ${key}` }] }]` when `KIBANA_URL` and a key are set and `[]` otherwise. The key is least privilege: `ELASTIC_MCP_API_KEY` (`caliber-droid-mcp`, read on the receipts, contracts, telematics_log, invoices, holds and escalations indices plus `feature_agentBuilder.read` and `feature_actions.read` on `space:default`, nothing else) when set, with `ELASTIC_API_KEY` as the fallback; `config.ts` records which one in `elasticKeySource`. Droid can list and call the Agent Builder tools and cannot write an index or change a tool. The prompt is streamed with `session.stream(prompt, { outputFormat: { type: OutputFormatType.JsonSchema, schema: FINDING_SCHEMA } })`; the final message carries `structuredOutput`, `subtype`, `tokenUsage` and `durationMs`. `tokenUsage` and `durationMs` are appended to `worker/cost_log.jsonl` (gitignored).

The SDK is imported lazily inside `investigate()`, so replay mode never loads it and does not need the `droid` CLI on PATH.

### Names confirmed from the SDK type declarations

From `dist/node.d.mts`:

- `createSession(options?: CreateSessionOptions): Promise<DroidSession>`; `CreateSessionOptions extends SessionInitOptions, HandlerOptions, TransportCreationOptions` with `abortSignal?: AbortSignal`.
- `SessionInitOptions`: `cwd`, `autonomyLevel?: AutonomyLevel`, `systemPrompt?: SystemPromptConfig`, `mcpServers?: DroidMcpServerConfig[]`, and `disabledToolIds?: string[]` through `ToolSelectionOverrides`.
- `HandlerOptions`: `permissionHandler?: ClientPermissionHandler` where `ClientPermissionHandler = (params: RequestPermissionRequestParams) => RequestPermissionHandlerResult | Promise<...>`.
- `DroidSession.stream(prompt, options?: MessageOptions)` returning `AsyncGenerator<DroidStreamMessage>`; `MessageOptions.outputFormat?: OutputFormat`.
- `DroidSession.listTools(): Promise<ToolInfo[]>` where `ToolInfo.id` is the tool's `llmId`, `ToolInfo.allowed` and `ToolInfo.category: 'read' | 'edit' | 'execute' | 'other'`.
- `DroidSession.close(): Promise<void>`.

From `dist/index-*.d.mts`:

- `enum AutonomyLevel { Off = 'off', Low, Medium, High }`.
- `enum ToolConfirmationOutcome` including `ProceedOnce = 'proceed_once'` and `Cancel = 'cancel'`.
- `enum ToolConfirmationType` including `Execute = 'exec'`, `Edit`, `Create`, `ApplyPatch = 'apply_patch'`, `McpTool = 'mcp_tool'`, `Script = 'script'`.
- `const OutputFormatType = { JsonSchema: 'json_schema' }`; `OutputFormatSchema = { type: 'json_schema', schema: Record<string, unknown> }`.
- `SystemPromptConfigSchema`: a string, or `{ type: 'preset', preset: 'droid', append: string }` (strict object).
- `McpServerConfigSchema` HTTP variant: `{ type: 'http', name, url, headers: Array<{ name, value }>, oauth? }`.
- `const DroidMessageType` with `Assistant = 'assistant'`, `ToolCall = 'tool_call'`, `ToolResult = 'tool_result'`, `Result = 'result'`.
- `DroidToolCallMessage { type: 'tool_call', name, toolUseId, input }`; `ToolResult { type: 'tool_result', toolUseId, toolName, content: string | JsonValue[], isError }`; `DroidAssistantMessage { type: 'assistant', message, text }`; `ErrorEvent { type: 'error', message, errorType, timestamp }`.
- `DroidResultMessage = DroidResultSuccessMessage | DroidResultInterruptedMessage | DroidResultErrorMessage` with `subtype: 'success' | 'interrupted' | 'error_during_execution' | 'error_structured_output'`, `structuredOutput?: unknown`, `tokenUsage: TokenUsage | null` (`inputTokens`, `outputTokens`, `cacheCreationTokens`, `cacheReadTokens`, `thinkingTokens`), `durationMs`, `turnCount`, `success`, `error`.

Differences from the build spec's block: `tokenUsage` is an object with `inputTokens` and `outputTokens` (the finding stores them as `input` and `output`), and the result's error is `error: ErrorEvent | null` rather than a string. The `details.calls[].confirmation` path for `Script` confirmations exists in `RequestPermissionRequestParamsSchema` as the spec said. Tool ids `Execute`, `Edit`, `Create`, `ApplyPatch`, `Read`, `Grep` are not enumerated as a type in the SDK; `Execute`, `Read` and `Grep` appear in `examples/node/tool-controls.ts`, and the others are the spec's list. The worker calls `session.listTools()` once per process, logs every id with its allowed flag, and adds any allowed tool in the `edit` or `execute` category to `disabledToolIds` for every later session (the first session is recreated when that list grows).

## Rules

A `draft_rule` task arrives when the controller answers a question (`answer_question` inserts it). `src/rules.ts`:

1. A negative answer (contains `no`, `not ours`, `fraud`, `reject`, `did not`, `didn't`, `never`) records `hold` with "Controller confirmed the exception; recommend reject" and drafts nothing.
2. `capacity_exceeded`, `vendor_bank_change` and `duplicate_toll` are never drafted (the module refuses them too). `duplicate_invoice` and `short_received` record `done` with the answer summarised and no rule.
3. Otherwise the draft is `condition = code`, scope `{driverId}` for `location_mismatch` or `{vendorId}` for `rate_variance`, window `day` to `day + 5` as `one_time`, or to `day + 30` as `standing` when the answer contains `always`, `standing` or `every`. With `ANTHROPIC_API_KEY`, `claude-haiku-4-5` may adjust `uses` and `toDay` under a strict JSON schema; anything that fails zod or leaves the allowed window keeps the deterministic draft.
4. Backtest over the client cache: every `match_result` with that code, inside the window, whose evidence matches the scope. `n = wouldClear = count`; `openHoldsCovered` counts holds in `open`, `awaiting_controller` or `answered`; `confirmedExceptionsCovered = trueExceptionsCleared` counts holds in `rejected`.
5. If `trueExceptionsCleared > 0` the worker records `hold` with the counts and does not call `create_rule`. Otherwise it calls `create_rule` (the module recomputes the backtest itself and may refuse) and records `done` with "Drafted rule for controller approval" and the counts.

## Run it

```sh
cd worker
npm install
npm run typecheck
npm test
WORKER_MODE=replay npm start
```

Environment comes from the repo-root `.env` (a variable already set in the shell wins). Variables: `STDB_URI`, `STDB_DB`, `STDB_AGENT_TOKEN`, `WORKER_MODE`, `FACTORY_API_KEY`, `ANTHROPIC_API_KEY`, `KIBANA_URL`, `ELASTIC_API_KEY`; optional `EVIDENCE_DIR`, `FIXTURES_DIR`, `CONCURRENCY` (2), `TASK_TIMEOUT_MS` (90000), `TASK_GRACE_MS` (15000), `POLL_MS` (500), `PAUSE_FILE`.

Pause without stopping: `touch worker/PAUSE`. The file is checked on every loop iteration; remove it to resume.

## Files

| File | Role |
| --- | --- |
| `src/config.ts` | env parsing, mode forcing, PAUSE check |
| `src/stdb.ts` | connection, subscriptions, `claim`, `recordInvestigation`, `createRule` |
| `src/loop.ts` | claim loop, concurrency 2, timeout, terminal write guarantee, one log line per task |
| `src/brief.ts` | `brief_json` schema and the investigator prompt |
| `src/droid.ts` | the Droid session (see above) and the steps capture |
| `src/finding.ts` | the zod gate for `finding_json` |
| `src/replay.ts` | record, replay, stand-in |
| `src/explain.ts` | two-sentence explanation with the digit check |
| `src/rules.ts` | rule drafting and backtest |
| `src/investigate.ts` | live, record, replay, stand-in orchestration for one task |
| `src/index.ts` | entry |
| `test/` | vitest: finding gate and evidence checks, explain digit check, backtest and negative answers, replay and stand-in, loop (retries, timeout stand-in, payload fitting, recovery) |
