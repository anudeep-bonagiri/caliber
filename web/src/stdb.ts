import { DbConnection } from '../../module_bindings';

const rawUri = import.meta.env.VITE_STDB_URI ?? 'http://127.0.0.1:3100';
export const STDB_URI: string = rawUri.replace(/\/$/, '');
export const STDB_DB: string = import.meta.env.VITE_STDB_DB ?? 'dispatch-ledger';

// The builder accepts http(s) and upgrades to ws(s) itself. The HTTP form is
// what fetch() needs for the one metadata call (module identity) in useModuleIdentity.
export const STDB_HTTP: string = STDB_URI.replace(/^ws/, 'http');

const TOKEN_KEY = `${STDB_URI}/${STDB_DB}/auth_token`;

function readToken(): string | undefined {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function saveToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // private mode or storage blocked; the server mints a fresh anonymous identity next time
  }
}

// Built once at module load so SpacetimeDBProvider sees a stable builder.
// Anonymous identity: no role row, so the module lets it read public tables only.
// useTable() registers its own subscription per query, so nothing is subscribed here.
export const connectionBuilder = DbConnection.builder()
  .withUri(STDB_URI)
  .withDatabaseName(STDB_DB)
  .withToken(readToken())
  .withLightMode(true)
  .withAutomaticReconnect()
  .onConnect((_conn, identity, token) => {
    saveToken(token);
    console.info('[stdb] connected as', identity.toHexString().slice(0, 12));
  })
  .onAutomaticReconnect((_conn, identity, token) => {
    saveToken(token);
    console.info('[stdb] reconnected as', identity.toHexString().slice(0, 12));
  })
  .onDisconnect((_ctx, error, attempt, delayMs) => {
    console.warn('[stdb] disconnected', attempt === undefined ? '' : `retry ${attempt} in ${delayMs} ms`, error ?? '');
  })
  .onConnectError((_ctx, error) => {
    console.warn('[stdb] connect error', error);
  });
