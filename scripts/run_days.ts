// Advances the simulated calendar day by day through step_day (seed or controller token) and reports timing.
// Usage: npx tsx scripts/run_days.ts [--until 92] [--token-env STDB_SEED_TOKEN]
import dotenv from 'dotenv';
import { DbConnection } from '../module_bindings/index.ts';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '..', '.env') });

const until = Number(process.argv[process.argv.indexOf('--until') + 1] || 92);
const tokenEnv = process.argv.includes('--token-env') ? process.argv[process.argv.indexOf('--token-env') + 1] : 'STDB_SEED_TOKEN';
const URI = process.env.STDB_URI ?? 'http://127.0.0.1:3100';
const DB = process.env.STDB_DB ?? 'dispatch-ledger';
const TOKEN = process.env[tokenEnv];
if (!TOKEN) { console.error(`${tokenEnv} is required`); process.exit(2); }

async function main() {
  const conn = await new Promise<DbConnection>((res, rej) => {
    DbConnection.builder().withUri(URI).withDatabaseName(DB).withToken(TOKEN)
      .onConnect(c => { c.subscriptionBuilder().onApplied(() => res(c)).subscribe(['SELECT * FROM business_day']); })
      .onConnectError((_c, e) => rej(e)).build();
  });
  const day = () => [...conn.db.businessDay.iter()][0]?.day ?? 0;
  const t0 = Date.now();
  let start = day();
  console.log(`day ${start} -> ${until}`);
  while (day() < until) {
    const d0 = day();
    const s = Date.now();
    await conn.reducers.stepDay();
    // wait for the subscription to reflect the new day
    for (let i = 0; i < 200 && day() === d0; i++) await new Promise(r => setTimeout(r, 10));
    if (day() % 10 === 0 || day() === until) console.log(`day ${day()} (${Date.now() - s} ms)`);
  }
  console.log(`done: ${until - start} days in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  conn.disconnect();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
