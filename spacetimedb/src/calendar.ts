// Simulated calendar: business day 1 is Wednesday 2026-07-01; weekends are skipped.
// Pure arithmetic on UTC day numbers so the module stays deterministic.
const DAY_MS = 86_400_000;
const START_UTC = Date.UTC(2026, 6, 1); // 2026-07-01

export function dateForDay(day: number): string {
  if (day <= 0) return '2026-07-01';
  let remaining = day;
  let ms = START_UTC - DAY_MS;
  while (remaining > 0) {
    ms += DAY_MS;
    const dow = new Date(ms).getUTCDay();
    if (dow !== 0 && dow !== 6) remaining -= 1;
  }
  return new Date(ms).toISOString().slice(0, 10);
}

export function microsForDay(day: number, hour = 0, minute = 0): bigint {
  const [y, m, d] = dateForDay(day).split('-').map(Number);
  return BigInt(Date.UTC(y, m - 1, d, hour, minute)) * 1000n;
}
