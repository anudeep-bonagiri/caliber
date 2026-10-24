// Probe: one Nessie transfer, 123 cents, from the carrier account to the fuel-and-tolls payee, through
// NessieClient.transfer exactly as the settlement watcher sends it. Every request body and every response
// (status and body) is printed with the key scrubbed, then the created transfer is read back with GET so the
// amount the bank stored is visible. This is how the accepted request shape, decimal handling and id field were
// established (2026-10-24). It moves mock-bank money only; it never touches the ledger.
// Run from worker/:  npx tsx tools/nessie_probe.mts
import { loadDotEnv, parseNessieConfig } from '../src/config.js';
import { NessieClient } from '../src/nessie.js';
import { readAccounts } from '../src/settle.js';

loadDotEnv();
const cfg = parseNessieConfig();
if (!cfg.apiKey) throw new Error('NESSIE_API_KEY is empty');
const accounts = readAccounts(cfg.accountsFile);
if (!accounts) throw new Error(`${cfg.accountsFile} not found; run scripts/nessie_seed.py`);

const scrub = (s: string) => s.split(cfg.apiKey).join('***');
const cents = BigInt(process.argv[2] ?? '123');
const description = `probe ${new Date().toISOString()}`;

let calls = 0;
const loggingFetch: typeof fetch = async (input, init) => {
  calls++;
  const url = scrub(String(input));
  console.log(`request ${calls}: ${init?.method ?? 'GET'} ${url}`);
  if (init?.body) console.log(`request ${calls} body: ${scrub(String(init.body))}`);
  const t0 = Date.now();
  const res = await fetch(input, init);
  const text = await res.text();
  console.log(`response ${calls}: HTTP ${res.status} in ${Date.now() - t0} ms`);
  console.log(`response ${calls} body: ${scrub(text).slice(0, 600)}`);
  return new Response(text, { status: res.status, statusText: res.statusText, headers: res.headers });
};

const bank = new NessieClient({ apiKey: cfg.apiKey, base: cfg.base, fetchImpl: loggingFetch });
console.log(`probe: ${cents} cents, carrier -> fuel-and-tolls payee, description "${description}"`);
const t0 = Date.now();
const id = await bank.transfer({ fromAccount: accounts.carrierAccountId, toAccount: accounts.fuelTollsAccountId, cents, description });
console.log(`transfer id: ${id} (compact shape used: ${bank.usingCompactShape}) total ${Date.now() - t0} ms over ${calls} request(s)`);

// Read it back so the stored amount is on record, not just the request we sent.
const readUrl = `${cfg.base}/transfers/${encodeURIComponent(id)}?key=${encodeURIComponent(cfg.apiKey)}`;
const r = await fetch(readUrl, { headers: { Accept: 'application/json' } });
const stored = scrub(await r.text());
console.log(`GET /transfers/{id}: HTTP ${r.status} ${stored.slice(0, 600)}`);
