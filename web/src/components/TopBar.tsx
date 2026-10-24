import { useEffect, useMemo, useRef } from 'react';
import { useSpacetimeDB, useTable } from 'spacetimedb/react';
import { tables } from '../../../module_bindings';
import { Pill } from './ui';
import { identityHex } from '../lib/format';
import { EXCEPTION_CODES } from '../lib/types';
import { STDB_DB } from '../stdb';

export function TopBar({
  codeFilter,
  onCodeFilter,
  codesInQueue,
  modelOffline,
}: {
  codeFilter: string;
  onCodeFilter: (code: string) => void;
  codesInQueue: string[];
  modelOffline: boolean;
}) {
  const { isActive, identity, connectionError } = useSpacetimeDB();
  // Task 21: what the inbox file connector brought in, read from the public ingest_log table (one row per batch).
  const [ingests] = useTable(tables.ingestLog);
  const ingested = useMemo(() => {
    const files = new Set<string>();
    let rows = 0;
    const ids: string[] = [];
    for (const r of ingests) {
      files.add(r.fileName);
      rows += r.rows;
      ids.push(String(r.id));
    }
    return { files: files.size, rows, ids };
  }, [ingests]);
  const everConnected = useRef(false);
  useEffect(() => {
    if (isActive) everConnected.current = true;
  }, [isActive]);

  const hex = identityHex(identity);
  let state: { label: string; tone: 'release' | 'hold' | 'refused' } = { label: 'connecting', tone: 'hold' };
  if (isActive) state = { label: `connected ${hex.slice(0, 8)}`, tone: 'release' };
  else if (everConnected.current) state = { label: 'reconnecting', tone: 'hold' };
  else if (connectionError) state = { label: 'database unreachable', tone: 'refused' };

  const codes = Array.from(new Set<string>([...EXCEPTION_CODES, ...codesInQueue])).sort();

  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-edge bg-panel px-4 py-2">
      <div className="flex items-baseline gap-2">
        <span className="text-[15px] font-semibold tracking-tight text-text">Caliber</span>
        <span className="text-[11px] text-faint">accounts payable, read only</span>
      </div>
      <div className="flex items-center gap-2">
        <Pill
          tone={state.tone}
          dot
          title={
            isActive
              ? `Anonymous identity ${hex}. Database ${STDB_DB}. This page holds no role, so it can read public tables and nothing else.`
              : connectionError?.message ?? 'Waiting for the SpacetimeDB WebSocket'
          }
        >
          {state.label}
        </Pill>
        <Pill
          tone={ingested.files > 0 ? 'candidate' : 'hold'}
          title={ingested.ids.length ? `ingest_log ${ingested.ids.join(', ')}: ${ingested.files} distinct file_name, sum of rows` : 'ingest_log (no rows): nothing has been dropped into inbox/ in this run'}
        >
          {ingested.files} files ingested today, {ingested.rows.toLocaleString('en-US')} rows
        </Pill>
        <Pill tone="hold" title="scripts/ingest_watch.py reads CSV files dropped into inbox/ and hands the rows to the ingest_rows reducer; there is no WEX, toll-authority or accounting API integration (docs/not-built.md)">
          file connector; API connectors not built
        </Pill>
        {modelOffline ? (
          <Pill tone="refused" title="The most recent investigated agent_task has source = none. Findings are scripted stand-ins until a model is back.">
            model offline
          </Pill>
        ) : null}
      </div>
      <label className="ml-auto flex items-center gap-2 text-[11px] text-muted">
        <span>queue filter</span>
        <select
          value={codeFilter}
          onChange={e => onCodeFilter(e.target.value)}
          className="rounded-sm border border-edge-2 bg-bg px-2 py-1 font-mono text-[11.5px] text-text outline-none focus:border-hold"
        >
          <option value="">all codes</option>
          {codes.map(c => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
    </header>
  );
}
