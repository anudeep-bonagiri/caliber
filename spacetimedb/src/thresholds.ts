// Every numeric limit the kernel uses, in one place. Money is bigint cents.
export const T = {
  LOCATION_MILES: 25,
  PING_WINDOW_MIN: 30,
  TANK_FACTOR: 1.1,
  TOLL_DUP_MIN: 10,
  RATE_VARIANCE: 0.05,
  INVOICE_DUP_DAYS: 30,
  BANK_CHANGE_DAYS: 7,
  BANK_CHANGE_MIN_CENTS: 500_000n,
  AUTO_PAY_MAX_CENTS: 250_000n,
  AUTO_PAY_DAY_MAX_CENTS: 4_000_000n,
  TOTAL_DAYS: 92,
} as const;

// The only conditions a rule may clear. Checked in the reducer, not in a prompt.
// capacity_exceeded, vendor_bank_change, duplicate_toll, duplicate_invoice, short_received and po_mismatch can never be ruled away.
export const RULE_CONDITIONS = ['location_mismatch', 'rate_variance'] as const;

// Exception codes the kernel can raise. 'matched' is clean, 'limit' is a policy hold, not an exception.
export const CODES = [
  'matched',
  'limit',
  'location_mismatch',
  'capacity_exceeded',
  'rate_variance',
  'duplicate_toll',
  'duplicate_invoice',
  'vendor_bank_change',
  'short_received',
  'po_mismatch',
] as const;
export type Code = (typeof CODES)[number];
