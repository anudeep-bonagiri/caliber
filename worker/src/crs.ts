// CRS Credit API client for Task 16 (vendor vetting). One question only: is this vendor the business it claims to be?
// Three calls: business credit, public records (liens, judgments, bankruptcy), OFAC screen. Every request is built
// from a VendorQuery (business name and the carrier's own vendor id) and nothing else. No consumer credit, no driver
// or person data is ever sent.
//
// Everything that depends on the sandbox collection lives in this file: the base URL, the login call, the three
// endpoint paths, their request bodies, and how a response is turned into hits. Search for "TODO(crs-sandbox)".
//
// Env: CRS_USERNAME, CRS_PASSWORD (never logged), CRS_BASE_URL (optional override), CRS_DRY_RUN=1 (print the requests,
// no network), CRS_FIXTURES_DIR (optional; default seed/fixtures/vendor_checks), CRS_TIMEOUT_MS (default 15000).
import fs from 'node:fs';
import path from 'node:path';
import { nowIso, REPO_ROOT, type WorkerMode } from './config.js';

// ---------------------------------------------------------------------------
// configuration (the one place to edit when the sandbox invite and Postman collection arrive)
// ---------------------------------------------------------------------------

// From the plan doc. TODO(crs-sandbox): confirm against the Postman collection.
export const CRS_SANDBOX_BASE_URL = 'https://api-sandbox.stitchcredit.com:443/api';
// The CRS MCP server (mcp.crscreditapi.com) is an alternative transport; not used by the worker.

export type CrsCall = 'business_credit' | 'public_records' | 'ofac';
export const CRS_CALLS: readonly CrsCall[] = ['business_credit', 'public_records', 'ofac'];

// Only these two fields ever reach a request body builder.
export interface VendorQuery {
  name: string;
  id: number;
}

export interface CrsHit {
  kind: string;
  detail: string;
  score?: number;
}

export interface EndpointConfig {
  method: 'GET' | 'POST';
  path: string;
  body: (q: VendorQuery) => Record<string, unknown>;
  // turn a raw response into hits (anything a controller should look at); [] means clean
  hits: (raw: unknown) => CrsHit[];
  // one line for the evidence quote
  summarize: (raw: unknown, hits: CrsHit[]) => string;
}

// Login. Known from the plan doc: POST /users/login with {username, password} returns a Bearer token.
export const CRS_LOGIN = {
  method: 'POST' as const,
  path: '/users/login',
  body: (username: string, password: string) => ({ username, password }),
  // TODO(crs-sandbox): confirm which field carries the token; these are tried in order.
  tokenFields: ['token', 'accessToken', 'access_token', 'jwt', 'data.token', 'data.accessToken'],
  // TODO(crs-sandbox): confirm token lifetime; the cache refreshes after this.
  tokenTtlMs: 50 * 60_000,
};

// OFAC scores at or above this count as a match (the agent then suggests reject); below it, a potential match
// (the agent suggests escalate). TODO(crs-sandbox): align with the score scale CRS actually returns.
export const OFAC_MATCH_SCORE = 0.95;

type Obj = Record<string, unknown>;
const asObj = (v: unknown): Obj => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});
const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const money = (v: unknown): string | undefined => {
  const n = num(v);
  return n === undefined ? undefined : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

function recordHits(kind: string, list: unknown): CrsHit[] {
  return asArr(list).map(e => {
    const o = asObj(e);
    const parts = [str(o.court) ?? str(o.filingOffice), money(o.amount), str(o.filedDate) ? `filed ${str(o.filedDate)}` : undefined, str(o.status)].filter(Boolean);
    return { kind, detail: parts.length ? parts.join(', ') : 'on file' };
  });
}

// The three calls. Paths and bodies are placeholders until the collection lands; the hit extractors read the
// hand-shaped fixture format in seed/fixtures/vendor_checks/ and must be re-checked against recorded responses.
export const CRS_ENDPOINTS: Record<CrsCall, EndpointConfig> = {
  business_credit: {
    method: 'POST',
    // TODO(crs-sandbox): business credit report path.
    path: '/TODO-business-credit',
    // TODO(crs-sandbox): business credit request body (the report may also want address or state; the vendor table
    // has neither today, so add only business fields, never a person).
    body: q => ({ businessName: q.name }),
    // TODO(crs-sandbox): field names below follow the hand-shaped fixture, not a recorded response.
    hits: raw => {
      const o = asObj(raw);
      const out: CrsHit[] = [];
      if (o.matchFound === false) out.push({ kind: 'no_business_match', detail: 'no business on file under this name' });
      const risk = str(o.riskClass)?.toUpperCase();
      if (risk === 'HIGH') out.push({ kind: 'high_credit_risk', detail: `risk class HIGH${num(o.creditScore) !== undefined ? `, score ${o.creditScore}` : ''}` });
      for (const d of asArr(o.derogatoryIndicators)) if (str(d)) out.push({ kind: 'derogatory', detail: str(d)! });
      return out;
    },
    summarize: (raw, hits) => {
      const o = asObj(raw);
      if (o.matchFound === false) return 'no business on file under this name';
      const bits = [
        str(o.businessName) ? `business on file: ${str(o.businessName)}` : 'business on file',
        str(o.riskClass) ? `risk class ${str(o.riskClass)}` : undefined,
        num(o.creditScore) !== undefined ? `score ${o.creditScore}` : undefined,
        num(o.yearsOnFile) !== undefined ? `${o.yearsOnFile} years on file` : undefined,
      ].filter(Boolean);
      return `${bits.join(', ')}${hits.length ? `; ${hits.map(h => h.detail).join('; ')}` : ''}`;
    },
  },
  public_records: {
    method: 'POST',
    // TODO(crs-sandbox): public records (liens, judgments, bankruptcy) path.
    path: '/TODO-public-records',
    // TODO(crs-sandbox): public records request body.
    body: q => ({ businessName: q.name }),
    // TODO(crs-sandbox): field names below follow the hand-shaped fixture, not a recorded response.
    hits: raw => {
      const o = asObj(raw);
      return [...recordHits('lien', o.liens), ...recordHits('judgment', o.judgments), ...recordHits('bankruptcy', o.bankruptcies)];
    },
    summarize: (raw, hits) => {
      const o = asObj(raw);
      const count = (k: string, label: string) => {
        const n = asArr(o[k]).length;
        return n === 0 ? `no ${label}s` : `${n} ${label}${n === 1 ? '' : 's'}`;
      };
      const head = `${count('liens', 'lien')}, ${count('judgments', 'judgment')}, ${count('bankruptcies', 'bankruptcy').replace('bankruptcys', 'bankruptcies')} on file`;
      return hits.length ? `${head}: ${hits.map(h => `${h.kind} ${h.detail}`).join('; ')}` : head;
    },
  },
  ofac: {
    method: 'POST',
    // TODO(crs-sandbox): OFAC screen path.
    path: '/TODO-ofac-screen',
    // TODO(crs-sandbox): OFAC request body. The business name only.
    body: q => ({ name: q.name }),
    // TODO(crs-sandbox): field names below follow the hand-shaped fixture, not a recorded response.
    hits: raw => {
      const o = asObj(raw);
      return asArr(o.matches).map(m => {
        const e = asObj(m);
        const score = num(e.score);
        const strong = score !== undefined && score >= OFAC_MATCH_SCORE;
        const parts = [str(e.name), score !== undefined ? `score ${score}` : undefined, str(e.list), str(e.program)].filter(Boolean);
        return { kind: strong ? 'ofac_match' : 'ofac_potential_match', detail: parts.join(', ') || 'unnamed entry', ...(score !== undefined ? { score } : {}) };
      });
    },
    summarize: (raw, hits) => {
      const o = asObj(raw);
      if (!hits.length) return `OFAC no match${str(o.searchedName) ? ` for ${str(o.searchedName)}` : ''}`;
      return hits.map(h => `${h.kind === 'ofac_match' ? 'OFAC match' : 'OFAC potential match'}: ${h.detail}`).join('; ');
    },
  },
};

// ---------------------------------------------------------------------------
// runtime
// ---------------------------------------------------------------------------

export interface CrsEnv {
  baseUrl: string;
  username: string;
  password: string;
  dryRun: boolean;
  // the WORKER_MODE the operator asked for (not the Droid-forced mode)
  mode: WorkerMode;
  fixturesDir: string;
  timeoutMs: number;
}

export function crsEnvFrom(env: NodeJS.ProcessEnv = process.env, mode?: WorkerMode): CrsEnv {
  const m = mode ?? (['live', 'record', 'replay'].includes(env.WORKER_MODE ?? '') ? (env.WORKER_MODE as WorkerMode) : 'replay');
  const t = Number(env.CRS_TIMEOUT_MS);
  return {
    baseUrl: (env.CRS_BASE_URL || CRS_SANDBOX_BASE_URL).replace(/\/+$/, ''),
    username: env.CRS_USERNAME ?? '',
    password: env.CRS_PASSWORD ?? '',
    dryRun: env.CRS_DRY_RUN === '1' || env.CRS_DRY_RUN === 'true',
    mode: m,
    fixturesDir: path.resolve(env.CRS_FIXTURES_DIR || path.join(REPO_ROOT, 'seed', 'fixtures', 'vendor_checks')),
    timeoutMs: Number.isFinite(t) && t >= 1000 ? t : 15_000,
  };
}

// Live calls happen only with credentials and WORKER_MODE live or record.
export function crsLiveEnabled(env: CrsEnv): boolean {
  return env.username.trim() !== '' && (env.mode === 'live' || env.mode === 'record');
}

export interface CrsSummary {
  call: CrsCall;
  endpoint: string;
  ok: boolean;
  hits: CrsHit[];
  summary: string;
  raw: unknown;
  dryRun?: boolean;
  error?: string;
}

export interface CrsOptions {
  env?: CrsEnv;
  fetch?: typeof fetch;
  log?: (msg: string) => void;
  signal?: AbortSignal;
}

const SECRET_KEY = /pass|secret|token|user|auth|key/i;

// Replace credential-shaped values before anything is printed.
export function redact(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(redact);
  if (v !== null && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v as Obj).map(([k, x]) => [k, SECRET_KEY.test(k) ? '<redacted>' : redact(x)]));
  }
  return v;
}

// Human label for a call. The endpoint config (method and path) is internal and may still carry TODO
// placeholders until the sandbox collection arrives; it is never shown on a card or in an evidence ref.
const CALL_LABEL: Record<CrsCall, string> = { business_credit: 'business credit', public_records: 'public records', ofac: 'OFAC screen' };
export function endpointLabel(call: CrsCall): string {
  return CALL_LABEL[call];
}

function printRequest(log: (m: string) => void, method: string, url: string, body: unknown, bearer: boolean): void {
  log(`CRS dry run (no network): ${method} ${url}${bearer ? ' Authorization: Bearer <redacted>' : ''} body ${JSON.stringify(redact(body))}`);
}

function pick(o: unknown, dotted: string): unknown {
  let cur: unknown = o;
  for (const k of dotted.split('.')) cur = asObj(cur)[k];
  return cur;
}

let tokenCache: { key: string; token: string; expiresAt: number } | undefined;
// parallel calls share one login request
let tokenInflight: { key: string; promise: Promise<string> } | undefined;

export function resetCrsTokenCache(): void {
  tokenCache = undefined;
  tokenInflight = undefined;
}

function timeoutSignal(env: CrsEnv, signal?: AbortSignal): AbortSignal {
  const t = AbortSignal.timeout(env.timeoutMs);
  return signal ? AbortSignal.any([signal, t]) : t;
}

// POST /users/login once, cache the Bearer token until the TTL passes. Errors never include the request body.
export async function login(opts: CrsOptions = {}): Promise<string> {
  const env = opts.env ?? crsEnvFrom();
  const log = opts.log ?? console.log;
  const url = `${env.baseUrl}${CRS_LOGIN.path}`;
  if (env.dryRun) {
    printRequest(log, CRS_LOGIN.method, url, CRS_LOGIN.body(env.username, env.password), false);
    return 'dry-run';
  }
  if (!env.username || !env.password) throw new Error('CRS_USERNAME and CRS_PASSWORD are required for a live CRS call');
  const key = `${env.baseUrl}\u0000${env.username}`;
  if (tokenCache && tokenCache.key === key && tokenCache.expiresAt > Date.now()) return tokenCache.token;
  if (tokenInflight && tokenInflight.key === key) return tokenInflight.promise;
  const promise = fetchToken(env, key, opts).finally(() => {
    if (tokenInflight?.promise === promise) tokenInflight = undefined;
  });
  tokenInflight = { key, promise };
  return promise;
}

async function fetchToken(env: CrsEnv, key: string, opts: CrsOptions): Promise<string> {
  const url = `${env.baseUrl}${CRS_LOGIN.path}`;
  const res = await (opts.fetch ?? fetch)(url, {
    method: CRS_LOGIN.method,
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(CRS_LOGIN.body(env.username, env.password)),
    signal: timeoutSignal(env, opts.signal),
  });
  if (!res.ok) throw new Error(`CRS login failed: HTTP ${res.status}`);
  const body = (await res.json().catch(() => ({}))) as unknown;
  let token: string | undefined;
  for (const f of CRS_LOGIN.tokenFields) {
    const v = pick(body, f);
    if (typeof v === 'string' && v) {
      token = v;
      break;
    }
  }
  const header = res.headers.get('authorization');
  if (!token && header) token = header.replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('CRS login returned no token field (see CRS_LOGIN.tokenFields)');
  tokenCache = { key, token, expiresAt: Date.now() + CRS_LOGIN.tokenTtlMs };
  return token;
}

const SAFE_ID = (id: number) => Number.isInteger(id) && id >= 0 && id < 1e9;

export interface VendorCheckFixture {
  note?: string;
  recorded?: boolean;
  recordedAt?: string;
  vendor?: { id: number; name: string };
  responses: Partial<Record<CrsCall, unknown>>;
}

// WORKER_MODE=record: merge one raw response into <fixturesDir>/<vendorId>.json. A hand-shaped file is replaced,
// never mixed with recorded responses.
export function recordRaw(fixturesDir: string, q: VendorQuery, call: CrsCall, raw: unknown): string | undefined {
  if (!SAFE_ID(q.id)) return undefined;
  const file = path.join(fixturesDir, `${q.id}.json`);
  let cur: VendorCheckFixture | undefined;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as VendorCheckFixture;
    if (parsed.recorded === true) cur = parsed;
  } catch {
    cur = undefined;
  }
  const next: VendorCheckFixture = {
    note: 'Recorded from the CRS sandbox in WORKER_MODE=record. Sandbox data, not a real report.',
    recorded: true,
    recordedAt: nowIso(),
    vendor: { id: q.id, name: q.name },
    responses: { ...(cur?.responses ?? {}), [call]: raw },
  };
  fs.mkdirSync(fixturesDir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(next, null, 2) + '\n');
  return file;
}

// Build a summary from a raw response with the same extractors live and replay use.
export function summarizeRaw(call: CrsCall, raw: unknown): CrsSummary {
  const cfg = CRS_ENDPOINTS[call];
  const hits = cfg.hits(raw);
  return { call, endpoint: endpointLabel(call), ok: true, hits, summary: cfg.summarize(raw, hits), raw };
}

async function callEndpoint(call: CrsCall, q: VendorQuery, opts: CrsOptions): Promise<CrsSummary> {
  const env = opts.env ?? crsEnvFrom();
  const log = opts.log ?? console.log;
  const cfg = CRS_ENDPOINTS[call];
  const url = `${env.baseUrl}${cfg.path}`;
  const body = cfg.body(q);
  const endpoint = endpointLabel(call);
  if (env.dryRun) {
    await login({ ...opts, env, log });
    printRequest(log, cfg.method, url, body, true);
    return { call, endpoint, ok: false, hits: [], summary: 'dry run: request printed, nothing sent', raw: null, dryRun: true };
  }
  try {
    const token = await login({ ...opts, env, log });
    const res = await (opts.fetch ?? fetch)(cfg.method === 'GET' ? `${url}?${new URLSearchParams(Object.entries(body).map(([k, v]) => [k, String(v)]))}` : url, {
      method: cfg.method,
      headers: { 'content-type': 'application/json', accept: 'application/json', authorization: `Bearer ${token}` },
      ...(cfg.method === 'POST' ? { body: JSON.stringify(body) } : {}),
      signal: timeoutSignal(env, opts.signal),
    });
    if (res.status === 401 || res.status === 403) resetCrsTokenCache();
    if (!res.ok) return { call, endpoint, ok: false, hits: [], summary: `HTTP ${res.status}`, raw: null, error: `HTTP ${res.status}` };
    const raw = (await res.json()) as unknown;
    if (env.mode === 'record') {
      const file = recordRaw(env.fixturesDir, q, call, raw);
      if (file) log(`recorded CRS ${call} response to ${file}`);
    }
    return summarizeRaw(call, raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { call, endpoint, ok: false, hits: [], summary: `call failed: ${msg}`, raw: null, error: msg };
  }
}

export function businessCredit(name: string, id: number, opts: CrsOptions = {}): Promise<CrsSummary> {
  return callEndpoint('business_credit', { name, id }, opts);
}

export function publicRecords(name: string, id: number, opts: CrsOptions = {}): Promise<CrsSummary> {
  return callEndpoint('public_records', { name, id }, opts);
}

// The OFAC screen takes the business name only. The id is used for recording the response, never sent.
export function ofacScreen(name: string, opts: CrsOptions & { vendorId?: number } = {}): Promise<CrsSummary> {
  return callEndpoint('ofac', { name, id: opts.vendorId ?? -1 }, opts);
}

// Replay: <vendorId>.json is preferred; CRS_FIXTURE_VARIANT=hit (or any name) picks <vendorId>.<variant>.json first
// when present; failing both, the first <vendorId>.<variant>.json on disk is used.
export function vendorFixtureFile(fixturesDir: string, vendorId: number, variant?: string): string | undefined {
  if (!SAFE_ID(vendorId)) return undefined;
  const candidates: string[] = [];
  if (variant && /^[a-z0-9_-]{1,20}$/i.test(variant)) candidates.push(`${vendorId}.${variant}.json`);
  candidates.push(`${vendorId}.json`);
  for (const c of candidates) {
    const f = path.join(fixturesDir, c);
    if (fs.existsSync(f)) return f;
  }
  let others: string[] = [];
  try {
    others = fs.readdirSync(fixturesDir).filter(f => f.startsWith(`${vendorId}.`) && f.endsWith('.json')).sort();
  } catch {
    others = [];
  }
  return others.length ? path.join(fixturesDir, others[0]) : undefined;
}

export function loadVendorFixture(file: string): VendorCheckFixture {
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as VendorCheckFixture;
  if (!parsed || typeof parsed !== 'object' || typeof parsed.responses !== 'object' || parsed.responses === null) {
    throw new Error(`${path.basename(file)} has no responses object`);
  }
  return parsed;
}
