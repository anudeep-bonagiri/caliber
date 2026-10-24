import { useEffect, useMemo, useState } from 'react';
import { useTable } from 'spacetimedb/react';
import { tables } from '../../module_bindings';
import { TopBar } from './components/TopBar';
import { DayClock } from './components/DayClock';
import { Queue } from './components/Queue';
import { Investigation } from './components/Investigation';
import { Rules } from './components/Rules';
import { LedgerOfTrust } from './components/LedgerOfTrust';
import { Charts } from './components/Charts';
import { useModuleIdentity } from './lib/useModuleIdentity';

export default function App() {
  // One live subscription per public table. useTable registers the SQL
  // subscription itself and re-renders on every committed transaction.
  const [days] = useTable(tables.businessDay);
  const [holds, holdsReady] = useTable(tables.hold);
  const [tasks, tasksReady] = useTable(tables.agentTask);
  const [rules, rulesReady] = useTable(tables.rule);
  const [totals] = useTable(tables.dayTotal);
  const [events, eventsReady] = useTable(tables.auditEvent);
  const [matches] = useTable(tables.matchResult);

  const moduleIdentity = useModuleIdentity();
  const [codeFilter, setCodeFilter] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const day = days[0];
  const today = day?.day;

  const selectedHold = useMemo(() => (selected ? holds.find(h => h.txnRef === selected) : undefined), [holds, selected]);

  // Select the newest open hold when nothing is selected so the investigation
  // panel is never blank while the clock runs.
  useEffect(() => {
    if (selectedHold) return;
    let best: (typeof holds)[number] | undefined;
    for (const h of holds) {
      if (codeFilter && h.code !== codeFilter) continue;
      if (!best || h.updatedAt.microsSinceUnixEpoch > best.updatedAt.microsSinceUnixEpoch) best = h;
    }
    if (best) setSelected(best.txnRef);
  }, [holds, selectedHold, codeFilter]);

  const codesInQueue = useMemo(() => Array.from(new Set(holds.map(h => h.code))), [holds]);

  const modelOffline = useMemo(() => {
    let latest: (typeof tasks)[number] | undefined;
    for (const t of tasks) {
      if (t.status !== 'investigated') continue;
      if (!latest || t.updatedAt.microsSinceUnixEpoch > latest.updatedAt.microsSinceUnixEpoch) latest = t;
    }
    return latest?.source === 'none';
  }, [tasks]);

  return (
    <div className="flex h-full min-h-screen flex-col bg-bg text-text">
      <TopBar codeFilter={codeFilter} onCodeFilter={setCodeFilter} codesInQueue={codesInQueue} modelOffline={modelOffline} />
      <main className="grid flex-1 grid-cols-1 gap-3 p-3 xl:min-h-[calc(100vh-45px)] xl:grid-cols-12 xl:grid-rows-[minmax(380px,5fr)_minmax(300px,4fr)_320px]">
        <div className="flex min-h-0 flex-col gap-3 xl:col-span-4 xl:row-span-1">
          <DayClock day={day} />
          <div className="min-h-[260px] flex-1 xl:min-h-0 [&>section]:h-full">
            <Queue holds={holds} ready={holdsReady} codeFilter={codeFilter} selected={selected} onSelect={setSelected} moduleIdentity={moduleIdentity} />
          </div>
        </div>
        <div className="min-h-[320px] xl:col-span-8 xl:row-span-1 xl:min-h-0 [&>section]:h-full">
          <Investigation hold={selectedHold} tasks={tasks} matches={matches} ready={tasksReady} />
        </div>
        <div className="min-h-[260px] xl:col-span-4 xl:min-h-0 [&>section]:h-full">
          <Rules rules={rules} ready={rulesReady} today={today} />
        </div>
        <div className="min-h-[320px] xl:col-span-8 xl:min-h-0 [&>section]:h-full">
          <LedgerOfTrust totals={totals} holds={holds} events={events} ready={eventsReady} today={today} />
        </div>
        <div className="min-h-[260px] xl:col-span-12 xl:min-h-0 [&>section]:h-full">
          <Charts />
        </div>
      </main>
    </div>
  );
}
