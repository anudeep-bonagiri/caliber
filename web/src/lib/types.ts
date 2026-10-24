// Shapes of the JSON carried in string columns. See docs/CONTRACT.md.
// Everything here is parsed defensively: a malformed column renders as an
// empty state, never as a crash in front of a judge.

export const EXCEPTION_CODES = [
  'location_mismatch',
  'capacity_exceeded',
  'rate_variance',
  'duplicate_toll',
  'duplicate_invoice',
  'vendor_bank_change',
  'short_received',
  'limit',
] as const;

export const RESOLVED_HOLD_STATUSES = new Set(['released', 'rejected', 'cleared_by_rule']);

export type NearestPing = {
  lat?: number;
  lon?: number;
  atMicros?: string;
  deltaMin?: number;
  engineOn?: boolean;
  odometer?: number;
};

export type BriefEvidence = {
  truckId?: number;
  driverId?: number;
  driverName?: string;
  plate?: string;
  cardId?: string;
  stationName?: string;
  stationLat?: number;
  stationLon?: number;
  nearestPing?: NearestPing;
  distanceMiles?: number;
  thresholdMiles?: number;
  gallons?: number;
  merchant?: string;
  [key: string]: unknown;
};

export type Brief = {
  txnRef?: string;
  kind?: string;
  code?: string;
  cents?: string | number;
  day?: number;
  date?: string;
  evidence?: BriefEvidence;
  questionHint?: string;
  question?: string;
  answer?: string;
};

export type Step =
  | { type: 'tool_call'; at?: string; name?: string; toolUseId?: string; input?: unknown }
  | { type: 'tool_result'; at?: string; toolUseId?: string; toolName?: string; content?: unknown; isError?: boolean }
  | { type: 'assistant'; at?: string; text?: string }
  | { type: 'note'; at?: string; text?: string };

export type FindingEvidence = { source?: string; ref?: string; quote?: string };

export type Finding = {
  finding?: string;
  evidence?: FindingEvidence[];
  recommendation?: 'clear' | 'hold' | 'hold_and_ask' | string;
  question_for_controller?: string | null;
  confidence?: number;
  status?: 'ok' | 'replayed' | 'timeout' | 'no_fixture' | string;
  model?: string;
  durationMs?: number;
  tokenUsage?: { input?: number; output?: number };
};

export type Backtest = {
  n?: number;
  wouldClear?: number;
  openHoldsCovered?: number;
  confirmedExceptionsCovered?: number;
  trueExceptionsCleared?: number;
  window?: { fromDay?: number; toDay?: number };
  computedAt?: string;
};

export type RuleScope = {
  driverId?: number;
  truckIds?: number[];
  cardId?: string;
  vendorId?: number;
  [key: string]: unknown;
};

export type FactsByCode = {
  code: string;
  planted: number;
  raised: number;
  truePositives: number;
  precision: number;
  recall: number;
};

export type FactsByDay = {
  day: number;
  date: string;
  exceptions: number;
  autoPaid: number;
  byCode?: Record<string, number>;
};

export type Facts = { asOf?: string; byCode?: FactsByCode[]; byDay?: FactsByDay[] };

export function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    const v = JSON.parse(raw);
    return (v ?? fallback) as T;
  } catch {
    return fallback;
  }
}

export function parseSteps(raw: string): Step[] {
  const v = parseJson<unknown>(raw, []);
  return Array.isArray(v) ? (v.filter(s => s && typeof s === 'object' && 'type' in s) as Step[]) : [];
}
