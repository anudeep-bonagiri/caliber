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
  AUTO_PAY_DAY_MAX_CENTS: 6_000_000n,
  TOTAL_DAYS: 92,
} as const;

// Conditions a rule may never clear. Checked in the reducer, not in a prompt.
export const FORBIDDEN_RULE_CONDITIONS = ['capacity_exceeded', 'vendor_bank_change', 'duplicate_toll'] as const;

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
] as const;
export type Code = (typeof CODES)[number];
