import { useMemo, useState, type ReactNode } from 'react';
import type { AgentTask, AuditEvent, Hold, IngestLog, MatchResult, Payment, Rule } from '../../../module_bindings/types';
import { CARRIER_NAME, CONTROLLER_AGENT_URL } from './carrier';
import { CopyCommand } from './CopyCommand';
import { MiniMap, hasMapPoints } from './MiniMap';
import {
  CAUGHT_DEFINITION,
  activitySentence,
  dayDate,
  evidenceOf,
  findingOf,
  holdSentence,
  isReplay,
  latestTask,
  learnedFrom,
  lookupsFrom,
  money,
  namesFrom,
  plural,
  receiptOf,
  tilesFrom,
  type LearnedItem,
} from './model';

export type LedgerRows = {
  today: number | undefined;
  date: string | undefined;
  holds: readonly Hold[];
  tasks: readonly AgentTask[];
  rules: readonly Rule[];
  events: readonly AuditEvent[];
  matches: readonly MatchResult[];
  payments: readonly Payment[];
  ingests: readonly IngestLog[];
};

// Dollar amounts are the only text set in the mono face, with tabular figures.
const AMOUNT = /(\$[\d,]+\.\d{2})/g;
export function Prose({ text }: { text: string }) {
  const parts = text.split(AMOUNT);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <span key={i} className="cv-money">
            {p}
          </span>
        ) : (
          p
        ),
      )}
    </>
  );
}

export function greeting(now: Date): string {
  return now.getHours() < 12 ? 'Good morning' : 'Good afternoon';
}

export function Header({ now, date, connected }: { now: Date; date: string | undefined; connected: boolean | undefined }) {
  return (
    <header className="cv-header">
      <div className="cv-brandrow">
        <span className="cv-brand">Caliber</span>
        <span className="cv-carrier">
          {CARRIER_NAME}
          <span className="cv-chip" title="The carrier, its trucks, drivers, vendors and charges are generated for this demo. Nothing here is a real company.">
            Simulated carrier
          </span>
        </span>
      </div>
      <h1 className="cv-greeting">{greeting(now)}.</h1>
      <p className="cv-sub">
        {date ? <>Here is where {CARRIER_NAME}'s bills stand on {longDate(date)}.</> : <>Here is where {CARRIER_NAME}'s bills stand.</>}
        {connected === false ? <span className="cv-conn"> Connecting to the ledger.</span> : null}
      </p>
    </header>
  );
}

const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function longDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return `${DOW[d.getUTCDay()]}, ${MONTH[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export function Footer() {
  return <footer className="cv-footer">This screen can't pay anything. Approvals happen from your phone.</footer>;
}

function Tile({ label, value, sub, brass, title }: { label: string; value: string; sub: ReactNode; brass?: boolean; title?: string }) {
  return (
    <div className={`cv-tile ${brass ? 'cv-tile-brass' : ''}`} title={title}>
      <div className="cv-tile-label">{label}</div>
      <div className="cv-tile-value cv-money">{value}</div>
      <div className="cv-tile-sub">{sub}</div>
    </div>
  );
}

export function TodayScreen({ rows }: { rows: LedgerRows }) {
  const { holds, payments, matches, tasks, today } = rows;
  const tiles = useMemo(() => tilesFrom(holds, payments, matches, today), [holds, payments, matches, today]);
  const names = useMemo(() => namesFrom(matches), [matches]);
  const matchByRef = useMemo(() => new Map(matches.map(m => [m.txnRef, m])), [matches]);
  const waiting = useMemo(
    () => holds.filter(h => h.status === 'awaiting_controller').sort((a, b) => b.day - a.day || Number(b.updatedAt.microsSinceUnixEpoch - a.updatedAt.microsSinceUnixEpoch)),
    [holds],
  );
  const needs = tiles.needs;
  const oldest = needs.oldestDays === null ? 'Nothing waiting' : needs.oldestDays === 0 ? 'Oldest is from today' : `Oldest waiting ${plural(needs.oldestDays, 'business day')}`;
  return (
    <section className="cv-today" aria-labelledby="cv-today-h">
      <h2 id="cv-today-h" className="cv-h2">Today</h2>
      <div className="cv-tiles">
        <Tile
          label="Needs you"
          value={money(needs.cents)}
          brass={needs.count > 0}
          sub={
            <>
              {needs.count === 0 ? 'No questions for you' : `${plural(needs.count, 'charge')} waiting`}
              {needs.count > 0 ? <span className="cv-tile-sub2">{oldest}</span> : null}
            </>
          }
        />
        <Tile label="Paid for you today" value={money(tiles.paidToday.cents)} sub={`${plural(tiles.paidToday.count, 'charge')} paid automatically`} />
        <Tile
          label="Caught this quarter"
          value={money(tiles.caught.cents)}
          title={CAUGHT_DEFINITION}
          sub={`${plural(tiles.caught.holds, 'charge')} stopped, ${plural(tiles.caught.duplicates, 'duplicate toll')} turned down`}
        />
      </div>
      {waiting.length === 0 ? (
        <p className="cv-quiet">Nothing needs you right now. Caliber pays what matches and will ask you here when something doesn't.</p>
      ) : (
        <ul className="cv-cards">
          {waiting.map(h => (
            <HoldCard key={h.txnRef} hold={h} match={matchByRef.get(h.txnRef)} task={latestTask(tasks, h.txnRef)} names={names} />
          ))}
        </ul>
      )}
    </section>
  );
}

function HoldCard({ hold, match, task, names }: { hold: Hold; match: MatchResult | undefined; task: AgentTask | undefined; names: ReturnType<typeof namesFrom> }) {
  const ev = evidenceOf(match);
  const finding = findingOf(task);
  const receipt = receiptOf(finding);
  const replay = isReplay(task, finding);
  const showMap = hasMapPoints(ev);
  return (
    <li className="cv-card" data-txn={hold.txnRef}>
      <div className="cv-card-top">
        <span className="cv-card-ref">
          Charge {hold.txnRef}, {dayDate(hold.day)}
        </span>
        <span className="cv-card-amt cv-money">{money(hold.cents)}</span>
      </div>
      <p className="cv-sentence">
        <Prose text={holdSentence(hold, ev, names)} />
      </p>
      {hold.question ? (
        <div className="cv-ask">
          <div className="cv-ask-label">Caliber asks</div>
          <p className="cv-question">{hold.question}</p>
        </div>
      ) : null}
      {showMap || receipt ? (
        <div className="cv-evidence">
          {showMap ? <MiniMap ev={ev} /> : null}
          {receipt ? (
            <figure className="cv-receipt" aria-label="Receipt">
              <figcaption className="cv-receipt-cap">Receipt</figcaption>
              <pre>{receipt.quote}</pre>
            </figure>
          ) : null}
        </div>
      ) : null}
      {replay ? <p className="cv-replay">replay of a recorded investigation</p> : null}
      <div className="cv-actions">
        <a className="cv-answer" href={CONTROLLER_AGENT_URL} target="_blank" rel="noreferrer">
          Answer in ASI:One
        </a>
        <CopyCommand command={`answer ${hold.txnRef} `} label="Copy command" />
      </div>
    </li>
  );
}

export function LearnedScreen({ rows }: { rows: LedgerRows }) {
  const { rules, holds, events, matches } = rows;
  const names = useMemo(() => namesFrom(matches), [matches]);
  const items = useMemo(() => learnedFrom(rules, holds, events, names), [rules, holds, events, names]);
  return (
    <section className="cv-learned" aria-labelledby="cv-learned-h">
      <h2 id="cv-learned-h" className="cv-h2">What Caliber has learned</h2>
      {items.length === 0 ? (
        <p className="cv-empty">Nothing yet. When you answer a question, Caliber turns the answer into a rule and shows it here before it ever uses it.</p>
      ) : (
        <ul className="cv-rules">
          {items.map(it => (
            <LearnedRow key={it.kind === 'rule' ? `r${it.rule.id}` : `a${it.hold.txnRef}`} it={it} />
          ))}
        </ul>
      )}
    </section>
  );
}

function LearnedRow({ it }: { it: LearnedItem }) {
  if (it.kind === 'answered') {
    return (
      <li className="cv-rule cv-rule-pending" data-answered={it.hold.txnRef}>
        <p>{it.sentence}</p>
      </li>
    );
  }
  return (
    <li className={`cv-rule ${it.state === 'past' ? 'cv-rule-past' : ''}`} data-rule={String(it.rule.id)}>
      {it.lead ? <p className="cv-rule-lead">{it.lead}</p> : null}
      <p className="cv-rule-text">{it.sentence}</p>
      {it.note && it.state !== 'candidate' ? <p className="cv-rule-note">{it.note}</p> : null}
      {it.backtest ? <p className="cv-rule-note">{it.backtest}</p> : null}
      {it.state === 'candidate' && it.command ? (
        <div className="cv-actions">
          <span className="cv-rule-note">{it.note}</span>
          <a className="cv-answer" href={CONTROLLER_AGENT_URL} target="_blank" rel="noreferrer">
            Open ASI:One
          </a>
          <CopyCommand command={it.command} label="Copy command" />
        </div>
      ) : null}
    </li>
  );
}

const FEED_STEP = 40;

export function ActivityScreen({ rows }: { rows: LedgerRows }) {
  const { events, holds, payments, rules, ingests } = rows;
  const [limit, setLimit] = useState(FEED_STEP);
  const lk = useMemo(() => lookupsFrom(holds, payments, rules, ingests), [holds, payments, rules, ingests]);
  const feed = useMemo(() => [...events].sort((a, b) => (a.id === b.id ? 0 : a.id > b.id ? -1 : 1)), [events]);
  return (
    <section className="cv-activity" aria-labelledby="cv-activity-h">
      <h2 id="cv-activity-h" className="cv-h2">Activity</h2>
      {feed.length === 0 ? (
        <p className="cv-empty">Nothing has happened yet.</p>
      ) : (
        <>
          <ol className="cv-feed">
            {feed.slice(0, limit).map(e => (
              <li key={String(e.id)}>
                <a href={`/console#event-${e.id}`} className="cv-feed-line">
                  <span className="cv-feed-day">{dayDate(e.day)}</span>
                  <span className="cv-feed-text">
                    <Prose text={activitySentence(e, lk)} />
                  </span>
                </a>
              </li>
            ))}
          </ol>
          {feed.length > limit ? (
            <button type="button" className="cv-more" onClick={() => setLimit(n => n + FEED_STEP)}>
              Show earlier activity
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}

export function CustomerPage({ rows, now, connected }: { rows: LedgerRows; now: Date; connected: boolean | undefined }) {
  return (
    <div className="cv">
      <div className="cv-wrap">
        <Header now={now} date={rows.date} connected={connected} />
        <main className="cv-main">
          <TodayScreen rows={rows} />
          <div className="cv-side">
            <LearnedScreen rows={rows} />
            <ActivityScreen rows={rows} />
          </div>
        </main>
        <Footer />
      </div>
    </div>
  );
}
