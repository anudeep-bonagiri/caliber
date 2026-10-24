import { useEffect, useRef } from 'react';
import { useSpacetimeDB } from 'spacetimedb/react';
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
