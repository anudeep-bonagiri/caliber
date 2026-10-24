import { useMemo, useState } from 'react';
import type { Hold } from '../../../module_bindings/types';
import { Panel, Pill, Src, Empty, statusTone } from './ui';
import { dollars, identityHex, codeLabel, plural } from '../lib/format';
import { RESOLVED_HOLD_STATUSES } from '../lib/types';
import { useFlash } from '../lib/useFlash';

export function requesterRole(h: Hold, moduleIdentity: string | undefined): 'kernel' | 'agent' {
  if (moduleIdentity && identityHex(h.requestedBy) === moduleIdentity) return 'kernel';
  return h.reason.startsWith('kernel') ? 'kernel' : 'agent';
}

type Group = { code: string; holds: Hold[]; cents: bigint };

function groupByCode(holds: Hold[]): Group[] {
  const m = new Map<string, Group>();
  for (const h of holds) {
    let g = m.get(h.code);
    if (!g) {
      g = { code: h.code, holds: [], cents: 0n };
      m.set(h.code, g);
    }
    g.holds.push(h);
    g.cents += h.cents;
  }
  const groups = Array.from(m.values());
  for (const g of groups) g.holds.sort((a, b) => b.day - a.day || (a.txnRef < b.txnRef ? 1 : -1));
  groups.sort((a, b) => b.holds.length - a.holds.length || (a.code < b.code ? -1 : 1));
  return groups;
}

export function Queue({
  holds,
  ready,
  codeFilter,
  selected,
  onSelect,
  moduleIdentity,
}: {
  holds: readonly Hold[];
  ready: boolean;
  codeFilter: string;
  selected: string | null;
  onSelect: (txnRef: string) => void;
  moduleIdentity: string | undefined;
}) {
  const [showResolved, setShowResolved] = useState(false);

  const { active, resolved } = useMemo(() => {
    const active: Hold[] = [];
    const resolved: Hold[] = [];
    for (const h of holds) {
      if (codeFilter && h.code !== codeFilter) continue;
      (RESOLVED_HOLD_STATUSES.has(h.status) ? resolved : active).push(h);
    }
    resolved.sort((a, b) => Number(b.updatedAt.microsSinceUnixEpoch - a.updatedAt.microsSinceUnixEpoch));
    return { active, resolved };
  }, [holds, codeFilter]);

  const groups = useMemo(() => groupByCode(active), [active]);
  const keys = useMemo(() => holds.map(h => h.txnRef), [holds]);
  const flashing = useFlash(keys);

  const activeCents = active.reduce((s, h) => s + h.cents, 0n);

  return (
    <Panel
      title="Queue"
      aside={
        <>
          <span>
            <Src id={`hold rows, status not in released/rejected/cleared_by_rule${codeFilter ? `, code ${codeFilter}` : ''}`}>{active.length}</Src> open
          </span>
          <span className="text-hold">
            <Src id="sum of hold.cents over open holds">{dollars(activeCents, true)}</Src>
          </span>
        </>
      }
      bodyClassName="scroll overflow-y-auto"
    >
      {!ready && holds.length === 0 ? (
        <Empty>Subscribing to hold.</Empty>
      ) : active.length === 0 ? (
        <Empty grow={resolved.length === 0}>{codeFilter ? `No open holds with code ${codeFilter}.` : 'No open holds. The kernel pays matched rows without asking.'}</Empty>
      ) : (
        groups.map(g => (
          <div key={g.code}>
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-edge bg-panel-2 px-3 py-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-text">{codeLabel(g.code)}</span>
              <span className="text-[11px] text-muted">
                <Src id={`count of hold where code = ${g.code}`}>{plural(g.holds.length, 'hold')}</Src>
                <span className="mx-1.5 text-faint">|</span>
                <Src id={`sum of hold.cents where code = ${g.code}`} className="text-hold">
                  {dollars(g.cents, true)}
                </Src>
              </span>
            </div>
            <ul>
              {g.holds.map(h => (
                <HoldRow
                  key={h.txnRef}
                  h={h}
                  selected={selected === h.txnRef}
                  flash={flashing.has(h.txnRef)}
                  role={requesterRole(h, moduleIdentity)}
                  onSelect={onSelect}
                />
              ))}
            </ul>
          </div>
        ))
      )}
      {resolved.length > 0 ? (
        <div className="border-t border-edge">
          <button
            type="button"
            onClick={() => setShowResolved(v => !v)}
            className="flex w-full items-center justify-between px-3 py-1.5 text-left text-[11px] text-muted hover:text-text"
          >
            <span>
              <span className="mr-1.5 inline-block w-3 text-faint">{showResolved ? '▾' : '▸'}</span>
              resolved <Src id="hold rows with status released, rejected or cleared_by_rule">{resolved.length}</Src>
            </span>
            <span className="text-faint">released, rejected, cleared by rule</span>
          </button>
          {showResolved ? (
            <ul className="opacity-80">
              {resolved.slice(0, 200).map(h => (
                <HoldRow
                  key={h.txnRef}
                  h={h}
                  selected={selected === h.txnRef}
                  flash={flashing.has(h.txnRef)}
                  role={requesterRole(h, moduleIdentity)}
                  onSelect={onSelect}
                />
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </Panel>
  );
}

function HoldRow({
  h,
  selected,
  flash,
  role,
  onSelect,
}: {
  h: Hold;
  selected: boolean;
  flash: boolean;
  role: 'kernel' | 'agent';
  onSelect: (txnRef: string) => void;
}) {
  const question = h.question ?? undefined;
  return (
    <li
      className={`cursor-pointer border-b border-edge/60 px-3 py-1.5 transition-colors hover:bg-panel-2 ${flash ? 'flash' : ''} ${
        selected ? 'bg-panel-2 shadow-[inset_2px_0_0_var(--hold)]' : ''
      }`}
      onClick={() => onSelect(h.txnRef)}
      role="button"
      aria-pressed={selected}
    >
      <div className="flex items-center gap-2">
        <Src id={`hold ${h.txnRef}`} className="text-[12.5px] text-text">
          {h.txnRef}
        </Src>
        <Src id={`hold ${h.txnRef} cents`} className="text-[12.5px] text-hold">
          {dollars(h.cents)}
        </Src>
        <span className="text-[11px] text-muted">
          day <Src id={`hold ${h.txnRef} day`}>{h.day}</Src>
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          <Pill tone="neutral" title={`hold ${h.txnRef}.requested_by ${identityHex(h.requestedBy).slice(0, 12)}`}>
            {role}
          </Pill>
          <Pill tone={statusTone(h.status)} title={`hold ${h.txnRef}.status`}>
            {h.status.replace(/_/g, ' ')}
          </Pill>
        </span>
      </div>
      {question && !RESOLVED_HOLD_STATUSES.has(h.status) ? (
        <div className="mt-1 text-[11.5px] leading-snug text-muted" title={`hold ${h.txnRef}.question`}>
          <span className="mr-1 text-hold">?</span>
          {question}
          {h.answer ? <span className="ml-1 text-release">answered</span> : null}
        </div>
      ) : null}
    </li>
  );
}
