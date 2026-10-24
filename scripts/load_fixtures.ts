// Loads seed/fixtures/*.json into the module through the seed_* reducers, 500 rows per call.
// Usage: STDB_SEED_TOKEN=... npx tsx scripts/load_fixtures.ts [--fixtures seed/fixtures] [--skip-transactions]
//   --skip-transactions  load company data only (no card_txn, toll_txn or invoice rows); the inbox file
//                        connector (scripts/ingest_watch.py) brings those in from dropped files (Task 21).
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { Timestamp } from 'spacetimedb';
import { DbConnection } from '../module_bindings/index.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
dotenv.config({ path: resolve(root, '.env') });
const argIdx = process.argv.indexOf('--fixtures');
const FIX = resolve(root, argIdx > 0 ? process.argv[argIdx + 1] : 'seed/fixtures');
const SKIP_TXNS = process.argv.includes('--skip-transactions');
const URI = process.env.STDB_URI ?? 'http://127.0.0.1:3100';
const DB = process.env.STDB_DB ?? 'dispatch-ledger';
const TOKEN = process.env.STDB_SEED_TOKEN;
if (!TOKEN) { console.error('STDB_SEED_TOKEN is required'); process.exit(2); }
const CHUNK = 500;

function readRows(name: string): any[] {
  const json = resolve(FIX, `${name}.json`);
  const jsonl = resolve(FIX, `${name}.jsonl`);
  if (existsSync(json)) return JSON.parse(readFileSync(json, 'utf8'));
  if (existsSync(jsonl)) return readFileSync(jsonl, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
  throw new Error(`missing fixture ${name}`);
}
const ts = (iso: string) => Timestamp.fromDate(new Date(iso));
const big = (n: number | string) => BigInt(n);

async function main() {
  const t0 = Date.now();
  const conn = await new Promise<DbConnection>((res, rej) => {
    DbConnection.builder()
      .withUri(URI)
      .withDatabaseName(DB)
      .withToken(TOKEN)
      .onConnect(c => res(c))
      .onConnectError((_c, e) => rej(e))
      .build();
  });
  console.log('connected to', URI, DB);

  async function send<T>(label: string, rows: T[], call: (chunk: T[]) => Promise<unknown>) {
    let sent = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      await call(chunk);
      sent += chunk.length;
    }
    console.log(`${label}: ${sent} rows`);
  }

  await send('terminal', readRows('terminals'), rows => conn.reducers.seedTerminals({ rows }));
  await send('truck', readRows('trucks'), rows => conn.reducers.seedTrucks({ rows }));
  await send('driver', readRows('drivers'), rows => conn.reducers.seedDrivers({ rows }));
  await send('vendor', readRows('vendors'), rows => conn.reducers.seedVendors({ rows }));
  await send('contract', readRows('contracts').map((r: any) => ({ ...r, rateCents: big(r.rateCents) })), rows => conn.reducers.seedContracts({ rows }));
  await send('po', readRows('pos').map((r: any) => ({ ...r, unitCents: big(r.unitCents) })), rows => conn.reducers.seedPos({ rows }));
  if (SKIP_TXNS) {
    console.log('invoice, card_txn, toll_txn: skipped (--skip-transactions; the inbox file connector brings them in)');
  } else {
    await send('invoice', readRows('invoices').map((r: any) => ({ ...r, poId: r.poId ?? undefined, unitCents: big(r.unitCents), cents: big(r.cents) })), rows => conn.reducers.seedInvoices({ rows }));
    await send('card_txn', readRows('card_txns').map((r: any) => ({ ...r, at: ts(r.at), cents: big(r.cents) })), rows => conn.reducers.seedCardTxns({ rows }));
    await send('toll_txn', readRows('toll_txns').map((r: any) => ({ ...r, at: ts(r.at), cents: big(r.cents) })), rows => conn.reducers.seedTollTxns({ rows }));
  }
  await send('trip_ping', readRows('trip_pings').map((r: any) => ({ id: 0n, truckId: r.truckId, day: r.day, at: ts(r.at), lat: r.lat, lon: r.lon, odometer: r.odometer, engineOn: r.engineOn })), rows => conn.reducers.seedPings({ rows }));

  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  conn.disconnect();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
