import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FindingError, parseFinding, verifyEvidence } from '../src/finding.js';

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

describe('verifyEvidence', () => {
  const brief = { evidence: { distanceMiles: 96.3, nearestPing: { lat: 29.42, lon: -98.49 } } };
  const toolSteps = [{ type: 'tool_result', toolName: 'find_trips_near', content: 'truck_id=22   dist_m=41\nother', isError: false }];
  const finding = (evidence: Array<{ source: string; ref: string; quote: string }>, confidence = 0.86) =>
    parseFinding({ ...good(), evidence, confidence }, evidenceDir);

  it('keeps a file quote that is in the file after whitespace normalisation', () => {
    const v = verifyEvidence(finding([{ source: 'swap_log.txt', ref: 'line 1', quote: '08/27  Ortiz R.\n-> unit 22' }]), { evidenceDir, brief, steps: [] });
    expect(v.finding.evidence).toHaveLength(1);
    expect(v.notes).toEqual([]);
  });

  it('drops a file quote that is not in the file, with a note', () => {
    const v = verifyEvidence(
      finding([
        { source: 'swap_log.txt', ref: 'line 1', quote: '08/26 Ortiz R. -> unit 22' },
        { source: 'kernel', ref: 'evidence.distanceMiles', quote: '96.3' },
      ]),
      { evidenceDir, brief, steps: [] },
    );
    expect(v.finding.evidence.map(e => e.source)).toEqual(['kernel']);
    expect(v.notes).toContain('evidence dropped: quote not found in swap_log.txt');
    expect(v.finding.confidence).toBe(0.86);
  });

  it('checks kernel refs against key paths in the brief evidence', () => {
    const v = verifyEvidence(
      finding([
        { source: 'kernel', ref: 'evidence.nearestPing.lat', quote: '29.42' },
        { source: 'kernel', ref: 'evidence.daysSinceChange', quote: 'invented' },
        { source: 'kernel', ref: 'distanceMiles', quote: 'no prefix' },
      ]),
      { evidenceDir, brief, steps: [] },
    );
    expect(v.finding.evidence.map(e => e.ref)).toEqual(['evidence.nearestPing.lat']);
    expect(v.notes).toHaveLength(2);
  });

  it('keeps a tool quote only when a tool_result of that tool contains its first 12 characters', () => {
    const v = verifyEvidence(
      finding([
        { source: 'find_trips_near', ref: 'truck 22', quote: 'truck_id=22 dist_m=41 and more the tool never said' },
        { source: 'contract_rate_for_vendor', ref: 'vendor 3', quote: 'rate_cents=245000' },
        { source: 'find_trips_near', ref: 'truck 9', quote: 'truck_id=9 dist_m=12' },
      ]),
      { evidenceDir, brief, steps: toolSteps },
    );
    expect(v.finding.evidence.map(e => e.ref)).toEqual(['truck 22']);
    expect(v.notes).toEqual(['evidence dropped: no contract_rate_for_vendor tool_result contains the quote', 'evidence dropped: no find_trips_near tool_result contains the quote']);
  });

  it('keeps the finding but caps confidence at 0.3 when every item is dropped', () => {
    const v = verifyEvidence(
      finding([
        { source: 'contract_rate_for_vendor', ref: 'vendor 3', quote: 'rate_cents=245000' },
        { source: 'kernel', ref: 'evidence.nope', quote: '' },
      ]),
      { evidenceDir, brief, steps: [] },
    );
    expect(v.finding.evidence).toEqual([]);
    expect(v.finding.confidence).toBe(0.3);
    expect(v.finding.finding).toBe(good().finding);
    expect(v.notes.at(-1)).toMatch(/confidence capped at 0.3/);
  });

  it('fails closed when the evidence directory is absent', () => {
    const missing = path.join(evidenceDir, 'does-not-exist');
    const raw = parseFinding({ ...good(), evidence: [{ source: 'swap_log.txt', ref: 'line 1', quote: '08/27 Ortiz R.' }] }, missing, { requireFiles: false });
    const v = verifyEvidence(raw, { evidenceDir: missing, brief, steps: [] });
    expect(v.finding.evidence).toEqual([]);
    expect(v.notes[0]).toMatch(/^evidence dropped: swap_log.txt unverifiable/);
    expect(v.finding.confidence).toBe(0.3);
  });
});
