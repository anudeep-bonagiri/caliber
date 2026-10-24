import type { Timestamp } from 'spacetimedb';

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export function dollars(cents: bigint | number | string | undefined | null, whole = false): string {
  if (cents === undefined || cents === null) return '$0.00';
  const n = typeof cents === 'bigint' ? Number(cents) : Number(cents);
  if (!Number.isFinite(n)) return '$0.00';
  return (whole ? usd0 : usd).format(n / 100);
}

export function shortHex(hex: string | undefined, n = 8): string {
  if (!hex) return '';
  return hex.replace(/^0x/, '').slice(0, n);
}

export function identityHex(id: { toHexString(): string } | undefined | null): string {
  return id ? id.toHexString().replace(/^0x/, '').toLowerCase() : '';
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-08-27" -> "Wed Aug 27" (UTC so the simulated calendar never shifts). */
export function dayLabel(iso: string | undefined): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return `${DOW[d.getUTCDay()]} ${MON[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export function clockTime(ts: Timestamp | undefined | null): string {
  if (!ts) return '';
  const d = ts.toDate();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export function isoShort(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(11, 19) + 'Z';
}

export function seconds(micros: bigint | number): string {
  const s = Number(micros) / 1e6;
  return s >= 10 ? `${s.toFixed(0)} s` : `${s.toFixed(1)} s`;
}

export function pct(x: number | undefined): string {
  if (x === undefined || !Number.isFinite(x)) return '';
  return `${Math.round(x * 100)}%`;
}

export function codeLabel(code: string): string {
  return code.replace(/_/g, ' ');
}

export function plural(n: number, one: string, many = one + 's'): string {
  return `${n} ${n === 1 ? one : many}`;
}
