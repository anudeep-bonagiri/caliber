import { useEffect, useMemo, useState } from 'react';
import type { AgentTask, Hold, MatchResult, Payment } from '../../../module_bindings/types';
import { Panel, Pill, Src, Empty, Kv, JsonBlock, CallbackRequiredPill, statusTone } from './ui';
import { parseJson, parseSteps, type Brief, type BriefEvidence, type Finding, type Step } from '../lib/types';
import { dollars, isoShort, pct, codeLabel, identityHex } from '../lib/format';

export type Badge = { label: string; tone: 'release' | 'candidate' | 'refused'; title: string };

export function badgeFor(task: AgentTask | undefined, finding: Finding | undefined): Badge | undefined {
  if (!task || task.status === 'open' || task.status === 'claimed') return undefined;
  const st = finding?.status;
  if (task.source === 'none' || st === 'timeout' || st === 'no_fixture') {
    return { label: 'scripted stand-in, not a model', tone: 'refused', title: `agent_task ${task.id}.source = ${task.source}, finding.status = ${st ?? 'none'}` };
  }
  if (task.source === 'replayed' || st === 'replayed') {
    return { label: 'replayed', tone: 'candidate', title: `Recorded execution. agent_task ${task.id}.source = ${task.source}` };
  }
  if (task.source === 'live') return { label: 'live', tone: 'release', title: `agent_task ${task.id}.source = live` };
  return undefined;
}

// A worker that is claiming tasks touches agent_task rows; if none changed in
// this window, an open task is not going to be picked up on its own.
const WORKER_IDLE_MS = 60_000;

function latestTaskMillis(tasks: readonly AgentTask[]): number {
  let best = 0n;
  for (const t of tasks) if (t.updatedAt.microsSinceUnixEpoch > best) best = t.updatedAt.microsSinceUnixEpoch;
  return Number(best / 1000n);
}

function pickTask(tasks: readonly AgentTask[], txnRef: string, kind: string): AgentTask | undefined {
  let best: AgentTask | undefined;
  for (const t of tasks) {
    if (t.txnRef !== txnRef || t.kind !== kind) continue;
    if (!best || t.id > best.id) best = t;
  }
  return best;
}

export function Investigation({
  hold,
  tasks,
  matches,
  payment,
  ready,
}: {
  hold: Hold | undefined;
  tasks: readonly AgentTask[];
  matches: readonly MatchResult[];
  payment: Payment | undefined;
  ready: boolean;
}) {
  const task = useMemo(() => (hold ? pickTask(tasks, hold.txnRef, 'investigate') : undefined), [tasks, hold]);
  const draft = useMemo(() => (hold ? pickTask(tasks, hold.txnRef, 'draft_rule') : undefined), [tasks, hold]);
  const match = useMemo(() => (hold ? matches.find(m => m.txnRef === hold.txnRef) : undefined), [matches, hold]);

  const brief = useMemo<Brief>(() => {
    if (task) return parseJson<Brief>(task.briefJson, {});
    if (match) return { evidence: parseJson<BriefEvidence>(match.evidenceJson, {}) };
    return {};
  }, [task, match]);
  const steps = useMemo<Step[]>(() => (task ? parseSteps(task.stepsJson) : []), [task]);
  const finding = useMemo<Finding | undefined>(() => {
    if (!task || !task.findingJson || task.findingJson === '{}') return undefined;
    const f = parseJson<Finding | null>(task.findingJson, null);
    return f && Object.keys(f).length ? f : undefined;
  }, [task]);
  const badge = badgeFor(task, finding);

  // Re-evaluate worker liveness on a timer only while the selected task waits.
  const waiting = task?.status === 'open';
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!waiting) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(t);
  }, [waiting]);
  const lastTaskChange = useMemo(() => latestTaskMillis(tasks), [tasks]);
  const workerIdle = waiting && now - lastTaskChange > WORKER_IDLE_MS;

  const taskId = task ? `agent_task ${task.id}` : '';
  const needsCallback = hold?.code === 'vendor_bank_change';
  const releasedNote = hold && hold.status === 'released' && hold.callbackNote ? hold.callbackNote : undefined;

  return (
    <Panel
      title={hold ? <>Investigation of <span className="num text-text">{hold.txnRef}</span></> : 'Investigation'}
      aside={
        task || needsCallback ? (
          <>
            {needsCallback ? <CallbackRequiredPill /> : null}
            {task && badge ? (
              <Pill tone={badge.tone} title={badge.title}>
                {badge.label}
              </Pill>
            ) : null}
            {task ? (
              <Pill tone={statusTone(task.status)} title={`${taskId}.status`}>
                {task.status === 'claimed' ? <span className="spinner" aria-hidden /> : null}
                {task.status}
              </Pill>
            ) : null}
          </>
        ) : null
      }
      bodyClassName="scroll overflow-y-auto px-3 py-2"
    >
      {!hold ? (
        <Empty>{ready ? 'Select a hold in the queue to see what the investigator did.' : 'Subscribing to agent_task.'}</Empty>
      ) : (
        <div className="flex flex-col gap-3">
          <BriefView hold={hold} brief={brief} task={task} match={match} />

          {payment ? (
            <p className="text-[12px] text-text" title={`payment ${payment.txnRef}`}>
              <span className="text-release">Paid:</span>{' '}
              <Src id={`payment ${payment.txnRef}`} className="text-release">
                {dollars(payment.cents)}
              </Src>{' '}
              on day <Src id={`payment ${payment.txnRef}`}>{payment.day}</Src>, released by{' '}
              <Src id={`payment ${payment.txnRef}`} mono={false}>
                {payment.releasedRole}
              </Src>
            </p>
          ) : null}

          {releasedNote ? (
            <div className="rounded-sm border border-release/40 bg-release-dim px-3 py-1.5">
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-release">Call-back note</div>
              <p className="mt-0.5 text-[12px] text-text">
                <Src id={`hold ${hold.txnRef}.callback_note`} mono={false}>
                  {releasedNote}
                </Src>
              </p>
            </div>
          ) : null}

          <Section label={task ? `steps (${taskId})` : 'steps'}>
            {!task ? (
              <p className="text-[11.5px] text-faint">
                {hold.code === 'limit' || hold.code === 'duplicate_toll'
                  ? 'This code creates no investigation task. The kernel decides it alone.'
                  : 'No agent_task row for this hold yet.'}
              </p>
            ) : steps.length === 0 ? (
              <p className="flex items-center gap-2 text-[11.5px] text-faint">
                {task.status === 'claimed' ? <span className="spinner" aria-hidden /> : null}
                {task.status === 'open'
                  ? workerIdle
                    ? 'Task is open. No worker is claiming tasks right now; holds are still raised by the kernel.'
                    : 'Task is open. Waiting for the worker to claim it.'
                  : task.status === 'claimed'
                    ? `Claimed by ${identityHex(task.claimedBy ?? undefined).slice(0, 8) || 'worker'}. Steps land when the investigation is recorded.`
                    : 'No steps were recorded.'}
              </p>
            ) : (
              <StepList steps={steps} />
            )}
          </Section>

          <Section label="finding">
            {!finding ? (
              <p className="text-[11.5px] text-faint">{task && task.status === 'timeout' ? 'The investigation timed out.' : 'No finding recorded yet.'}</p>
            ) : (
              <FindingView finding={finding} taskId={taskId} />
            )}
          </Section>

          {hold.question || hold.answer ? (
            <Section label="controller exchange">
              {hold.question ? (
                <p className="text-[12px] text-text" title={`hold ${hold.txnRef}.question`}>
                  <span className="mr-1 text-hold">Q</span>
                  {hold.question}
                </p>
              ) : null}
              {hold.answer ? (
                <p className="mt-1 text-[12px] text-text" title={`hold ${hold.txnRef}.answer`}>
                  <span className="mr-1 text-release">A</span>
                  {hold.answer}
                </p>
              ) : null}
              {hold.callbackNote && !releasedNote ? (
                <p className="mt-1 text-[11.5px] text-muted" title={`hold ${hold.txnRef}.callback_note`}>
                  call-back note: {hold.callbackNote}
                </p>
              ) : null}
            </Section>
          ) : null}

          {draft ? (
            <Section label={`rule drafting (agent_task ${draft.id})`}>
              <div className="flex items-center gap-2 text-[11.5px] text-muted">
                <Pill tone={statusTone(draft.status)} title={`agent_task ${draft.id}.status`}>
                  {draft.status === 'claimed' ? <span className="spinner" aria-hidden /> : null}
                  {draft.status}
                </Pill>
                <span>source {draft.source}</span>
              </div>
            </Section>
          ) : null}
        </div>
      )}
    </Panel>
  );
}

function microsToIso(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return String(v);
  const d = new Date(n / 1000);
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString().replace('.000Z', 'Z');
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-faint">{label}</div>
      {children}
    </div>
  );
}

const KNOWN = new Set([
  'txnRef', 'kind', 'code', 'cents', 'day', 'date',
  'truckId', 'driverId', 'driverName', 'plate', 'cardId', 'stationName', 'stationLat', 'stationLon',
  'nearestPing', 'distanceMiles', 'thresholdMiles', 'gallons', 'merchant',
]);

function BriefView({ hold, brief, task, match }: { hold: Hold; brief: Brief; task: AgentTask | undefined; match: MatchResult | undefined }) {
  const ev = brief.evidence ?? {};
  const src = task ? `agent_task ${task.id}.brief_json` : match ? `match_result ${match.txnRef}.evidence_json` : `hold ${hold.txnRef}`;
  const extra = Object.entries(ev).filter(([k, v]) => !KNOWN.has(k) && v !== null && typeof v !== 'object');
  const over = ev.distanceMiles !== undefined && ev.thresholdMiles !== undefined ? ev.distanceMiles > ev.thresholdMiles : undefined;
  return (
    <div className="rounded-sm border border-edge bg-panel-2 px-3 py-2">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[12.5px] font-medium text-text">{codeLabel(hold.code)}</span>
        <Src id={`hold ${hold.txnRef}.cents`} className="text-hold">
          {dollars(hold.cents)}
        </Src>
        <span className="text-[11px] text-muted">
          day <Src id={`hold ${hold.txnRef}.day`}>{hold.day}</Src>
          {brief.date ? <span className="ml-1">{brief.date}</span> : null}
        </span>
        <span className="text-[11px] text-muted" title={`hold ${hold.txnRef}.reason`}>
          {hold.reason}
        </span>
      </div>
      <div className="mt-1 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
        <div>
          {ev.truckId !== undefined ? <Kv k="truck" v={<Src id={src}>{ev.truckId}{ev.plate ? ` (${ev.plate})` : ''}</Src>} /> : null}
          {ev.driverId !== undefined || ev.driverName ? (
            <Kv k="driver" v={<Src id={src}>{[ev.driverName, ev.driverId !== undefined ? `#${ev.driverId}` : ''].filter(Boolean).join(' ')}</Src>} />
          ) : null}
          {ev.cardId ? <Kv k="card" v={<Src id={src}>{ev.cardId}</Src>} /> : null}
          {ev.stationName ? <Kv k="station" v={<Src id={src}>{ev.stationName}</Src>} /> : null}
          {ev.merchant ? <Kv k="merchant" v={<Src id={src}>{ev.merchant}</Src>} /> : null}
          {ev.gallons !== undefined ? <Kv k="gallons" v={<Src id={src}>{ev.gallons}</Src>} /> : null}
        </div>
        <div>
          {ev.distanceMiles !== undefined ? (
            <Kv
              k="distance vs threshold"
              v={
                <span className={over ? 'text-hold' : 'text-release'}>
                  <Src id={src}>{ev.distanceMiles.toFixed(1)} mi</Src>
                  <span className="text-faint"> vs </span>
                  <Src id={src}>{ev.thresholdMiles ?? '?'} mi</Src>
                </span>
              }
            />
          ) : null}
          {ev.nearestPing ? (
            <>
              <Kv
                k="nearest ping"
                v={
                  <Src id={src}>
                    {ev.nearestPing.lat?.toFixed(2)}, {ev.nearestPing.lon?.toFixed(2)}
                    {ev.nearestPing.deltaMin !== undefined ? ` (${ev.nearestPing.deltaMin} min)` : ''}
                  </Src>
                }
              />
              {ev.nearestPing.engineOn !== undefined ? <Kv k="engine" v={<Src id={src}>{ev.nearestPing.engineOn ? 'on' : 'off'}</Src>} /> : null}
              {ev.nearestPing.odometer !== undefined ? <Kv k="odometer" v={<Src id={src}>{ev.nearestPing.odometer}</Src>} /> : null}
            </>
          ) : null}
          {ev.stationLat !== undefined ? <Kv k="station at" v={<Src id={src}>{ev.stationLat}, {ev.stationLon}</Src>} /> : null}
          {extra.map(([k, v]) => (
            <Kv key={k} k={k.replace(/([A-Z])/g, ' $1').toLowerCase()} v={<Src id={src}>{k === 'atMicros' ? microsToIso(v) : String(v)}</Src>} />
          ))}
        </div>
      </div>
      {brief.questionHint ? <p className="mt-1.5 text-[11px] text-muted" title={src}>hint: {brief.questionHint}</p> : null}
      {Object.keys(ev).length === 0 && !brief.questionHint ? <p className="mt-1 text-[11px] text-faint">No evidence object in the brief.</p> : null}
      <div className="mt-1.5">
        <JsonBlock label="raw brief" value={task ? task.briefJson : match ? match.evidenceJson : '{}'} />
      </div>
    </div>
  );
}

function StepList({ steps }: { steps: Step[] }) {
  // Pair each tool_result with its tool_call by toolUseId; orphans render on their own.
  const results = new Map<string, Extract<Step, { type: 'tool_result' }>>();
  for (const s of steps) if (s.type === 'tool_result' && s.toolUseId) results.set(s.toolUseId, s);
  const consumed = new Set<string>();
  const items: React.ReactNode[] = [];
  let n = 0;
  for (const s of steps) {
    const key = `${n++}`;
    if (s.type === 'tool_call') {
      const r = s.toolUseId ? results.get(s.toolUseId) : undefined;
      if (r && s.toolUseId) consumed.add(s.toolUseId);
      items.push(
        <li key={key} className="border-l-2 border-edge-2 pl-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10.5px] uppercase tracking-wider text-candidate">tool call</span>
            <span className="num text-[12px] text-text">{s.name ?? 'tool'}</span>
            <span className="num text-[10.5px] text-faint">{isoShort(s.at)}</span>
          </div>
          {s.input !== undefined ? <JsonBlock label="input" value={s.input} /> : null}
          {r ? (
            <div className="mt-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-[10.5px] uppercase tracking-wider ${r.isError ? 'text-refused' : 'text-release'}`}>{r.isError ? 'tool error' : 'tool result'}</span>
                <span className="num text-[10.5px] text-faint">{isoShort(r.at)}</span>
              </div>
              <JsonBlock label="content" value={r.content ?? ''} />
            </div>
          ) : (
            <div className="mt-1 text-[11px] text-faint">no result recorded</div>
          )}
        </li>,
      );
    } else if (s.type === 'tool_result') {
      if (s.toolUseId && consumed.has(s.toolUseId)) continue;
      items.push(
        <li key={key} className="border-l-2 border-edge-2 pl-2.5">
          <span className={`text-[10.5px] uppercase tracking-wider ${s.isError ? 'text-refused' : 'text-release'}`}>tool result</span>{' '}
          <span className="num text-[12px] text-text">{s.toolName ?? ''}</span>
          <JsonBlock label="content" value={s.content ?? ''} />
        </li>,
      );
    } else if (s.type === 'assistant') {
      items.push(
        <li key={key} className="border-l-2 border-edge pl-2.5 text-[12px] leading-snug text-text">
          <span className="mr-1.5 text-[10.5px] uppercase tracking-wider text-muted">assistant</span>
          {s.text}
        </li>,
      );
    } else {
      items.push(
        <li key={key} className="border-l-2 border-edge pl-2.5 text-[11.5px] italic text-muted">
          {s.text}
        </li>,
      );
    }
  }
  return <ol className="flex flex-col gap-2">{items}</ol>;
}

function FindingView({ finding, taskId }: { finding: Finding; taskId: string }) {
  const src = `${taskId}.finding_json`;
  const recTone = finding.recommendation === 'clear' ? 'release' : 'hold';
  return (
    <div className="flex flex-col gap-2">
      {finding.finding ? (
        <p className="text-[13px] leading-snug text-text" title={src}>
          {finding.finding}
        </p>
      ) : null}
      {finding.evidence?.length ? (
        <ul className="flex flex-col gap-1">
          {finding.evidence.map((e, i) => (
            <li key={i} className="rounded-sm border border-edge bg-bg px-2 py-1" title={`${src}.evidence[${i}]`}>
              <div className="font-mono text-[11.5px] text-text">{e.quote}</div>
              <div className="mt-0.5 text-[10.5px] text-muted">
                <span className="text-faint">source</span> {e.source}
                {e.ref ? (
                  <>
                    <span className="mx-1 text-faint">|</span>
                    {e.ref}
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-muted">
        {finding.recommendation ? (
          <span>
            recommends{' '}
            <Pill tone={recTone} title={`${src}.recommendation`}>
              {finding.recommendation.replace(/_/g, ' ')}
            </Pill>
          </span>
        ) : null}
        {finding.confidence !== undefined ? (
          <span>
            confidence <Src id={`${src}.confidence`}>{pct(finding.confidence)}</Src>
          </span>
        ) : null}
        {finding.model ? <span title={`${src}.model`}>model {finding.model}</span> : null}
        {finding.durationMs !== undefined ? (
          <span>
            <Src id={`${src}.durationMs`}>{(finding.durationMs / 1000).toFixed(1)} s</Src>
          </span>
        ) : null}
        {finding.status ? <span title={`${src}.status`}>status {finding.status}</span> : null}
      </div>
      {finding.question_for_controller ? (
        <p className="text-[12px] text-text" title={`${src}.question_for_controller`}>
          <span className="mr-1 text-hold">?</span>
          {finding.question_for_controller}
        </p>
      ) : null}
    </div>
  );
}
