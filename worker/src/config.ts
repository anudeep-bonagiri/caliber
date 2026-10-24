// Environment parsing for the worker. Everything the process reads from the outside world is here.
// Replay is forced when FACTORY_API_KEY is empty so an offline demo can never make a paid Droid call.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

export const WORKER_DIR = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
export const REPO_ROOT = path.resolve(WORKER_DIR, '..');

// Load the repo-root .env without a dependency. A variable already set in the environment wins,
// so `FACTORY_API_KEY= npm start` disables live mode even when .env holds a key.
export function loadDotEnv(file = path.join(REPO_ROOT, '.env')): void {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const Mode = z.enum(['live', 'record', 'replay']);
export type WorkerMode = z.infer<typeof Mode>;

const EnvSchema = z.object({
  STDB_URI: z.string().min(1).default('http://127.0.0.1:3100'),
  STDB_DB: z.string().min(1).default('dispatch-ledger'),
  STDB_AGENT_TOKEN: z.string().min(1, 'STDB_AGENT_TOKEN is required; the worker is the agent identity'),
  WORKER_MODE: Mode.default('replay'),
  FACTORY_API_KEY: z.string().default(''),
  ANTHROPIC_API_KEY: z.string().default(''),
  KIBANA_URL: z.string().default(''),
  ELASTIC_API_KEY: z.string().default(''),
  // Task 26.1: the least-privilege key for Droid's MCP entry (read on six indices, Agent Builder read).
  // When unset, the project key is used and elasticKeySource says so.
  ELASTIC_MCP_API_KEY: z.string().default(''),
  EVIDENCE_DIR: z.string().default(path.join(REPO_ROOT, 'seed', 'fixtures', 'evidence')),
  FIXTURES_DIR: z.string().default(path.join(REPO_ROOT, 'seed', 'fixtures', 'investigations')),
  COST_LOG: z.string().default(path.join(WORKER_DIR, 'cost_log.jsonl')),
  PAUSE_FILE: z.string().default(path.join(WORKER_DIR, 'PAUSE')),
  CONCURRENCY: z.coerce.number().int().min(1).max(8).default(2),
  TASK_TIMEOUT_MS: z.coerce.number().int().min(1000).default(90_000),
  // Extra time the loop grants after TASK_TIMEOUT_MS so the replay or stand-in fallback can still be written.
  TASK_GRACE_MS: z.coerce.number().int().min(0).default(15_000),
  POLL_MS: z.coerce.number().int().min(100).default(500),
});

export interface Config {
  stdbUri: string;
  stdbDb: string;
  agentToken: string;
  mode: WorkerMode;
  requestedMode: WorkerMode;
  factoryApiKey: string;
  anthropicApiKey: string;
  kibanaUrl: string;
  // The key Droid's MCP server entry sends (droid.ts): ELASTIC_MCP_API_KEY when set, else ELASTIC_API_KEY.
  elasticApiKey: string;
  elasticKeySource?: 'ELASTIC_MCP_API_KEY' | 'ELASTIC_API_KEY';
  evidenceDir: string;
  fixturesDir: string;
  costLog: string;
  pauseFile: string;
  concurrency: number;
  taskTimeoutMs: number;
  taskGraceMs: number;
  pollMs: number;
}

export function parseConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const e = EnvSchema.parse(env);
  const requestedMode = e.WORKER_MODE;
  // G: no key, no live run. Replay is forced, not just defaulted.
  const mode: WorkerMode = e.FACTORY_API_KEY.trim() === '' ? 'replay' : requestedMode;
  return {
    stdbUri: e.STDB_URI,
    stdbDb: e.STDB_DB,
    agentToken: e.STDB_AGENT_TOKEN,
    mode,
    requestedMode,
    factoryApiKey: e.FACTORY_API_KEY,
    anthropicApiKey: e.ANTHROPIC_API_KEY,
    kibanaUrl: e.KIBANA_URL,
    elasticApiKey: e.ELASTIC_MCP_API_KEY.trim() !== '' ? e.ELASTIC_MCP_API_KEY : e.ELASTIC_API_KEY,
    elasticKeySource: e.ELASTIC_MCP_API_KEY.trim() !== '' ? 'ELASTIC_MCP_API_KEY' : 'ELASTIC_API_KEY',
    evidenceDir: path.resolve(e.EVIDENCE_DIR),
    fixturesDir: path.resolve(e.FIXTURES_DIR),
    costLog: path.resolve(e.COST_LOG),
    pauseFile: path.resolve(e.PAUSE_FILE),
    concurrency: e.CONCURRENCY,
    taskTimeoutMs: e.TASK_TIMEOUT_MS,
    taskGraceMs: e.TASK_GRACE_MS,
    pollMs: e.POLL_MS,
  };
}

// Settlement through Capital One's Nessie mock bank. Kept apart from Config so the loop's config stays as is.
// Live settlement needs a key and WORKER_MODE other than replay; settle.ts decides, this only parses.
export interface NessieConfig {
  apiKey: string;
  base: string;
  accountsFile: string;
}

export function parseNessieConfig(env: NodeJS.ProcessEnv = process.env): NessieConfig {
  return {
    apiKey: (env.NESSIE_API_KEY ?? '').trim(),
    base: ((env.NESSIE_BASE ?? '').trim() || 'https://api.nessieisreal.com').replace(/\/+$/, ''),
    accountsFile: path.resolve((env.NESSIE_ACCOUNTS ?? '').trim() || path.join(REPO_ROOT, 'seed', 'fixtures', 'nessie_accounts.json')),
  };
}

// G15: a PAUSE file next to the worker stops claiming. Checked every loop iteration, never cached.
export function isPaused(cfg: Pick<Config, 'pauseFile'>): boolean {
  try {
    return fs.existsSync(cfg.pauseFile);
  } catch {
    return false;
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}
