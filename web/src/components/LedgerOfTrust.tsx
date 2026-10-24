import { useMemo } from 'react';
import type { AgentTask, AuditEvent, DayTotal, Hold, Payment } from '../../../module_bindings/types';
import { Panel, Pill, Src, Empty } from './ui';
import { dollars, clockTime } from '../lib/format';
import { useFlash } from '../lib/useFlash';

const FEED_LIMIT = 300;

function roleTone(role: string): 'neutral' | 'hold' | 'release' | 'candidate' {
  switch (role) {
    case 'controller':
      return 'release';
    case 'agent':
      return 'candidate';
    case 'seed':
      return 'hold';
    default:
      return 'neutral';
  }
}

export function LedgerOfTrust({
  totals,
  holds,
  events,
  payments,
  tasks,
  ready,
  today,
}: {
  totals: readonly DayTotal[];
  holds: readonly Hold[];
  events: readonly AuditEvent[];
  payments: readonly Payment[];
  tasks: readonly AgentTask[];
  ready: boolean;
  today: number | undefined;
}) {
  const total = useMemo(() => (today === undefined ? undefined : totals.find(t => t.day === today)), [totals, today]);
  const questions = useMemo(
    () => (today === undefined ? 0 : holds.reduce((n, h) => n + (h.day === today && h.question ? 1 : 0), 0)),
    [holds, today],
  );
  const paid = useMemo(() => {
    let autoCount = 0;
    let autoCents = 0n;
    let ctrlCount = 0;
    let ctrlCents = 0n;
    for (const p of payments) {
      if (p.releasedRole === 'controller') {
        ctrlCount++;
        ctrlCents += p.cents;
      } else if (p.releasedRole === 'kernel' || p.releasedRole === 'rule') {
        autoCount++;
        autoCents += p.cents;
      }
    }
    return { autoCount, autoCents, ctrlCount, ctrlCents };
  }, [payments]);
  // Honesty pass: how many recorded investigations came from a model, a
  // replay of a recorded run, or the scripted fallback (source = none).
  const provenance = useMemo(() => {
    let live = 0;
    let replayed = 0;
    let none = 0;
    const vc = { live: 0, replayed: 0, handShaped: 0, none: 0 };
    for (const t of tasks) {
      if (t.status !== 'investigated') continue;
      if (t.kind === 'investigate') {
        if (t.source === 'live') live++;
        else if (t.source === 'replayed') replayed++;
        else if (t.source === 'none') none++;
      } else if (t.kind === 'vendor_check') {
        let status = '';
        try { status = String((JSON.parse(t.findingJson || '{}') as { status?: string }).status ?? ''); } catch { status = ''; }
        if (t.source === 'live') vc.live++;
        else if (status === 'hand_shaped') vc.handShaped++;
        else if (t.source === 'replayed') vc.replayed++;
        else vc.none++;
      }
    }
    return { live, replayed, none, vc };
  }, [tasks]);
  const feed = useMemo(() => {
    const copy = [...events];
    copy.sort((a, b) => (a.id === b.id ? 0 : a.id > b.id ? -1 : 1));
    return copy.slice(0, FEED_LIMIT);
  }, [events]);
  const keys = useMemo(() => feed.map(e => String(e.id)), [feed]);
  const flashing = useFlash(keys);

  const dt = today === undefined ? 'day_total' : `day_total day ${today}`;

  return (
    <Panel
      title="Ledger of trust"
      aside={
        <span>
          <Src id={`audit_event, newest ${FEED_LIMIT} of ${events.length}`}>{Math.min(events.length, FEED_LIMIT)}</Src> of{' '}
          <Src id="count of audit_event rows in the subscription">{events.length}</Src> events
        </span>
      }
      bodyClassName="flex min-h-0 flex-col"
    >
      <div className="border-b border-edge px-3 py-2">
        <p className="text-[11.5px] leading-snug text-muted">Checks the kernel re-performed. Plain code, run again at every gate. None of this is a model's opinion.</p>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 2xl:grid-cols-6">
          <Counter
            label="auto-paid today"
            value={total ? String(total.autoPaidCount) : '0'}
            src={`${dt}.auto_paid_count`}
            tone="release"
            sub={<Src id="count of payment rows with released_role kernel or rule">{paid.autoCount}</Src>}
            subLabel="all days"
          />
          <Counter
            label="auto-paid dollars today"
            value={dollars(total?.autoPaidCents ?? 0n, true)}
            src={`${dt}.auto_paid_cents`}
            tone="release"
            sub={<Src id="sum of payment.cents with released_role kernel or rule">{dollars(paid.autoCents, true)}</Src>}
            subLabel="all days"
          />
          <Counter
            label="released by controller"
            value={String(paid.ctrlCount)}
            src="count of payment rows with released_role controller, all days"
            tone="release"
            sub={<Src id="sum of payment.cents with released_role controller, all days">{dollars(paid.ctrlCents, true)}</Src>}
            subLabel="all days"
          />
          <Counter label="holds today" value={total ? String(total.holdCount) : '0'} src={`${dt}.hold_count`} tone="hold" />
          <Counter label="auto-rejected duplicates" value={total ? String(total.rejectedCount) : '0'} src={`${dt}.rejected_count`} tone="refused" />
          <Counter label="questions asked" value={String(questions)} src={`hold rows with day ${today ?? '?'} and a question`} tone="hold" />
        </div>
        {total ? (
          <div className="mt-1 text-[10.5px] text-faint">
            <Src id={`${dt}.txn_count`}>{total.txnCount}</Src> transactions matched today
          </div>
        ) : (
          <div className="mt-1 text-[10.5px] text-faint">No day_total row for day {today ?? '?'} yet.</div>
        )}
        <div className="mt-1 text-[10.5px] text-faint">
          Investigations: <Src id="agent_task.source = live" className="text-release">{provenance.live}</Src> live,{' '}
          <Src id="agent_task.source = replayed" className="text-candidate">{provenance.replayed}</Src> replayed,{' '}
          <Src id="agent_task.source = none" className={provenance.none > 0 ? 'text-refused' : 'text-muted'}>
            {provenance.none}
          </Src>{' '}
          scripted stand-in. Vendor checks:{' '}
          <Src id="agent_task (vendor_check).source = live" className="text-release">{provenance.vc.live}</Src> live,{' '}
          <Src id="agent_task (vendor_check).source = replayed, finding.status = replayed" className="text-candidate">{provenance.vc.replayed}</Src> recorded replay,{' '}
          <Src id="agent_task (vendor_check).finding.status = hand_shaped" className={provenance.vc.handShaped > 0 ? 'text-hold' : 'text-muted'}>{provenance.vc.handShaped}</Src> hand-shaped fixture,{' '}
          <Src id="agent_task (vendor_check).source = none" className={provenance.vc.none > 0 ? 'text-refused' : 'text-muted'}>{provenance.vc.none}</Src> stand-in
        </div>
      </div>
      <div className="scroll min-h-0 flex-1 overflow-y-auto">
        {!ready && events.length === 0 ? (
          <Empty>Subscribing to audit_event.</Empty>
        ) : feed.length === 0 ? (
          <Empty>No audit events yet.</Empty>
        ) : (
          <table className="w-full border-collapse text-[11.5px]">
            <thead className="sticky top-0 z-10 bg-panel-2 text-left text-[10.5px] uppercase tracking-wider text-faint">
              <tr>
                <th className="px-3 py-1 font-medium">time</th>
                <th className="px-2 py-1 font-medium">day</th>
                <th className="px-2 py-1 font-medium">actor</th>
                <th className="px-2 py-1 font-medium">action</th>
                <th className="px-2 py-1 font-medium">ref</th>
                <th className="px-2 py-1 pr-3 font-medium">detail</th>
              </tr>
            </thead>
            <tbody>
              {feed.map(e => {
                const refused = e.action === 'refused';
                const id = `audit_event ${e.id}`;
                return (
                  <tr
                    key={String(e.id)}
                    className={`border-b border-edge/50 align-top ${flashing.has(String(e.id)) ? 'flash' : ''} ${
                      refused ? 'bg-refused-dim/60 shadow-[inset_2px_0_0_var(--refused)]' : ''
                    }`}
                  >
                    <td className="num whitespace-nowrap px-3 py-1 text-muted">
                      <Src id={`${id}.at`}>{clockTime(e.at)}</Src>
                    </td>
                    <td className="num px-2 py-1 text-muted">
                      <Src id={`${id}.day`}>{e.day}</Src>
                    </td>
                    <td className="px-2 py-1">
                      <Pill tone={roleTone(e.actorRole)} title={`${id}.actor ${e.actor.toHexString().slice(0, 12)}`}>
                        {e.actorRole || 'anon'}
                      </Pill>
                    </td>
                    <td className={`num whitespace-nowrap px-2 py-1 ${refused ? 'font-semibold text-refused' : actionColor(e.action)}`} title={`${id}.action`}>
                      {e.action}
                    </td>
                    <td className="num px-2 py-1 text-text" title={`${id}.ref`}>
                      {e.ref}
                    </td>
                    <td className="max-w-[28rem] truncate px-2 py-1 pr-3 text-muted" title={`${id}.detail: ${e.detail}`}>
                      {e.action === 'settle' ? settleLabel(e.detail) : e.detail}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </Panel>
  );
}

// record_settlement writes "bank id <id>". An offline-<txnRef> id means no bank was called, and the feed says so
// rather than letting a stand-in read as a bank id.
function settleLabel(detail: string): string {
  const m = /^bank id (offline-\S+)$/.exec(detail);
  return m ? `paid, settlement: offline (${m[1]})` : `paid, ${detail}`;
}

function actionColor(action: string): string {
  switch (action) {
    case 'auto_pay':
    case 'approve_payment':
    case 'approve_rule':
    case 'cleared_by_rule':
    case 'settle':
      return 'text-release';
    case 'hold':
    case 'hold_recoded':
    case 'answer_question':
      return 'text-hold';
    case 'auto_reject':
    case 'reject_payment':
    case 'reject_rule':
      return 'text-refused';
    default:
      return 'text-text';
  }
}

function Counter({
  label,
  value,
  src,
  tone,
  sub,
  subLabel,
}: {
  label: string;
  value: string;
  src: string;
  tone: 'release' | 'hold' | 'refused';
  sub?: React.ReactNode;
  subLabel?: string;
}) {
  const color = tone === 'release' ? 'text-release' : tone === 'hold' ? 'text-hold' : 'text-refused';
  return (
    <div className="rounded-sm border border-edge bg-panel-2 px-2.5 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-faint">{label}</div>
      <div className={`num text-[18px] font-semibold leading-tight ${color}`}>
        <Src id={src}>{value}</Src>
      </div>
      {sub !== undefined ? (
        <div className="mt-0.5 text-[10.5px] text-faint">
          {subLabel ? `${subLabel} ` : ''}
          <span className="text-muted">{sub}</span>
        </div>
      ) : null}
    </div>
  );
}
