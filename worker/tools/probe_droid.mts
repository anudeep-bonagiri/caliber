// Probe: opens one Droid session with the worker's restrictions and asks it to read a file and call an
// Elastic MCP tool, printing every stream message and permission prompt. This is how we learned that
// Droid 0.249 executes tools through `Script` and loads MCP tools with `ToolSearch` (2026-10-24).
// Run from worker/:  EVIDENCE_DIR=../seed/fixtures/evidence npx tsx tools/probe_droid.mts off
import { AutonomyLevel, ToolConfirmationOutcome, createSession } from '@factory/droid-sdk/node';

const level = (process.argv[2] ?? 'off') as string;
const lv = level === 'off' ? AutonomyLevel.Off : ((AutonomyLevel as unknown as Record<string, unknown>)[level] ?? level);
const evidence = process.env.EVIDENCE_DIR;
if (!evidence) throw new Error('EVIDENCE_DIR is required');

const session = await createSession({
  cwd: evidence,
  autonomyLevel: lv,
  disabledToolIds: ['Execute', 'Edit', 'Create', 'ApplyPatch'],
  systemPrompt: { type: 'preset', preset: 'droid', append: 'Use your tools. Read files when asked.' },
  mcpServers: process.env.KIBANA_URL && process.env.ELASTIC_API_KEY
    ? [{ type: 'http', name: 'elastic', url: `${process.env.KIBANA_URL}/api/agent_builder/mcp`, headers: [{ name: 'Authorization', value: `ApiKey ${process.env.ELASTIC_API_KEY}` }] }]
    : [],
  permissionHandler(params: any) {
    console.log('PERMISSION ASKED:', JSON.stringify(params.toolUses.map((u: any) => ({ name: u.toolUse?.name, type: u.details?.type }))), 'options', params.options.map((o: any) => o.value));
    return ToolConfirmationOutcome.ProceedOnce;
  },
} as any);

const t0 = Date.now();
const prompt = 'Read the file swap_log.txt in the working directory and quote line 8 exactly. Then call the MCP tool elastic___find_trips_near with point_wkt "POINT(-96.9036 29.6816)", radius_m 3000, since "2026-08-26T12:37:06Z", until "2026-08-26T12:57:06Z" and report the truck ids returned.';
for await (const msg of session.stream(prompt)) {
  const m: any = msg;
  if (m.type === 'tool_call') console.log('TOOL_CALL', m.name, JSON.stringify(m.input).slice(0, 120));
  else if (m.type === 'tool_result') console.log('TOOL_RESULT', m.toolName, m.isError ? 'ERROR' : 'ok', String(typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).slice(0, 160));
  else if (m.type === 'assistant') console.log('ASSISTANT', String(m.text ?? '').slice(0, 300));
  else if (m.type === 'error') console.log('ERROR', m.message);
  else if (m.type === 'result') console.log('RESULT', m.subtype, m.durationMs, 'ms');
  else console.log('MSG', m.type);
}
console.log('elapsed', Date.now() - t0, 'ms');
await session.close();
