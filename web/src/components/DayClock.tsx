import type { BusinessDay } from '../../../module_bindings/types';
import { Panel, Pill, Src, Empty } from './ui';
import { dayLabel, seconds } from '../lib/format';

export const TOTAL_DAYS = 92;

export function DayClock({ day }: { day: BusinessDay | undefined }) {
  return (
    <Panel
      title="Day clock"
      aside={
        day ? (
          <span className={day.paused ? 'keep-brass' : ''}>
            <Pill
              tone={day.paused ? 'hold' : 'release'}
              dot
              title="No pause button here. The controller pauses or resumes from ASI:One or the terminal (set_clock). This page cannot write to the ledger."
            >
              {day.paused ? 'paused' : 'running'}
            </Pill>
          </span>
        ) : null
      }
      bodyClassName="flex flex-col justify-between px-3 py-3"
    >
      {!day ? (
        <Empty>Waiting for the business_day row.</Empty>
      ) : (
        <>
          <div>
            <div className="text-[22px] font-semibold leading-tight tracking-tight text-text">
              Day <Src id={`business_day ${day.id}`}>{day.day}</Src> of <Src id="calendar.ts: 92 weekdays from 2026-07-01">{TOTAL_DAYS}</Src>,{' '}
              <Src id={`business_day ${day.id}`} mono={false}>
                {dayLabel(day.date)}
              </Src>
            </div>
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-edge">
              <div
                className="h-full rounded-full bg-hold transition-[width] duration-500"
                style={{ width: `${Math.min(100, Math.max(0, (day.day / TOTAL_DAYS) * 100))}%` }}
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
              <span>
                tick <Src id={`business_day ${day.id}`}>{seconds(day.tickMicros)}</Src> per day
              </span>
              <span>
                date <Src id={`business_day ${day.id}`}>{day.date}</Src>
              </span>
              <span title="The controller pauses or resumes from ASI:One or the terminal. This page has no write access." className="cursor-help text-faint">
                controls live in ASI:One
              </span>
            </div>
          </div>
          <p className="mt-3 text-[11px] leading-snug text-faint">Simulated carrier. Every figure on this page is read from the ledger.</p>
        </>
      )}
    </Panel>
  );
}
