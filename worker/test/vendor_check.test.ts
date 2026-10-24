import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { AgentTask } from '../../module_bindings/types.js';
import type { Config } from '../src/config.js';
import { CRS_ENDPOINTS, crsEnvFrom, login, recordRaw, redact, resetCrsTokenCache, vendorFixtureFile, type CrsEnv } from '../src/crs.js';
import { WorkerLoop } from '../src/loop.js';
import type { Conn, RecordArgs } from '../src/stdb.js';
import {
  APPROVE_QUESTION,
  FIXTURE_NOTE_DEFAULT,
  FIXTURE_SOURCE,
  STAND_IN_PREFIX,
  VendorCheckFindingSchema,
  handleVendorCheck,
  mapRecommendation,
  parseVendorBrief,
  vendorRecord,
  type VendorBrief,
} from '../src/vendor_check.js';

const FIXTURES = path.resolve(__dirname, '..', '..', 'seed', 'fixtures', 'vendor_checks');

const brief = (over: Partial<VendorBrief> = {}): VendorBrief => ({
  txnRef: 'INV-1077',
  kind: 'invoice',
  code: 'vendor_check',
  trigger: 'bank_change',
  cents: '980000',
  day: 44,
  date: '2026-08-31',
  vendor: { id: 3, name: 'Gulf Coast Diesel', bankChangedDay: 42 },
  questionHint: 'Vendor check: approve with a call-back note, or reject?',
  ...over,
});

const env = (over: Partial<CrsEnv> = {}): CrsEnv => ({
  baseUrl: 'https://crs.test/api',
  username: '',
  password: '',
  dryRun: false,
  mode: 'replay',
  fixturesDir: FIXTURES,
  timeoutMs: 5000,
  ...over,
});

let tmp: string;
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dl-vendor-'));
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
afterEach(() => resetCrsTokenCache());

const noFetch = (() => {
  throw new Error('network must not be touched');
}) as unknown as typeof fetch;

describe('vendor check finding schema', () => {
  const base = { finding: 'x', evidence: [] as unknown[], recommendation: 'approve', reasons: [], confidence: 0.9 };
  it('accepts the three CRS sources and the hand-authored fixture source', () => {
    expect(FIXTURE_SOURCE).toBe('fixture:hand-authored (CRS sandbox pending)');
    for (const source of ['crs:business_credit', 'crs:public_records', 'crs:ofac', FIXTURE_SOURCE]) {
      expect(VendorCheckFindingSchema.safeParse({ ...base, evidence: [{ source, ref: 'r', quote: 'q' }] }).success).toBe(true);
    }
  });
  it('rejects any other source', () => {
    for (const source of ['kernel', 'swap_log.txt', 'crs:consumer_credit', 'find_trips_near', 'fixture', 'fixture:hand-authored', '']) {
      expect(VendorCheckFindingSchema.safeParse({ ...base, evidence: [{ source, ref: 'r', quote: 'q' }] }).success).toBe(false);
    }
  });
  it('accepts only approve, reject, escalate', () => {
    for (const recommendation of ['approve', 'reject', 'escalate']) expect(VendorCheckFindingSchema.safeParse({ ...base, recommendation }).success).toBe(true);
    for (const recommendation of ['clear', 'pay', 'hold']) expect(VendorCheckFindingSchema.safeParse({ ...base, recommendation }).success).toBe(false);
  });
});

describe('mapping to record_investigation', () => {
  it('approve maps to hold with the call-back question', () => {
    expect(mapRecommendation('approve', [])).toEqual({ recommendation: 'hold', question: APPROVE_QUESTION });
    expect(APPROVE_QUESTION).toBe('Vendor check clean: approve with a call-back note?');
  });
  it('reject and escalate map to hold_and_ask naming the reasons; the agent never rejects', () => {
    for (const rec of ['reject', 'escalate'] as const) {
      const m = mapRecommendation(rec, ['an OFAC match (X)', 'a lien (Y)']);
      expect(m.recommendation).toBe('hold_and_ask');
      expect(m.question).toBe('Vendor has an OFAC match (X); a lien (Y); reject or call back?');
    }
  });
  it('keeps a long question under 500 characters', () => {
    const m = mapRecommendation('escalate', Array(10).fill('r'.repeat(199)));
    expect(m.question.length).toBeLessThanOrEqual(500);
    expect(m.question.endsWith('; reject or call back?')).toBe(true);
  });
});

describe('replay', () => {
  it('prefers <vendorId>.<trigger>.json over <vendorId>.json and picks up nothing else', () => {
    expect(path.basename(vendorFixtureFile(FIXTURES, 1, 'bank_change')!)).toBe('1.bank_change.json');
    expect(path.basename(vendorFixtureFile(FIXTURES, 1, 'first_invoice')!)).toBe('1.json');
    expect(path.basename(vendorFixtureFile(FIXTURES, 1)!)).toBe('1.json');
    expect(path.basename(vendorFixtureFile(FIXTURES, 3, 'bank_change')!)).toBe('3.json');
    expect(path.basename(vendorFixtureFile(FIXTURES, 5, 'bank_change')!)).toBe('5.json');
    expect(vendorFixtureFile(FIXTURES, 999)).toBeUndefined();
    expect(vendorFixtureFile(FIXTURES, 1, '../1')).toBe(path.join(FIXTURES, '1.json'));
    // no hit variant file exists any more; a stray <id>.<something>.json is not picked up by a different trigger
    expect(fs.existsSync(path.join(FIXTURES, '3.hit.json'))).toBe(false);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-stray-'));
    fs.copyFileSync(path.join(FIXTURES, '1.bank_change.json'), path.join(dir, '8.bank_change.json'));
    expect(vendorFixtureFile(dir, 8, 'first_invoice')).toBeUndefined();
    expect(vendorFixtureFile(dir, 8)).toBeUndefined();
  });

  it('the three fixtures the run uses all carry the hand-authored note and no recorded flag', () => {
    for (const f of ['1.json', '1.bank_change.json', '3.json', '5.json']) {
      const fx = JSON.parse(fs.readFileSync(path.join(FIXTURES, f), 'utf8'));
      expect(fx.note).toBe(FIXTURE_NOTE_DEFAULT);
      expect(fx.recorded).not.toBe(true);
    }
  });

  it('replays the clean vendor 3 fixture as approve -> hold with the call-back question, labelled FIXTURE on every surface', async () => {
    const out = await handleVendorCheck(brief(), { mode: 'replay', log: () => {}, env: env(), fetch: noFetch });
    expect(out.source).toBe('replayed');
    // 3.json is hand-authored (no recorded: true): the status says so on every surface
    expect(out.finding.status).toBe('fixture');
    expect(out.finding.recommendation).toBe('approve');
    expect(out.recommendation).toBe('hold');
    expect(out.question).toBe(APPROVE_QUESTION);
    expect(out.finding.evidence).toHaveLength(3);
    expect(out.finding.evidence.every(e => e.source === FIXTURE_SOURCE)).toBe(true);
    expect(out.finding.evidence.map(e => e.ref)).toEqual(['business credit', 'public records', 'OFAC screen']);
    expect(out.finding.evidence[1].quote).toBe('no liens, no judgments, no bankruptcies on file');
    expect(out.finding.evidence[2].quote).toMatch(/^OFAC no match/);
    expect(out.finding.finding.startsWith('Hand-authored fixture (CRS sandbox pending), not sandbox data. ')).toBe(true);
    expect(out.finding.fixtureNote).toBe(FIXTURE_NOTE_DEFAULT);
    expect(out.finding.model).toBe('hand-authored fixture');
    expect(out.steps.some(s => s.type === 'note' && s.text.startsWith(`hand-authored fixture vendor_checks/3.json; CRS sandbox pending: ${FIXTURE_NOTE_DEFAULT}`))).toBe(true);
    expect(out.steps.some(s => s.type === 'note' && s.text.startsWith(`${FIXTURE_SOURCE} business credit: 0 hit(s)`))).toBe(true);
    expect(out.steps.at(-1)).toMatchObject({ type: 'note', text: 'fixture vendor_checks/3.json' });
    expect(JSON.stringify(out)).not.toMatch(/replayed from/);
  });

  it('vendor 1 is clean on its first invoice and carries a judgment on its bank change (D-3)', async () => {
    const v1 = { id: 1, name: 'Alamo Fleet Service', bankChangedDay: 18 };
    const first = await handleVendorCheck(brief({ txnRef: 'INV-1012', trigger: 'first_invoice', day: 9, cents: '150000', vendor: v1 }), { mode: 'replay', log: () => {}, env: env(), fetch: noFetch });
    expect(first.finding.status).toBe('fixture');
    expect(first.finding.recommendation).toBe('approve');
    expect(first.steps.at(-1)).toMatchObject({ type: 'note', text: 'fixture vendor_checks/1.json' });
    const change = await handleVendorCheck(brief({ txnRef: 'INV-1032', trigger: 'bank_change', day: 19, cents: '545000', vendor: v1 }), { mode: 'replay', log: () => {}, env: env(), fetch: noFetch });
    expect(change.source).toBe('replayed');
    expect(change.finding.status).toBe('fixture');
    expect(change.finding.recommendation).toBe('escalate');
    expect(change.recommendation).toBe('hold_and_ask');
    expect(change.finding.reasons).toEqual(['a judgment (Example County Civil Court, $23,750.00, filed 2026-07-20, open)']);
    expect(change.question).toBe('Vendor has a judgment (Example County Civil Court, $23,750.00, filed 2026-07-20, open); reject or call back?');
    expect(change.finding.question_for_controller).toBe(change.question);
    expect(change.finding.evidence.every(e => e.source === FIXTURE_SOURCE)).toBe(true);
    expect(change.finding.evidence[1].quote).toMatch(/^no liens, 1 judgment, no bankruptcies on file: judgment Example County Civil Court/);
    expect(change.finding.evidence[2].quote).toMatch(/^OFAC no match/);
    expect(change.steps.at(-1)).toMatchObject({ type: 'note', text: 'fixture vendor_checks/1.bank_change.json' });
  });

  it('never lets an endpoint placeholder reach a card: no "/TODO-" in any finding, ref, quote or step', async () => {
    const briefs = [
      brief(),
      brief({ txnRef: 'INV-1032', vendor: { id: 1, name: 'Alamo Fleet Service', bankChangedDay: 18 } }),
      brief({ txnRef: 'INV-1012', trigger: 'first_invoice', vendor: { id: 1, name: 'Alamo Fleet Service', bankChangedDay: 18 } }),
      brief({ txnRef: 'INV-1138', vendor: { id: 5, name: 'Border Fleet Repair', bankChangedDay: 71 } }),
    ];
    for (const b of briefs) {
      const out = await handleVendorCheck(b, { mode: 'replay', log: () => {}, env: env(), fetch: noFetch });
      expect(JSON.stringify(out)).not.toContain('/TODO-');
      expect(JSON.stringify(out)).not.toMatch(/POST \//);
      expect(out.finding.status).toBe('fixture');
    }
    const stand = await handleVendorCheck(brief({ vendor: { id: 99, name: 'Nobody Inc', bankChangedDay: 1 } }), { mode: 'replay', log: () => {}, env: env(), fetch: noFetch });
    expect(JSON.stringify(stand)).not.toContain('/TODO-');
  });

  it('a recorded fixture (recorded: true) replays as replayed with the file named in each ref', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-recorded-'));
    const src = JSON.parse(fs.readFileSync(path.join(env().fixturesDir, '3.json'), 'utf8'));
    fs.writeFileSync(path.join(tmp, '3.json'), JSON.stringify({ ...src, recorded: true, recordedAt: '2026-10-24T20:00:00Z', note: 'recorded from the sandbox' }));
    const out = await handleVendorCheck(brief(), { mode: 'replay', log: () => {}, env: { ...env(), fixturesDir: tmp }, fetch: noFetch });
    expect(out.finding.status).toBe('replayed');
    expect(out.finding.fixtureNote).toBeUndefined();
    expect(out.finding.model).toBe('crs-replay');
    expect(out.finding.evidence.map(e => e.source)).toEqual(['crs:business_credit', 'crs:public_records', 'crs:ofac']);
    expect(out.finding.evidence.every(e => e.ref.endsWith('(replayed from vendor_checks/3.json)'))).toBe(true);
    expect(out.finding.finding.startsWith('Vendor 3')).toBe(true);
    expect(JSON.stringify(out)).not.toMatch(/hand-authored|fixture:/);
    expect(out.steps.at(-1)).toMatchObject({ type: 'note', text: 'replayed from vendor_checks/3.json' });
  });

  it('writes a terminal row the reducer accepts', async () => {
    const out = await handleVendorCheck(brief({ txnRef: 'INV-1032', vendor: { id: 1, name: 'Alamo Fleet Service', bankChangedDay: 18 } }), { mode: 'replay', log: () => {}, env: env(), fetch: noFetch });
    const r = vendorRecord(9n, out);
    expect(r).toMatchObject({ id: 9n, recommendation: 'hold_and_ask', source: 'replayed', question: out.question });
    expect(VendorCheckFindingSchema.parse(JSON.parse(r.findingJson)).recommendation).toBe('escalate');
    expect(r.findingJson.length).toBeLessThan(45_000);
  });
});

describe('stand-in', () => {
  it('is labelled, escalates with confidence 0, and asks the controller', async () => {
    const out = await handleVendorCheck(brief({ vendor: { id: 4, name: 'Metroplex Truck Center', bankChangedDay: 0 } }), { mode: 'replay', log: () => {}, env: env({ fixturesDir: tmp }), fetch: noFetch });
    expect(out.source).toBe('none');
    expect(out.finding.finding.startsWith(`${STAND_IN_PREFIX} no sandbox result on file for vendor 4`)).toBe(true);
    expect(out.finding.recommendation).toBe('escalate');
    expect(out.finding.confidence).toBe(0);
    expect(out.finding.status).toBe('no_fixture');
    expect(out.finding.evidence).toEqual([]);
    expect(out.recommendation).toBe('hold_and_ask');
  });
});

describe('dry run', () => {
  it('prints the requests with no credentials, no network, and no person data', async () => {
    const logs: string[] = [];
    const b = parseVendorBrief(JSON.stringify({ ...brief(), driverName: 'Ramon Ortiz', evidence: { driverId: 23 } }));
    const out = await handleVendorCheck(b, {
      mode: 'live',
      log: m => logs.push(m),
      env: env({ dryRun: true, username: 'crs-user@example.test', password: 'hunter2-sandbox', mode: 'live' }),
      fetch: noFetch,
    });
    const printed = logs.join('\n');
    expect(printed).toContain('CRS dry run (no network): POST https://crs.test/api/users/login');
    for (const call of ['business_credit', 'public_records', 'ofac'] as const) expect(printed).toContain(`https://crs.test/api${CRS_ENDPOINTS[call].path}`);
    expect(printed).not.toContain('hunter2-sandbox');
    expect(printed).not.toContain('crs-user@example.test');
    expect(printed).not.toContain('Ramon');
    expect(printed).not.toContain('driver');
    expect(printed).toContain('Gulf Coast Diesel');
    // nothing came back from the network, so the result is the replayed fixture, with the dry run noted
    expect(out.source).toBe('replayed');
    expect(out.steps.some(s => s.type === 'note' && s.text.includes('CRS dry run'))).toBe(true);
  });

  it('reads CRS_DRY_RUN from the environment', () => {
    expect(crsEnvFrom({ CRS_DRY_RUN: '1' }).dryRun).toBe(true);
    expect(crsEnvFrom({}).dryRun).toBe(false);
  });

  it('redacts credential-shaped keys', () => {
    expect(redact({ username: 'a', password: 'b', nested: { apiToken: 'c', name: 'ok' } })).toEqual({ username: '<redacted>', password: '<redacted>', nested: { apiToken: '<redacted>', name: 'ok' } });
  });
});

describe('live path (mocked fetch)', () => {
  it('logs in once, caches the token, and records raw responses in record mode', async () => {
    const calls: Array<{ url: string; auth?: string; body?: string }> = [];
    const raw = JSON.parse(fs.readFileSync(path.join(FIXTURES, '3.json'), 'utf8')).responses;
    const byPath: Record<string, unknown> = {
      '/users/login': { token: 'tok-1' },
      [CRS_ENDPOINTS.business_credit.path]: raw.business_credit,
      [CRS_ENDPOINTS.public_records.path]: raw.public_records,
      [CRS_ENDPOINTS.ofac.path]: raw.ofac,
    };
    const fake = (async (url: string, init: RequestInit) => {
      const p = new URL(url).pathname.replace('/api', '');
      calls.push({ url, auth: (init.headers as Record<string, string>).authorization, body: init.body as string });
      return new Response(JSON.stringify(byPath[p]), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch;
    const logs: string[] = [];
    const e = env({ username: 'u', password: 'p', mode: 'record', fixturesDir: tmp });
    const out = await handleVendorCheck(brief(), { mode: 'record', log: m => logs.push(m), env: e, fetch: fake });
    expect(out.source).toBe('live');
    expect(out.finding.status).toBe('ok');
    expect(out.recommendation).toBe('hold');
    expect(calls.filter(c => c.url.endsWith('/users/login'))).toHaveLength(1);
    expect(calls.filter(c => !c.url.endsWith('/users/login')).every(c => c.auth === 'Bearer tok-1')).toBe(true);
    // only the business name leaves the worker
    for (const c of calls.filter(c => !c.url.endsWith('/users/login'))) expect(Object.values(JSON.parse(c.body!))).toEqual(['Gulf Coast Diesel']);
    const recorded = JSON.parse(fs.readFileSync(path.join(tmp, '3.json'), 'utf8'));
    expect(recorded.recorded).toBe(true);
    expect(Object.keys(recorded.responses).sort()).toEqual(['business_credit', 'ofac', 'public_records']);
    expect(logs.join('\n')).not.toContain('tok-1');
    fs.rmSync(path.join(tmp, '3.json'));
  });

  it('does not call CRS without credentials or in replay mode', async () => {
    const a = await handleVendorCheck(brief(), { mode: 'live', log: () => {}, env: env({ mode: 'live' }), fetch: noFetch });
    const b = await handleVendorCheck(brief(), { mode: 'replay', log: () => {}, env: env({ username: 'u', password: 'p' }), fetch: noFetch });
    expect([a.source, b.source]).toEqual(['replayed', 'replayed']);
  });

  it('login refuses without credentials and never puts them in the error', async () => {
    await expect(login({ env: env({ username: 'only-user' }), fetch: noFetch })).rejects.toThrow('CRS_USERNAME and CRS_PASSWORD are required');
  });

  it('a hand-authored fixture is replaced, not merged, when recording', () => {
    fs.writeFileSync(path.join(tmp, '7.json'), JSON.stringify({ recorded: false, responses: { ofac: { stale: true } } }));
    recordRaw(tmp, { id: 7, name: 'V' }, 'business_credit', { matchFound: true });
    expect(Object.keys(JSON.parse(fs.readFileSync(path.join(tmp, '7.json'), 'utf8')).responses)).toEqual(['business_credit']);
  });
});

describe('loop dispatch', () => {
  it('routes kind vendor_check to the vendor check and writes one terminal row', async () => {
    const prev = { dir: process.env.CRS_FIXTURES_DIR, dry: process.env.CRS_DRY_RUN, u: process.env.CRS_USERNAME };
    process.env.CRS_FIXTURES_DIR = FIXTURES;
    delete process.env.CRS_DRY_RUN;
    delete process.env.CRS_USERNAME;
    try {
      const written: RecordArgs[] = [];
      const task = { id: 11n, txnRef: 'INV-1077', kind: 'vendor_check', status: 'open', version: 0, briefJson: JSON.stringify(brief()) } as unknown as AgentTask;
      const conn = { isActive: true, db: { agentTask: { iter: () => [].values(), onInsert: () => {} } } } as unknown as Conn;
      const cfg = { mode: 'replay', requestedMode: 'replay', taskTimeoutMs: 5000, taskGraceMs: 0, concurrency: 1, pollMs: 60_000, pauseFile: '/nonexistent/PAUSE' } as unknown as Config;
      const l = new WorkerLoop({
        conn,
        cfg,
        log: () => {},
        sleep: async () => {},
        api: { claim: async () => true, recordInvestigation: async (_c, r) => void written.push(r), createRule: async () => {} },
      });
      await l.runTask(task);
      expect(written).toHaveLength(1);
      expect(written[0]).toMatchObject({ id: 11n, recommendation: 'hold', source: 'replayed', question: APPROVE_QUESTION });
      expect(JSON.parse(written[0].findingJson).recommendation).toBe('approve');
    } finally {
      for (const [k, v] of [['CRS_FIXTURES_DIR', prev.dir], ['CRS_DRY_RUN', prev.dry], ['CRS_USERNAME', prev.u]] as const) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });
});
