// Record one investigation live (Task 26.2: the recording that exercises elastic___find_contract_clause).
// Same pattern as rerecord_decoys.mts: brief_json read from the live ledger with an anonymous SQL read, parsed
// with parseBrief, run through the worker's own handleInvestigate in WORKER_MODE=record, which writes
// seed/fixtures/investigations/<txnRef>.json. Nothing is written to the ledger; the worker process is untouched.
// Run from worker/:  npx tsx tools/rerecord_one.mts INV-1003
// Never prints a key; the config line reports presence as set or unset only.
import { loadDotEnv, parseConfig } from '../src/config.ts';
import { parseBrief } from '../src/brief.ts';
import { handleInvestigate } from '../src/investigate.ts';
import { FindingSchema } from '../src/finding.ts';

const ref = process.argv[2];
if (!ref) throw new Error('usage: npx tsx tools/rerecord_one.mts <txnRef>');

loadDotEnv();
process.env.WORKER_MODE = 'record';
const cfg = parseConfig();
if (cfg.mode !== 'record') throw new Error(`mode is ${cfg.mode}, not record; FACTORY_API_KEY is ${cfg.factoryApiKey ? 'set' : 'unset'}`);
console.log(`mode=${cfg.mode} fixtures=${cfg.fixturesDir} evidence=${cfg.evidenceDir} kibana=${cfg.kibanaUrl ? 'set' : 'unset'} elasticKey=${cfg.elasticApiKey ? `set (${cfg.elasticKeySource})` : 'unset'} factoryKey=${cfg.factoryApiKey ? 'set' : 'unset'}`);

async function briefFor(txnRef: string): Promise<string> {
  const res = await fetch(`${cfg.stdbUri}/v1/database/${cfg.stdbDb}/sql`, {
    method: 'POST',
    body: `SELECT brief_json FROM agent_task WHERE txn_ref = '${txnRef}' AND kind = 'investigate'`,
  });
  if (!res.ok) throw new Error(`sql ${res.status} for ${txnRef}`);
  const body = (await res.json()) as Array<{ rows: string[][] }>;
  const row = body[0]?.rows?.[0];
  if (!row) throw new Error(`no investigate task for ${txnRef} in the ledger`);
  return row[0];
}

console.log(`\n=== ${ref}`);
const brief = parseBrief(await briefFor(ref));
const t0 = Date.now();
const r = await handleInvestigate(brief, { cfg, log: m => console.log(`[worker] ${m}`) });
const elapsed = Date.now() - t0;
const toolCalls = r.steps.filter(s => s.type === 'tool_call').map(s => (s as { name: string }).name);
const forbidden = toolCalls.filter(n => ['Execute', 'Edit', 'Create', 'ApplyPatch'].includes(n));
const res = r.steps.find(s => s.type === 'result') as { durationMs: number; subtype: string } | undefined;
const f = r.finding;
const sources = f.evidence.map(e => `${e.source}`);
const clauseResults = r.steps.filter(s => s.type === 'tool_result' && (s as { toolName?: string }).toolName === 'elastic___find_contract_clause');
console.log(`source=${r.source} recommendation=${r.recommendation}`);
console.log(`question=${JSON.stringify(r.question ?? null)}`);
console.log(`tokenUsage=${JSON.stringify(f.tokenUsage ?? null)} durationMs=${res?.durationMs ?? f.durationMs ?? null} subtype=${res?.subtype ?? null} elapsed=${elapsed}`);
console.log(`tool_calls=${JSON.stringify(toolCalls)} forbidden=${JSON.stringify(forbidden)}`);
console.log(`find_contract_clause results=${clauseResults.length} first=${JSON.stringify(clauseResults[0] ?? null).slice(0, 400)}`);
console.log(`evidence sources=${JSON.stringify(sources)} confidence=${f.confidence}`);
console.log(`finding=${f.finding.slice(0, 300)}`);
console.log(`passes FindingSchema=${FindingSchema.safeParse(f).success}`);
console.log(`\nsummary ${ref}: ${r.source} ${r.recommendation} q=${JSON.stringify(r.question ?? null)} in=${f.tokenUsage?.input ?? '?'} out=${f.tokenUsage?.output ?? '?'} ms=${res?.durationMs ?? '?'} tools=${toolCalls.join(',')}`);
