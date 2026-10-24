// Capital One Nessie (a mock bank) client. One call per settled payment: a transfer from the carrier's
// account to the payee's, returning the bank's transfer id. The API key rides in the query string, so request
// URLs are never logged and every error message is scrubbed of the key before it leaves this file.
//
// Two request shapes. The documented one sends {medium, payee_id, amount (dollars), transaction_date,
// description}. The server answering at api.nessieisreal.com on 2026-10-24 rejected medium and payee_id as
// "extra fields not permitted", required `status`, and validated `amount` as an integer: a decimal is accepted
// with 201 and then stored floored (1.99 lands as 1), a string is refused. On that refusal the client switches
// to the compact shape for the rest of the process and sends the amount as integer cents, the only encoding
// that server stores exactly, with the payee account, the dollar figure and the unit in the description so the
// bank record names all three. Nothing is rounded anywhere in this file.

export type NessieErrorKind = 'config' | 'http' | 'network' | 'timeout' | 'bad_response';

export class NessieError extends Error {
  constructor(
    readonly kind: NessieErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'NessieError';
  }

  // 4xx answers are deterministic (bad body, bad key); retrying them only repeats the refusal.
  get retryable(): boolean {
    if (this.kind === 'network' || this.kind === 'timeout') return true;
    if (this.kind !== 'http' || this.status === undefined) return false;
    return this.status >= 500 || this.status === 429;
  }
}

export interface TransferArgs {
  fromAccount: string;
  toAccount: string;
  cents: bigint | number;
  description: string;
}

export interface Bank {
  transfer(a: TransferArgs): Promise<string>;
}

export interface NessieOptions {
  apiKey: string;
  base: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  today?: () => string;
}

export const DEFAULT_NESSIE_BASE = 'https://api.nessieisreal.com';

// Nessie amounts are dollars. Cents arrive as integers (bigint from the module), so this is exact to 2 places.
export function centsToDollars(cents: bigint | number): number {
  const c = typeof cents === 'bigint' ? cents : BigInt(Math.round(cents));
  const neg = c < 0n;
  const abs = neg ? -c : c;
  const v = Number(abs / 100n) + Number(abs % 100n) / 100;
  return neg ? -v : v;
}

export function dollarString(cents: bigint | number): string {
  return centsToDollars(cents).toFixed(2);
}

// The compact shape's integer amount: cents, unchanged. A non-integer number of cents is a caller bug, not
// something to round quietly on the way to a bank.
export function exactCents(cents: bigint | number): number {
  if (typeof cents === 'bigint') return Number(cents);
  if (!Number.isInteger(cents)) throw new NessieError('config', `amount must be whole cents, got ${cents}`);
  return cents;
}

const EXTRA_FIELDS = /extra fields not permitted/i;

export class NessieClient implements Bank {
  private readonly apiKey: string;
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly today: () => string;
  private compact = false;

  constructor(o: NessieOptions) {
    if (!o.apiKey.trim()) throw new NessieError('config', 'NESSIE_API_KEY is empty');
    this.apiKey = o.apiKey.trim();
    this.base = (o.base.trim() || DEFAULT_NESSIE_BASE).replace(/\/+$/, '');
    this.fetchImpl = o.fetchImpl ?? fetch;
    this.timeoutMs = o.timeoutMs ?? 15_000;
    this.today = o.today ?? (() => new Date().toISOString().slice(0, 10));
  }

  get usingCompactShape(): boolean {
    return this.compact;
  }

  async transfer(a: TransferArgs): Promise<string> {
    if (!a.fromAccount || !a.toAccount) throw new NessieError('config', 'transfer needs both a from and a to account');
    const path = `/accounts/${encodeURIComponent(a.fromAccount)}/transfers`;
    const date = this.today();
    if (!this.compact) {
      try {
        return await this.post(path, {
          medium: 'balance',
          payee_id: a.toAccount,
          amount: centsToDollars(a.cents),
          transaction_date: date,
          description: a.description,
        });
      } catch (err) {
        if (!(err instanceof NessieError && err.status === 400 && EXTRA_FIELDS.test(err.message))) throw err;
        this.compact = true;
      }
    }
    return this.post(path, {
      amount: exactCents(a.cents),
      transaction_date: date,
      status: 'pending',
      description: `${a.description} payee ${a.toAccount} amount $${dollarString(a.cents)} (amount field in cents)`,
    });
  }

  private scrub(s: string): string {
    return s.split(this.apiKey).join('***');
  }

  private async post(path: string, body: Record<string, unknown>): Promise<string> {
    const url = `${this.base}${path}?key=${encodeURIComponent(this.apiKey)}`;
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      const e = err as Error;
      if (e?.name === 'TimeoutError' || e?.name === 'AbortError') throw new NessieError('timeout', `POST ${path} timed out after ${this.timeoutMs} ms`);
      throw new NessieError('network', this.scrub(`POST ${path} failed: ${e?.message ?? String(err)}`));
    }
    const text = await res.text().catch(() => '');
    if (!res.ok) throw new NessieError('http', this.scrub(`POST ${path} returned ${res.status}: ${text.slice(0, 300)}`), res.status);
    const id = createdId(text);
    if (!id) throw new NessieError('bad_response', this.scrub(`POST ${path} returned ${res.status} without an id: ${text.slice(0, 300)}`), res.status);
    return id;
  }
}

// Nessie answers {code, message, objectCreated: {_id, ...}}; accept a bare object with _id or id as well.
export function createdId(text: string): string | undefined {
  let j: unknown;
  try {
    j = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!j || typeof j !== 'object') return undefined;
  const o = j as Record<string, unknown>;
  const inner = o.objectCreated && typeof o.objectCreated === 'object' ? (o.objectCreated as Record<string, unknown>) : o;
  const id = inner._id ?? inner.id;
  return typeof id === 'string' && id.trim() ? id : undefined;
}
