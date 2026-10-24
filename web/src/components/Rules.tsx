import { useMemo } from 'react';
import type { Rule } from '../../../module_bindings/types';
import { Panel, Pill, Src, Empty, statusTone } from './ui';
import { parseJson, type Backtest, type RuleScope } from '../lib/types';
import { codeLabel } from '../lib/format';
import { useFlash } from '../lib/useFlash';

function scopeText(scope: RuleScope): string {
  const parts: string[] = [];
  if (scope.driverId !== undefined) parts.push(`driver ${scope.driverId}`);
  if (scope.truckIds?.length) parts.push(`truck${scope.truckIds.length > 1 ? 's' : ''} ${scope.truckIds.join(', ')}`);
  if (scope.cardId) parts.push(`card ${scope.cardId}`);
  if (scope.vendorId !== undefined) parts.push(`vendor ${scope.vendorId}`);
  for (const k of Object.keys(scope)) {
    if (!['driverId', 'truckIds', 'cardId', 'vendorId'].includes(k)) parts.push(`${k} ${JSON.stringify(scope[k])}`);
  }
  return parts.length ? parts.join(', ') : 'unscoped';
}

const CONSUMED_PREFIX = 'one_time rule consumed by';

const ORDER: Record<string, number> = { candidate: 0, approved: 1, expired: 2, rejected: 3 };

export function Rules({ rules, ready, today }: { rules: readonly Rule[]; ready: boolean; today: number | undefined }) {
  const sorted = useMemo(() => {
    const copy = [...rules];
    copy.sort((a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9) || Number(b.id - a.id));
    return copy;
  }, [rules]);
  const keys = useMemo(() => rules.map(r => String(r.id)), [rules]);
  const flashing = useFlash(keys);
  const candidates = rules.filter(r => r.status === 'candidate').length;

  return (
    <Panel
      title="Rules"
      aside={
        <>
          <span>
            <Src id="count of rule rows">{rules.length}</Src> total
          </span>
          {candidates > 0 ? (
            <Pill tone="candidate" dot title="rule rows with status = candidate">
              {candidates} waiting for the controller
            </Pill>
          ) : null}
        </>
      }
      bodyClassName="scroll overflow-y-auto"
    >
      {!ready && rules.length === 0 ? (
        <Empty>Subscribing to rule.</Empty>
      ) : sorted.length === 0 ? (
        <Empty>No rules yet. A rule appears after the controller answers a question and the agent drafts one from it.</Empty>
      ) : (
        <ul>
          {sorted.map(r => (
            <RuleRow key={String(r.id)} r={r} flash={flashing.has(String(r.id))} today={today} />
          ))}
        </ul>
      )}
    </Panel>
  );
}

function RuleRow({ r, flash, today }: { r: Rule; flash: boolean; today: number | undefined }) {
  const scope = parseJson<RuleScope>(r.scopeJson, {});
  const bt = parseJson<Backtest>(r.backtestJson, {});
  const candidate = r.status === 'candidate';
  const inWindow = today !== undefined && today >= r.validFromDay && today <= r.validToDay;
  const id = `rule ${r.id}`;
  const consumedBy = r.status === 'expired' && r.reason.startsWith(CONSUMED_PREFIX) ? r.reason.slice(CONSUMED_PREFIX.length).trim() : undefined;
  return (
    <li className={`border-b border-edge/60 px-3 py-2 ${flash ? 'flash' : ''} ${candidate ? 'bg-candidate-dim/40 shadow-[inset_2px_0_0_var(--candidate)]' : ''}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Src id={id} className="text-[12px] text-muted">
          #{String(r.id)}
        </Src>
        <span className="text-[12.5px] font-medium text-text" title={`${id}.condition`}>
          {codeLabel(r.condition)}
        </span>
        <span className="text-[11px] text-faint">on</span>
        <span className="num text-[12px] text-text" title={`${id}.scope_json`}>
          {scopeText(scope)}
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          <Pill tone="neutral" title={`${id}.uses`}>
            {r.uses.replace(/_/g, ' ')}
          </Pill>
          {consumedBy !== undefined ? (
            <Pill tone="neutral" title={`one-time rule, consumed by ${consumedBy}`}>
              used
            </Pill>
          ) : (
            <Pill tone={statusTone(r.status)} title={`${id}.status`}>
              {candidate ? 'candidate, waiting for the controller' : r.status}
            </Pill>
          )}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-muted">
        <span>
          days <Src id={`${id}.valid_from_day`}>{r.validFromDay}</Src> to <Src id={`${id}.valid_to_day`}>{r.validToDay}</Src>
          {r.status === 'approved' ? <span className={`ml-1 ${inWindow ? 'text-release' : 'text-faint'}`}>{inWindow ? 'in force' : 'outside window'}</span> : null}
        </span>
        <span>
          from <Src id={`${id}.source_txn_ref, hold ${r.sourceTxnRef}`}>{r.sourceTxnRef}</Src>
        </span>
        {r.action ? <span title={`${id}.action`}>action {r.action}</span> : null}
      </div>
      <div className="mt-1 text-[12px] text-text" title={`${id}.backtest_json`}>
        Would have cleared <Src id={`${id}.backtest_json.wouldClear`}>{bt.wouldClear ?? 0}</Src> past rows;{' '}
        <Src id={`${id}.backtest_json.confirmedExceptionsCovered`}>{bt.confirmedExceptionsCovered ?? 0}</Src> were confirmed exceptions
        {bt.window ? (
          <span className="ml-1 text-[11px] text-faint">
            (window day {bt.window.fromDay} to {bt.window.toDay})
          </span>
        ) : null}
      </div>
      {r.reason ? (
        <div className="mt-0.5 text-[11px] leading-snug text-muted" title={`${id}.reason`}>
          {r.reason}
        </div>
      ) : null}
    </li>
  );
}
