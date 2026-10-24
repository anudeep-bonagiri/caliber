import { useEffect, useState } from 'react';
import { STDB_DB, STDB_HTTP } from '../stdb';

// The kernel raises holds with requestedBy = the module's own identity.
// GET /v1/database/{db} returns it as database_identity, so the dashboard
// can label a requester "kernel" or "agent" without hardcoding a hex string.
export function useModuleIdentity(): string | undefined {
  const [hex, setHex] = useState<string | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`${STDB_HTTP}/v1/database/${STDB_DB}`);
        if (!res.ok) return;
        const body = (await res.json()) as { database_identity?: { __identity__?: string } };
        const raw = body.database_identity?.__identity__;
        if (raw && !cancelled) setHex(raw.replace(/^0x/, '').toLowerCase());
      } catch {
        // offline or wrong URI; requester role falls back to the reason prefix
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);
  return hex;
}
