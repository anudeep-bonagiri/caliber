import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FindingError, parseFinding } from '../src/finding.js';

let evidenceDir: string;

const good = () => ({
  finding: 'The card for truck 17 was used while truck 22 was at the pump.',
  evidence: [
    { source: 'find_trips_near', ref: 'truck 22 @ 2026-08-27T13:07Z', quote: 'truck_id=22 dist_m=41' },
    { source: 'swap_log.txt', ref: 'line 14', quote: '08/27 Ortiz R. -> unit 22 (17 in shop)' },
  ],
  recommendation: 'hold_and_ask',
  question_for_controller: 'Did Ramon Ortiz drive truck 22 on Aug 27 while truck 17 was in the shop?',
  confidence: 0.86,
});

beforeAll(() => {
  evidenceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dl-evidence-'));
  fs.writeFileSync(path.join(evidenceDir, 'swap_log.txt'), '08/27 Ortiz R. -> unit 22 (17 in shop)\n');
});
afterAll(() => fs.rmSync(evidenceDir, { recursive: true, force: true }));

describe('parseFinding', () => {
  it('accepts a well formed finding and defaults status to ok', () => {
    const f = parseFinding(good(), evidenceDir);
    expect(f.status).toBe('ok');
    expect(f.recommendation).toBe('hold_and_ask');
  });

  it('rejects a finding with no recommendation', () => {
    const { recommendation: _drop, ...raw } = good();
    expect(() => parseFinding(raw, evidenceDir)).toThrow(FindingError);
  });

  it("rejects recommendation 'pay'", () => {
    expect(() => parseFinding({ ...good(), recommendation: 'pay' }, evidenceDir)).toThrow(/recommendation/);
  });

  it('rejects an evidence ref whose source file does not exist', () => {
    const raw = good();
    raw.evidence.push({ source: 'receipts/9999.txt', ref: 'line 1', quote: 'nothing' });
    expect(() => parseFinding(raw, evidenceDir)).toThrow(/receipts\/9999.txt/);
  });

  it('rejects a source that escapes the evidence directory', () => {
    const raw = good();
    raw.evidence.push({ source: '../../.env', ref: '', quote: '' });
    expect(() => parseFinding(raw, evidenceDir)).toThrow(FindingError);
  });

  it('rejects oversize strings', () => {
    expect(() => parseFinding({ ...good(), finding: 'x'.repeat(1001) }, evidenceDir)).toThrow(/finding/);
    const raw = good();
    raw.evidence[0].quote = 'q'.repeat(401);
    expect(() => parseFinding(raw, evidenceDir)).toThrow(/quote/);
  });

  it('rejects unknown keys and hold_and_ask without a question', () => {
    expect(() => parseFinding({ ...good(), pay: true }, evidenceDir)).toThrow(FindingError);
    const { question_for_controller: _q, ...raw } = good();
    expect(() => parseFinding(raw, evidenceDir)).toThrow(/question_for_controller/);
  });

  it('allows the MCP tool and kernel sources without a file', () => {
    const raw = { ...good(), evidence: [{ source: 'contract_rate_for_vendor', ref: 'vendor 3', quote: 'rate_cents=1200' }, { source: 'kernel', ref: 'evidence.distanceMiles', quote: '96.3' }] };
    expect(parseFinding(raw, evidenceDir).evidence).toHaveLength(2);
  });
});
