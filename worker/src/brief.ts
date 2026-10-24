// brief_json parsing and the investigator prompt. The prompt names only files that exist under EVIDENCE_DIR.
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const Ping = z.object({
  lat: z.number(),
  lon: z.number(),
  atMicros: z.union([z.string(), z.number()]).optional(),
  deltaMin: z.number().optional(),
  engineOn: z.boolean().optional(),
  odometer: z.number().optional(),
});

// Evidence keys differ by code; keep the known ones typed and let the rest through.
export const EvidenceSchema = z
  .object({
    txnRef: z.string().optional(),
    truckId: z.number().optional(),
    driverId: z.number().optional(),
    driverName: z.string().optional(),
    plate: z.string().optional(),
    cardId: z.string().optional(),
    vendorId: z.number().optional(),
    vendorName: z.string().optional(),
    stationName: z.string().optional(),
    stationLat: z.number().optional(),
    stationLon: z.number().optional(),
    nearestPing: Ping.nullable().optional(),
    distanceMiles: z.number().optional(),
    thresholdMiles: z.number().optional(),
    gallons: z.number().optional(),
    tankGal: z.number().optional(),
    capacityLimitGal: z.number().optional(),
    merchant: z.string().optional(),
    reason: z.string().optional(),
  })
  .passthrough();
export type Evidence = z.infer<typeof EvidenceSchema>;

export const BriefSchema = z
  .object({
    txnRef: z.string().min(1),
    kind: z.string(),
    code: z.string().min(1),
    cents: z.union([z.string(), z.number()]).transform(v => String(v)),
    day: z.number().int(),
    date: z.string().optional(),
    evidence: EvidenceSchema,
    questionHint: z.string().optional().default(''),
    // present only for kind = draft_rule
    question: z.string().optional(),
    answer: z.string().optional(),
  })
  .passthrough();
export type Brief = z.infer<typeof BriefSchema>;

export function parseBrief(json: string): Brief {
  return BriefSchema.parse(JSON.parse(json));
}

export const MCP_SOURCES = ['find_trips_near', 'contract_rate_for_vendor'] as const;

export interface EvidenceFile {
  rel: string;
  meaning: string;
  exists: boolean;
}

// Which evidence files this task may open, with what each one means.
export function evidenceFiles(brief: Brief, evidenceDir: string): EvidenceFile[] {
  const ev = brief.evidence;
  const candidates: Array<[string, string]> = [
    [`receipts/${brief.txnRef}.txt`, 'the receipt or fuel ticket for this transaction'],
    ['swap_log.txt', 'the dispatcher log of drivers moved between units (truck swaps, shop days)'],
    [`telematics/${brief.day}.csv`, `GPS pings for every truck on business day ${brief.day} (truck_id, at, lat, lon, odometer, engine_on)`],
  ];
  if (typeof ev.vendorId === 'number') {
    candidates.push([`contracts/${ev.vendorId}.txt`, `the contract with vendor ${ev.vendorId} (rates, validity, clauses)`]);
  }
  if (brief.kind === 'invoice') {
    candidates.push([`invoices/${brief.txnRef}.txt`, 'the invoice document as received']);
    const poId = (ev as Record<string, unknown>).poId;
    if (typeof poId === 'string' && poId) candidates.push([`invoices/${poId}.txt`, `the purchase order ${poId}`]);
  }
  return candidates.map(([rel, meaning]) => ({ rel, meaning, exists: fs.existsSync(path.join(evidenceDir, rel)) }));
}

export function centsToDollars(cents: string | number | bigint): string {
  const n = typeof cents === 'bigint' ? cents : BigInt(String(cents).replace(/[^0-9-]/g, '') || '0');
  const sign = n < 0n ? '-' : '';
  const abs = n < 0n ? -n : n;
  return `${sign}$${(abs / 100n).toString()}.${(abs % 100n).toString().padStart(2, '0')}`;
}

function describeEvidence(brief: Brief): string[] {
  const ev = brief.evidence;
  const lines: string[] = [];
  if (ev.truckId !== undefined) lines.push(`Truck: ${ev.truckId}${ev.plate ? ` (plate ${ev.plate})` : ''}`);
  if (ev.driverId !== undefined) lines.push(`Driver: ${ev.driverId}${ev.driverName ? ` ${ev.driverName}` : ''}`);
  if (ev.cardId) lines.push(`Fuel card: ${ev.cardId}`);
  if (ev.stationName) lines.push(`Station: ${ev.stationName}${ev.stationLat !== undefined ? ` at lat ${ev.stationLat}, lon ${ev.stationLon}` : ''}`);
  if (ev.merchant) lines.push(`Merchant string: ${ev.merchant}`);
  if (ev.gallons !== undefined) lines.push(`Gallons: ${ev.gallons}${ev.tankGal !== undefined ? ` (tank ${ev.tankGal} gal, limit ${ev.capacityLimitGal} gal)` : ''}`);
  if (ev.nearestPing) {
    const p = ev.nearestPing;
    lines.push(`Nearest ping of this truck: lat ${p.lat}, lon ${p.lon}, ${p.deltaMin ?? '?'} min away, engine ${p.engineOn ? 'on' : 'off'}${p.odometer !== undefined ? `, odometer ${p.odometer}` : ''}`);
  } else if (ev.nearestPing === null) {
    lines.push('Nearest ping of this truck: none inside the window');
  }
  if (ev.distanceMiles !== undefined) lines.push(`Distance station to ping: ${ev.distanceMiles} miles (threshold ${ev.thresholdMiles} miles)`);
  if (ev.vendorId !== undefined) lines.push(`Vendor: ${ev.vendorId}${ev.vendorName ? ` ${ev.vendorName}` : ''}`);
  if (ev.reason) lines.push(`Kernel note: ${ev.reason}`);
  // any other scalar the kernel recorded, so nothing the UI shows is hidden from the investigator
  const known = new Set(['txnRef', 'truckId', 'driverId', 'driverName', 'plate', 'cardId', 'stationName', 'stationLat', 'stationLon', 'merchant', 'gallons', 'tankGal', 'capacityLimitGal', 'nearestPing', 'distanceMiles', 'thresholdMiles', 'vendorId', 'vendorName', 'reason', 'cents', 'day', 'date', 'atMicros']);
  for (const [k, v] of Object.entries(ev)) {
    if (known.has(k) || v === null || v === undefined || typeof v === 'object') continue;
    lines.push(`${k}: ${String(v)}`);
  }
  return lines;
}

// The investigator prompt. It states the kernel code, the numbers, the question, and the files it may open.
export function buildPrompt(brief: Brief, evidenceDir: string): string {
  const files = evidenceFiles(brief, evidenceDir);
  const present = files.filter(f => f.exists);
  const lines: string[] = [];
  lines.push(`You are investigating one accounts-payable exception for a trucking carrier.`);
  lines.push(`Transaction ${brief.txnRef} (${brief.kind}) on business day ${brief.day}${brief.date ? ` (${brief.date})` : ''}, amount ${centsToDollars(brief.cents)}.`);
  lines.push(`The matching kernel raised the code: ${brief.code}.`);
  lines.push('');
  lines.push('Kernel evidence:');
  for (const l of describeEvidence(brief)) lines.push(`- ${l}`);
  lines.push('');
  if (brief.questionHint) lines.push(`The question to answer: ${brief.questionHint}`);
  lines.push('');
  lines.push(`Evidence files you may open with Read or Grep, relative to your working directory (${evidenceDir}):`);
  if (present.length === 0) lines.push('- (no evidence files are present for this transaction)');
  for (const f of present) lines.push(`- ${f.rel}: ${f.meaning}`);
  lines.push('');
  lines.push('Tools that may also be available: find_trips_near(point_wkt, radius_m, since, until) lists trucks that pinged near a WKT point (longitude first, POINT(lon lat)); use a window of 10 minutes either side of the transaction time and a radius of 3000 m; contract_rate_for_vendor(vendor_id, item, on) returns the contracted rate.');
  lines.push('');
  lines.push('Rules: do not modify or create files. Quote evidence exactly; every evidence entry must name its source as a file path from the list above or the tool name you called. Do not invent numbers.');
  lines.push('Recommend clear only when the evidence explains the exception fully. Recommend hold_and_ask with one precise question when a person must confirm. Recommend hold otherwise. You can never recommend paying; payment is a controller decision.');
  lines.push('Return the structured finding when you are done.');
  return lines.join('\n');
}
