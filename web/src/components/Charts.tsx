import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Panel, Empty, Src } from './ui';
import { EXCEPTION_CODES, type Facts, type FactsByCode, type FactsByDay } from '../lib/types';
import { codeLabel } from '../lib/format';

// Fixed hue per code, assigned in declaration order and never cycled.
// Steps come from the dark column of the dataviz reference palette and were
// validated against this page's panel surface (#10161d).
const CODE_COLORS: Record<string, string> = {
  location_mismatch: '#3987e5',
  capacity_exceeded: '#d95926',
  rate_variance: '#199e70',
  duplicate_toll: '#c98500',
  duplicate_invoice: '#d55181',
  vendor_bank_change: '#008300',
  short_received: '#9085e9',
  limit: '#e66767',
};
const PRECISION = '#3987e5';
const RECALL = '#199e70';
const SINGLE = '#f0a63a';

type LoadState = { kind: 'loading' } | { kind: 'missing' } | { kind: 'error'; message: string } | { kind: 'ready'; facts: Facts };

export function useFacts(): LoadState {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/FACTS.json', { cache: 'no-store' });
        if (!res.ok) {
          if (!cancelled) setState({ kind: 'missing' });
          return;
        }
        const ct = res.headers.get('content-type') ?? '';
        const text = await res.text();
        if (ct.includes('text/html') || text.trimStart().startsWith('<')) {
          if (!cancelled) setState({ kind: 'missing' });
          return;
        }
        const facts = JSON.parse(text) as Facts;
        if (!cancelled) setState({ kind: 'ready', facts });
      } catch (e) {
        if (!cancelled) setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}

const tooltipStyle = {
  contentStyle: { background: '#141c25', border: '1px solid #2a3747', borderRadius: 4, fontSize: 11.5, color: '#dbe5ee', padding: '6px 8px' },
  labelStyle: { color: '#8d9eae', marginBottom: 2 },
  itemStyle: { padding: 0, color: '#dbe5ee' },
  cursor: { fill: 'rgba(255,255,255,0.04)' },
};

export function Charts() {
  const state = useFacts();
  const label = 'from docs/FACTS.json, written by scripts/facts.py';

  const byDay = useMemo<FactsByDay[]>(() => (state.kind === 'ready' ? [...(state.facts.byDay ?? [])].sort((a, b) => a.day - b.day) : []), [state]);
  const byCode = useMemo<FactsByCode[]>(() => (state.kind === 'ready' ? state.facts.byCode ?? [] : []), [state]);

  // Stack by code only when the file carries per-day per-code counts.
  const stackedCodes = useMemo(() => {
    const set = new Set<string>();
    for (const d of byDay) for (const k of Object.keys(d.byCode ?? {})) set.add(k);
    const ordered = [...EXCEPTION_CODES.filter(c => set.has(c)), ...Array.from(set).filter(c => !(EXCEPTION_CODES as readonly string[]).includes(c)).sort()];
    return ordered;
  }, [byDay]);
  const dayRows = useMemo(() => byDay.map(d => ({ day: d.day, date: d.date, exceptions: d.exceptions, autoPaid: d.autoPaid, ...(d.byCode ?? {}) })), [byDay]);
  const codeRows = useMemo(() => byCode.map(c => ({ ...c, name: codeLabel(c.code) })), [byCode]);

  const asOf = state.kind === 'ready' ? state.facts.asOf : undefined;
  const aside = (
    <span className="text-faint" title={label}>
      {label}
      {asOf ? <span className="ml-2 num">as of {asOf}</span> : null}
    </span>
  );

  const body =
    state.kind === 'loading' ? (
      <Empty>Loading /FACTS.json.</Empty>
    ) : state.kind === 'missing' ? (
      <Empty>
        docs/FACTS.json is not served at /FACTS.json. Run scripts/facts.py and copy the file into web/public/ to see exceptions by code and precision and recall.
      </Empty>
    ) : state.kind === 'error' ? (
      <Empty>Could not read /FACTS.json: {state.message}</Empty>
    ) : (
      <div className="grid h-full grid-cols-1 gap-3 px-3 py-2 lg:grid-cols-2">
        <figure className="flex min-h-[200px] flex-col">
          <figcaption className="mb-1 text-[11px] text-muted">
            Exceptions per business day{stackedCodes.length ? ', stacked by code' : ''}{' '}
            <span className="text-faint">(FACTS.byDay, {byDay.length} days)</span>
          </figcaption>
          <div className="min-h-0 flex-1">
            {dayRows.length === 0 ? (
              <Empty>byDay is empty.</Empty>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dayRows} margin={{ top: 4, right: 4, left: -18, bottom: 0 }} barCategoryGap={2}>
                  <CartesianGrid vertical={false} stroke="#1f2a36" />
                  <XAxis dataKey="day" tick={{ fill: '#8d9eae', fontSize: 10 }} tickLine={false} axisLine={{ stroke: '#2a3747' }} interval="preserveStartEnd" minTickGap={18} />
                  <YAxis allowDecimals={false} tick={{ fill: '#8d9eae', fontSize: 10 }} tickLine={false} axisLine={false} width={40} />
                  <Tooltip
                    {...tooltipStyle}
                    labelFormatter={(d: unknown, payload) => {
                      const row = payload?.[0]?.payload as { date?: string; autoPaid?: number } | undefined;
                      return `day ${String(d)}${row?.date ? `, ${row.date}` : ''}${row?.autoPaid !== undefined ? `, auto-paid ${row.autoPaid}` : ''}`;
                    }}
                  />
                  {stackedCodes.length ? (
                    <>
                      <Legend wrapperStyle={{ fontSize: 10.5, color: '#8d9eae' }} iconType="square" iconSize={8} />
                      {stackedCodes.map((c, i) => (
                        <Bar
                          key={c}
                          dataKey={c}
                          name={codeLabel(c)}
                          stackId="x"
                          fill={CODE_COLORS[c] ?? '#8d9eae'}
                          stroke="#10161d"
                          strokeWidth={1}
                          radius={i === stackedCodes.length - 1 ? [3, 3, 0, 0] : 0}
                          isAnimationActive={false}
                        />
                      ))}
                    </>
                  ) : (
                    <Bar dataKey="exceptions" name="exceptions" fill={SINGLE} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                  )}
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </figure>
        <figure className="flex min-h-[200px] flex-col">
          <figcaption className="mb-1 text-[11px] text-muted">
            Precision and recall by code <span className="text-faint">(FACTS.byCode, against seed/fixtures/answer_key.json)</span>
          </figcaption>
          <div className="min-h-0 flex-1">
            {codeRows.length === 0 ? (
              <Empty>byCode is empty.</Empty>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={codeRows} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 0 }} barCategoryGap={6} barGap={2}>
                  <CartesianGrid horizontal={false} stroke="#1f2a36" />
                  <XAxis type="number" domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]} tick={{ fill: '#8d9eae', fontSize: 10 }} tickLine={false} axisLine={{ stroke: '#2a3747' }} tickFormatter={(v: number) => `${Math.round(v * 100)}%`} />
                  <YAxis type="category" dataKey="name" width={118} interval={0} tick={{ fill: '#dbe5ee', fontSize: 10.5 }} tickLine={false} axisLine={false} />
                  <Tooltip
                    {...tooltipStyle}
                    formatter={(v: unknown, name: unknown) => [`${Math.round(Number(v) * 100)}%`, String(name)]}
                    labelFormatter={(l: unknown, payload) => {
                      const row = payload?.[0]?.payload as FactsByCode | undefined;
                      return row ? `${String(l)}: planted ${row.planted}, raised ${row.raised}, true positives ${row.truePositives}` : String(l);
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 10.5, color: '#8d9eae' }} iconType="square" iconSize={8} />
                  <Bar dataKey="precision" name="precision" fill={PRECISION} barSize={7} radius={[0, 3, 3, 0]} isAnimationActive={false} />
                  <Bar dataKey="recall" name="recall" fill={RECALL} barSize={7} radius={[0, 3, 3, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          {codeRows.length ? (
            <details className="mt-1">
              <summary className="text-[10.5px] text-faint hover:text-muted">table view</summary>
              <table className="mt-1 w-full text-[11px]">
                <thead className="text-left text-[10px] uppercase tracking-wider text-faint">
                  <tr>
                    <th className="py-0.5 font-medium">code</th>
                    <th className="py-0.5 font-medium">planted</th>
                    <th className="py-0.5 font-medium">raised</th>
                    <th className="py-0.5 font-medium">true pos.</th>
                    <th className="py-0.5 font-medium">precision</th>
                    <th className="py-0.5 font-medium">recall</th>
                  </tr>
                </thead>
                <tbody className="num text-muted">
                  {codeRows.map(r => (
                    <tr key={r.code} className="border-t border-edge/50">
                      <td className="py-0.5 text-text">{r.code}</td>
                      <td><Src id={`FACTS.byCode[${r.code}].planted`}>{r.planted}</Src></td>
                      <td><Src id={`FACTS.byCode[${r.code}].raised`}>{r.raised}</Src></td>
                      <td><Src id={`FACTS.byCode[${r.code}].truePositives`}>{r.truePositives}</Src></td>
                      <td><Src id={`FACTS.byCode[${r.code}].precision`}>{Math.round(r.precision * 100)}%</Src></td>
                      <td><Src id={`FACTS.byCode[${r.code}].recall`}>{Math.round(r.recall * 100)}%</Src></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          ) : null}
        </figure>
      </div>
    );

  return (
    <Panel title="Planted vs raised" aside={aside} bodyClassName="min-h-[240px]">
      {body}
    </Panel>
  );
}
