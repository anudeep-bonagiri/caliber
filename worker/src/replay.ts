// Record and replay. WORKER_MODE=record writes a live finding to seed/fixtures/investigations/<txnRef>.json;
// replay serves it back labelled 'replayed'. With no fixture, a scripted stand-in is returned and says so.
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { nowIso } from './config.js';
import { centsToDollars, type Brief } from './brief.js';
import { FindingSchema, parseFinding, verifyEvidence, type EvidenceRef, type Finding } from './finding.js';

export const STAND_IN_PREFIX = 'Scripted stand-in, not a model.';

export type Step =
  | { type: 'tool_call'; at: string; name: string; toolUseId: string; input: unknown }
  | { type: 'tool_result'; at: string; toolUseId: string; toolName: string; content: string; isError: boolean }
  | { type: 'assistant'; at: string; text: string }
  | { type: 'note'; at: string; text: string }
  | { type: 'result'; at: string; subtype: string; durationMs: number; success: boolean };

export const StepSchema: z.ZodType<Step> = z.discriminatedUnion('type', [
  z.object({ type: z.literal('tool_call'), at: z.string(), name: z.string(), toolUseId: z.string(), input: z.unknown() }),
  z.object({ type: z.literal('tool_result'), at: z.string(), toolUseId: z.string(), toolName: z.string(), content: z.string(), isError: z.boolean() }),
  z.object({ type: z.literal('assistant'), at: z.string(), text: z.string() }),
  z.object({ type: z.literal('note'), at: z.string(), text: z.string() }),
  z.object({ type: z.literal('result'), at: z.string(), subtype: z.string(), durationMs: z.number(), success: z.boolean() }),
]) as z.ZodType<Step>;

export const FixtureSchema = z.object({
  recorded: z.boolean().optional(),
  note: z.string().optional(),
  finding: FindingSchema,
  steps: z.array(StepSchema),
  recordedAt: z.string(),
});
export type Fixture = z.infer<typeof FixtureSchema>;

export interface InvestigationOutcome {
  finding: Finding;
  steps: Step[];
  source: 'live' | 'replayed' | 'none';
}

const SAFE_REF = /^[A-Za-z0-9_-]{1,40}$/;

export function fixturePath(fixturesDir: string, txnRef: string): string | undefined {
  if (!SAFE_REF.test(txnRef)) return undefined;
  return path.join(fixturesDir, `${txnRef}.json`);
}

export function recordFixture(fixturesDir: string, txnRef: string, finding: Finding, steps: Step[]): string | undefined {
  const file = fixturePath(fixturesDir, txnRef);
  if (!file) return undefined;
  fs.mkdirSync(fixturesDir, { recursive: true });
  const body: Fixture = {
    recorded: true,
    note: `Recorded from a live Droid run in WORKER_MODE=record. Replayed verbatim when the worker runs offline.`,
    finding,
    steps,
    recordedAt: nowIso(),
  };
  fs.writeFileSync(file, JSON.stringify(body, null, 2) + '\n');
  return file;
}

export function loadFixture(fixturesDir: string, txnRef: string): Fixture | undefined {
  const file = fixturePath(fixturesDir, txnRef);
  if (!file || !fs.existsSync(file)) return undefined;
  const parsed = FixtureSchema.safeParse(JSON.parse(fs.readFileSync(file, 'utf8')));
  if (!parsed.success) {
    throw new Error(`fixture ${path.basename(file)} is malformed: ${parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  }
  return parsed.data;
}

// Replay a recorded fixture. Every evidence item is checked against its source (file text, the fixture's own
// tool results, the brief's kernel evidence) and dropped with a note when it does not hold up. When EVIDENCE_DIR
// is absent the check fails closed: file-sourced items are dropped as unverifiable.
export function replayFixture(fixture: Fixture, brief: Pick<Brief, 'txnRef' | 'evidence'>, evidenceDir: string): InvestigationOutcome {
  const requireFiles = fs.existsSync(evidenceDir);
  const checked = parseFinding(fixture.finding, evidenceDir, { requireFiles });
  const verified = verifyEvidence(checked, { evidenceDir, brief, steps: fixture.steps });
  const finding: Finding = { ...verified.finding, status: 'replayed' };
  const steps: Step[] = [
    ...fixture.steps,
    ...verified.notes.map((text): Step => ({ type: 'note', at: nowIso(), text })),
    { type: 'note', at: nowIso(), text: `replayed from fixtures/investigations/${brief.txnRef}.json` },
  ];
  return { finding, steps, source: 'replayed' };
}

// The deterministic stand-in: states the kernel code and the key numbers, recommends by code, never invents.
export function standInFinding(brief: Brief): Finding {
  const ev = brief.evidence;
  const evidence: EvidenceRef[] = [];
  const push = (ref: string, quote: string) => evidence.push({ source: 'kernel', ref, quote: quote.slice(0, 400) });
  push('match_result.code', `${brief.code} on ${brief.kind} ${brief.txnRef}, day ${brief.day}, ${centsToDollars(brief.cents)}`);
  if (ev.distanceMiles !== undefined) push('evidence.distanceMiles', `${ev.distanceMiles} miles from the nearest ping, threshold ${ev.thresholdMiles ?? '?'} miles`);
  if (ev.nearestPing) push('evidence.nearestPing', `lat ${ev.nearestPing.lat}, lon ${ev.nearestPing.lon}, ${ev.nearestPing.deltaMin ?? '?'} min from the transaction`);
  if (ev.nearestPing === null && ev.reason) push('evidence.reason', ev.reason);
  if (ev.gallons !== undefined && ev.tankGal !== undefined) push('evidence.gallons', `${ev.gallons} gal against a ${ev.tankGal} gal tank (limit ${ev.capacityLimitGal})`);
  if (ev.stationName) push('evidence.stationName', ev.stationName);
  if (ev.truckId !== undefined) push('evidence.truckId', `truck ${ev.truckId}${ev.plate ? ` plate ${ev.plate}` : ''}${ev.cardId ? ` card ${ev.cardId}` : ''}`);
  if (ev.driverId !== undefined) push('evidence.driverId', `driver ${ev.driverId}${ev.driverName ? ` ${ev.driverName}` : ''}`);
  for (const k of ['vendorId', 'contractRateCents', 'invoiceUnitCents', 'varianceRatio', 'duplicateOf', 'orderedQty', 'receivedQty', 'bankChangedDay'] as const) {
    const v = (ev as Record<string, unknown>)[k];
    if (v !== undefined && v !== null && typeof v !== 'object') push(`evidence.${k}`, `${k} ${String(v)}`);
  }

  const numbers: string[] = [];
  if (ev.distanceMiles !== undefined) numbers.push(`${ev.distanceMiles} miles from the nearest ping (threshold ${ev.thresholdMiles ?? '?'})`);
  if (ev.gallons !== undefined) numbers.push(`${ev.gallons} gallons${ev.tankGal !== undefined ? ` into a ${ev.tankGal} gallon tank` : ''}`);
  if (ev.truckId !== undefined) numbers.push(`truck ${ev.truckId}`);
  if (ev.driverId !== undefined) numbers.push(`driver ${ev.driverId}`);
  if (ev.vendorId !== undefined) numbers.push(`vendor ${ev.vendorId}`);
  const text = `${STAND_IN_PREFIX} The kernel raised ${brief.code} on ${brief.kind} ${brief.txnRef} for ${centsToDollars(brief.cents)} on day ${brief.day}${numbers.length ? `: ${numbers.join(', ')}` : ''}. No model ran; the hold stands until a person decides.`;

  let recommendation: Finding['recommendation'];
  let question: string | undefined;
  switch (brief.code) {
    case 'capacity_exceeded':
      recommendation = 'hold';
      break;
    case 'vendor_bank_change':
      recommendation = 'hold';
      question = 'Call the vendor on a known number; who confirmed the new account?';
      break;
    case 'location_mismatch':
    case 'rate_variance':
    case 'duplicate_invoice':
    case 'short_received':
      recommendation = 'hold_and_ask';
      question = brief.questionHint || 'Can you explain this transaction?';
      break;
    default:
      recommendation = 'hold';
  }
  return {
    finding: text.slice(0, 1000),
    evidence,
    recommendation,
    ...(question ? { question_for_controller: question } : {}),
    confidence: 0.5,
    status: 'no_fixture',
    model: 'stand-in',
  };
}

export function standIn(brief: Brief): InvestigationOutcome {
  return {
    finding: standInFinding(brief),
    steps: [{ type: 'note', at: nowIso(), text: `scripted stand-in, not a model: no fixture at fixtures/investigations/${brief.txnRef}.json` }],
    source: 'none',
  };
}

// Replay when a fixture exists, otherwise the stand-in. Used in replay mode and as the live fallback.
export function replayOrStandIn(brief: Brief, fixturesDir: string, evidenceDir: string, log: (msg: string) => void = () => {}): InvestigationOutcome {
  let fixture: Fixture | undefined;
  try {
    fixture = loadFixture(fixturesDir, brief.txnRef);
  } catch (err) {
    log(`fixture for ${brief.txnRef} unreadable: ${(err as Error).message}`);
  }
  if (fixture) {
    try {
      if (!fs.existsSync(evidenceDir)) log(`evidence dir ${evidenceDir} is absent; file-sourced evidence in the fixture is dropped as unverifiable`);
      return replayFixture(fixture, brief, evidenceDir);
    } catch (err) {
      log(`fixture for ${brief.txnRef} rejected: ${(err as Error).message}`);
    }
  }
  return standIn(brief);
}
