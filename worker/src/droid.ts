// Where Droid runs. Verified against @factory/droid-sdk 0.10.0 type declarations (see README, "Where Droid runs").
// The SDK is imported lazily so replay mode never loads it and never needs the droid CLI on PATH.
import fs from 'node:fs';
import type { DroidResultMessage, DroidStreamMessage, RequestPermissionRequestParams } from '@factory/droid-sdk/node';
import { nowIso } from './config.js';
import { FINDING_SCHEMA } from './finding.js';
import type { Step } from './replay.js';

// Subtractive restriction: ids seen in the SDK's tool-controls example plus whatever listTools() reports
// in the edit or execute categories on first run. There is no allowlist in the TypeScript SDK.
export const BASE_DISABLED_TOOL_IDS = [
  'Execute', 'Edit', 'Create', 'ApplyPatch',
  // seen in listTools() on 2026-10-24: anything that leaves the evidence folder, changes state or spawns work
  'WebSearch', 'FetchUrl', 'ConnectApp', 'StageSettingsChanges', 'TodoWrite', 'ListAutomations', 'ListAutomationTemplates', 'ReadAutomation',
  'Skill', 'Task',
] as const;

// Droid 0.249 executes tool calls through `Script` (a batch of `tools.<name>(...)` calls) and loads MCP tools
// with `ToolSearch`. Disabling them disables every tool, so they are never added to the disabled list; the
// permission handler still cancels any write-like call inside a script.
export const SUBSTRATE_TOOL_IDS = ['Script', 'ToolSearch', 'WaitForScript', 'Read', 'Grep', 'Glob', 'LS'] as const;

export const SYSTEM_PROMPT_APPEND =
  'You investigate one accounts-payable exception. Use your tools: call the MCP tools and read the evidence files before you conclude; never answer from the brief alone. Find the explanation if the evidence holds one. Never recommend paying.';

export interface DroidOptions {
  evidenceDir: string;
  timeoutMs: number;
  kibanaUrl?: string;
  elasticApiKey?: string;
  costLog?: string;
  txnRef?: string;
  log?: (msg: string) => void;
  // the loop's task signal; aborting it aborts the session too
  signal?: AbortSignal;
  // permission decisions are appended here as note steps so the dashboard shows them
  steps?: Step[];
}

export interface DroidRun {
  result: DroidResultMessage | undefined;
  aborted: boolean;
  disabledToolIds: string[];
}

// ---------------------------------------------------------------------------
// Failure classification (Task 8.7). A rate limit or server error from the Factory API is retried once and then
// deferred; it never falls through to a replayed fixture. The SDK carries no HTTP status field (ErrorEvent has
// `message` and `errorType` only), so the status is read from the message text, and a result with subtype
// `error_during_execution` counts as an API error even when the message names no status.
// ---------------------------------------------------------------------------
export type DroidApiFailureKind = 'rate_limit' | 'server';

export interface DroidApiFailure {
  kind: DroidApiFailureKind;
  // short label used in the deferred finding, e.g. `HTTP 429 rate limit`
  reason: string;
}

export const RETRY_BACKOFF_MS: Record<DroidApiFailureKind, number> = { rate_limit: 5_000, server: 2_000 };

export class DroidApiError extends Error {
  readonly kind: DroidApiFailureKind;
  readonly reason: string;
  constructor(message: string, failure: DroidApiFailure) {
    super(message);
    this.name = 'DroidApiError';
    this.kind = failure.kind;
    this.reason = failure.reason;
  }
}

const RATE_LIMIT = /\b429\b|rate[ _-]?limit|too many requests/i;
const SERVER_STATUS = /\b(5\d\d)\b/;
const SERVER_WORDS = /internal server error|bad gateway|service unavailable|gateway time-?out|overloaded/i;

export function classifyDroidFailure(message: string, subtype?: string): DroidApiFailure | undefined {
  if (RATE_LIMIT.test(message)) return { kind: 'rate_limit', reason: 'HTTP 429 rate limit' };
  const code = SERVER_STATUS.exec(message)?.[1];
  if (code) return { kind: 'server', reason: `HTTP ${code} server error` };
  if (SERVER_WORDS.test(message)) return { kind: 'server', reason: 'HTTP 5xx server error' };
  if (subtype === 'error_during_execution') return { kind: 'server', reason: 'API error during execution' };
  return undefined;
}

// Tool ids learned from session.listTools() once per process; extends the disabled list for later sessions.
let learnedWriteToolIds: string[] | undefined;
let listedOnce = false;

export function resetToolMemoryForTests(): void {
  learnedWriteToolIds = undefined;
  listedOnce = false;
}

export function currentDisabledToolIds(): string[] {
  return Array.from(new Set([...BASE_DISABLED_TOOL_IDS, ...(learnedWriteToolIds ?? [])]));
}

type Sdk = typeof import('@factory/droid-sdk/node');

function sessionOptions(sdk: Sdk, opts: DroidOptions, disabledToolIds: string[], ac: AbortController) {
  const { AutonomyLevel, ToolConfirmationOutcome, ToolConfirmationType } = sdk;
  const mcpServers = opts.kibanaUrl && opts.elasticApiKey
    ? [{ type: 'http' as const, name: 'elastic', url: `${opts.kibanaUrl.replace(/\/$/, '')}/api/agent_builder/mcp`, headers: [{ name: 'Authorization', value: `ApiKey ${opts.elasticApiKey}` }] }]
    : [];
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
}

function toStep(msg: DroidStreamMessage): Step | undefined {
  const at = nowIso();
  switch (msg.type) {
    case 'tool_call':
      return { type: 'tool_call', at, name: msg.name, toolUseId: msg.toolUseId, input: msg.input };
    case 'tool_result':
      return {
        type: 'tool_result',
        at,
        toolUseId: msg.toolUseId,
        toolName: msg.toolName,
        content: (typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)).slice(0, 4000),
        isError: msg.isError,
      };
    case 'assistant':
      return msg.text ? { type: 'assistant', at, text: msg.text.slice(0, 4000) } : undefined;
    case 'result':
      return { type: 'result', at, subtype: msg.subtype, durationMs: msg.durationMs, success: msg.success };
    case 'error':
      return { type: 'note', at, text: `droid error: ${msg.message}` };
    default:
      return undefined;
  }
}

export function appendCostLog(file: string | undefined, entry: Record<string, unknown>): void {
  if (!file) return;
  try {
    fs.appendFileSync(file, JSON.stringify({ at: nowIso(), ...entry }) + '\n');
  } catch {
    // the cost log is observability only; never fail a task over it
  }
}

// Run one investigation. Every stream message is captured into `steps`. Throws on SDK failure; the caller
// classifies it (classifyDroidFailure) and retries, defers, or falls back.
export async function investigate(brief: string, steps: Step[], opts: DroidOptions): Promise<DroidRun> {
  const log = opts.log ?? (() => {});
  const sdk: Sdk = await import('@factory/droid-sdk/node');
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), opts.timeoutMs);
  const onOuterAbort = () => ac.abort();
  if (opts.signal?.aborted) ac.abort();
  else opts.signal?.addEventListener('abort', onOuterAbort, { once: true });
  opts = { ...opts, steps };
  let session = await sdk.createSession(sessionOptions(sdk, opts, currentDisabledToolIds(), ac));
  try {
    if (!listedOnce) {
      listedOnce = true;
      const tools = await session.listTools();
      log(`droid tools: ${tools.map(t => `${t.id}${t.allowed ? '' : ' (disabled)'}`).join(', ')}`);
      const extra = tools
        .filter(t => (t.category === 'edit' || t.category === 'execute') && t.allowed
          && !(BASE_DISABLED_TOOL_IDS as readonly string[]).includes(t.id)
          && !(SUBSTRATE_TOOL_IDS as readonly string[]).includes(t.id))
        .map(t => t.id);
      learnedWriteToolIds = extra;
      if (extra.length) {
        log(`disabling additional write tools found by listTools(): ${extra.join(', ')}`);
        await session.close();
        session = await sdk.createSession(sessionOptions(sdk, opts, currentDisabledToolIds(), ac));
      }
    }
    let result: DroidResultMessage | undefined;
    for await (const msg of session.stream(brief, { outputFormat: { type: sdk.OutputFormatType.JsonSchema, schema: FINDING_SCHEMA as unknown as Record<string, unknown> } })) {
      const step = toStep(msg);
      if (step) steps.push(step);
      if (msg.type === sdk.DroidMessageType.Result) result = msg;
    }
    if (result) {
      appendCostLog(opts.costLog, {
        txnRef: opts.txnRef,
        model: 'droid',
        subtype: result.subtype,
        durationMs: result.durationMs,
        tokenUsage: result.tokenUsage,
        turnCount: result.turnCount,
      });
    }
    return { result, aborted: ac.signal.aborted, disabledToolIds: currentDisabledToolIds() };
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onOuterAbort);
    await session.close().catch(() => {});
  }
}
