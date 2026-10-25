import { useEffect, useMemo, useState } from 'react';
import { useSpacetimeDB, useTable } from 'spacetimedb/react';
import { tables } from '../../../module_bindings';
import { CustomerPage, type LedgerRows } from './Screens';
import '@fontsource-variable/inter';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './customer.css';

// The controller's screen. Same public tables as the console, same anonymous identity, no token,
// no reducer calls: every decision is a link to the controller seat on ASI:One (D-7, G12).
export default function CustomerApp() {
  const [days] = useTable(tables.businessDay);
  const [holds] = useTable(tables.hold);
  const [tasks] = useTable(tables.agentTask);
  const [rules] = useTable(tables.rule);
  const [events] = useTable(tables.auditEvent);
  const [matches] = useTable(tables.matchResult);
  const [payments] = useTable(tables.payment);
  const [ingests] = useTable(tables.ingestLog);
  const { isActive } = useSpacetimeDB();

  // The greeting follows the browser clock; re-read it every minute.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const day = days[0];
  const rows = useMemo<LedgerRows>(
    () => ({ today: day?.day, date: day?.date, holds, tasks, rules, events, matches, payments, ingests }),
    [day, holds, tasks, rules, events, matches, payments, ingests],
  );
  return <CustomerPage rows={rows} now={now} connected={isActive} />;
}
