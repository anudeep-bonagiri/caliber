// Where Droid runs. Verified against @factory/droid-sdk 0.10.0 type declarations (see README, "Where Droid runs").
// The SDK is imported lazily so replay mode never loads it and never needs the droid CLI on PATH.
import fs from 'node:fs';
import type { DroidResultMessage, DroidStreamMessage, RequestPermissionRequestParams } from '@factory/droid-sdk/node';
import { nowIso } from './config.js';
import { FINDING_SCHEMA } from './finding.js';
import type { Step } from './replay.js';

// Subtractive restriction: ids seen in the SDK's tool-controls example plus whatever listTools() reports
// in the edit or execute categories on first run. There is no allowlist in the TypeScript SDK.
export const BASE_DISABLED_TOOL_IDS = ['Execute', 'Edit', 'Create', 'ApplyPatch'] as const;

export const SYSTEM_PROMPT_APPEND =
  'You investigate one accounts-payable exception. Find the explanation if the evidence holds one. Never recommend paying.';

export interface DroidOptions {
  evidenceDir: string;
  timeoutMs: number;
  kibanaUrl?: string;
  elasticApiKey?: string;
  costLog?: string;
  txnRef?: string;
  log?: (msg: string) => void;
}

export interface DroidRun {
  result: DroidResultMessage | undefined;
  aborted: boolean;
  disabledToolIds: string[];
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
      const details = toolUses.flatMap(u => (u.details.type === ToolConfirmationType.Script ? u.details.calls.map(c => c.confirmation) : [u.details]));
      const onlyMcp = details.length > 0 && details.every(d => d.type === ToolConfirmationType.McpTool);
      const want = onlyMcp ? ToolConfirmationOutcome.ProceedOnce : ToolConfirmationOutcome.Cancel;
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
// decides between the recorded fixture and the stand-in.
export async function investigate(brief: string, steps: Step[], opts: DroidOptions): Promise<DroidRun> {
  const log = opts.log ?? (() => {});
  const sdk: Sdk = await import('@factory/droid-sdk/node');
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), opts.timeoutMs);
  let session = await sdk.createSession(sessionOptions(sdk, opts, currentDisabledToolIds(), ac));
  try {
    if (!listedOnce) {
      listedOnce = true;
      const tools = await session.listTools();
      log(`droid tools: ${tools.map(t => `${t.id}${t.allowed ? '' : ' (disabled)'}`).join(', ')}`);
      const extra = tools
        .filter(t => (t.category === 'edit' || t.category === 'execute') && t.allowed && !(BASE_DISABLED_TOOL_IDS as readonly string[]).includes(t.id))
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
    await session.close().catch(() => {});
  }
}
