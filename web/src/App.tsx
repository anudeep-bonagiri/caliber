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
import { RESOLVED_HOLD_STATUSES } from './lib/types';

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
  const [payments] = useTable(tables.payment);

  const moduleIdentity = useModuleIdentity();
  const [codeFilter, setCodeFilter] = useState('');
  const [selected, setSelectedRaw] = useState<string | null>(null);
  const [pinned, setPinned] = useState(false);
  const setSelected = (txnRef: string) => {
    setPinned(true);
    setSelectedRaw(txnRef);
  };

  const day = days[0];
  const today = day?.day;

  const selectedHold = useMemo(() => (selected ? holds.find(h => h.txnRef === selected) : undefined), [holds, selected]);

  // Until the judge clicks a hold, follow the newest open one so the
  // investigation panel shows what the worker is doing right now.
  useEffect(() => {
    if (pinned && selectedHold) return;
    let best: (typeof holds)[number] | undefined;
    let bestOpen = false;
    for (const h of holds) {
      if (codeFilter && h.code !== codeFilter) continue;
      const open = !RESOLVED_HOLD_STATUSES.has(h.status);
      if (open && !bestOpen) {
        best = h;
        bestOpen = true;
        continue;
      }
      if (open !== bestOpen) continue;
      if (!best || h.updatedAt.microsSinceUnixEpoch > best.updatedAt.microsSinceUnixEpoch) best = h;
    }
    if (best && best.txnRef !== selected) setSelectedRaw(best.txnRef);
  }, [holds, selectedHold, codeFilter, pinned, selected]);

  const paymentsByRef = useMemo(() => new Map(payments.map(p => [p.txnRef, p])), [payments]);
  const selectedPayment = selected ? paymentsByRef.get(selected) : undefined;

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
      <main className="grid flex-1 grid-cols-1 gap-2 p-2 xl:min-h-[calc(100vh-45px)] xl:grid-cols-12 xl:grid-rows-[minmax(340px,5fr)_minmax(280px,4fr)_290px]">
        <div className="flex min-h-0 flex-col gap-2 xl:col-span-4 xl:row-span-1">
          <DayClock day={day} />
          <div className="min-h-[260px] flex-1 xl:min-h-0 [&>section]:h-full">
            <Queue holds={holds} ready={holdsReady} codeFilter={codeFilter} selected={selected} onSelect={setSelected} moduleIdentity={moduleIdentity} payments={paymentsByRef} />
          </div>
        </div>
        <div className="min-h-[320px] xl:col-span-8 xl:row-span-1 xl:min-h-0 [&>section]:h-full">
          <Investigation hold={selectedHold} tasks={tasks} matches={matches} payment={selectedPayment} ready={tasksReady} />
        </div>
        <div className="min-h-[260px] xl:col-span-4 xl:min-h-0 [&>section]:h-full">
          <Rules rules={rules} ready={rulesReady} today={today} />
        </div>
        <div className="min-h-[320px] xl:col-span-8 xl:min-h-0 [&>section]:h-full">
          <LedgerOfTrust totals={totals} holds={holds} events={events} payments={payments} ready={eventsReady} today={today} />
        </div>
        <div className="min-h-[260px] xl:col-span-12 xl:min-h-0 [&>section]:h-full">
          <Charts />
        </div>
      </main>
    </div>
  );
}
