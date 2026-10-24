// Entry point: load env, connect as the agent identity, subscribe, run the loop until SIGINT or SIGTERM.
import { loadDotEnv, nowIso, parseConfig } from './config.js';
import { WorkerLoop } from './loop.js';
import { connect, subscribe } from './stdb.js';

const log = (msg: string) => console.log(`${nowIso()} ${msg}`);

async function main(): Promise<void> {
  loadDotEnv();
  const cfg = parseConfig();
  if (cfg.requestedMode !== cfg.mode) log(`WORKER_MODE=${cfg.requestedMode} requested but FACTORY_API_KEY is empty; running replay`);
  log(`worker starting: ${cfg.stdbUri} ${cfg.stdbDb} mode=${cfg.mode} evidence=${cfg.evidenceDir} fixtures=${cfg.fixturesDir}`);

  const { conn, identityHex } = await connect(cfg, log);
  log(`connected as agent identity ${identityHex}`);
  await subscribe(conn);
  log(`subscriptions applied: ${[...conn.db.agentTask.iter()].filter(t => t.status === 'open').length} open task(s), ${conn.db.matchResult.count()} match_result row(s), ${conn.db.hold.count()} hold(s), ${conn.db.rule.count()} rule(s)`);

  const loop = new WorkerLoop({ conn, cfg, log });
  loop.start();

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log(`${signal} received; finishing in-flight tasks`);
    await loop.stop();
    conn.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch(err => {
  console.error(`${nowIso()} fatal: ${(err as Error).stack ?? String(err)}`);
  process.exit(1);
});
