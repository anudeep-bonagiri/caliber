"""Simulated calendar. Business day 1 is Wednesday 2026-07-01, weekends are skipped, 92 days.

Mirrors spacetimedb/src/calendar.ts (dateForDay, microsForDay). The simulation keeps one fixed
local offset (UTC-5, Texas daylight time) for all 92 days; timestamps written to fixtures are UTC.
"""
from __future__ import annotations

import datetime as dt

START = dt.date(2026, 7, 1)
TOTAL_DAYS = 92
LOCAL_UTC_OFFSET_HOURS = 5
_EPOCH = dt.datetime(1970, 1, 1, tzinfo=dt.timezone.utc)
_UTC = dt.timezone.utc


def date_for_day(day: int) -> dt.date:
    """Same loop as calendar.ts: start the day before 2026-07-01 and count weekdays forward."""
    if day <= 0:
        return START
    remaining = day
    d = START - dt.timedelta(days=1)
    while remaining > 0:
        d += dt.timedelta(days=1)
        if d.weekday() < 5:
            remaining -= 1
    return d


DATES = {d: date_for_day(d) for d in range(1, TOTAL_DAYS + 1)}


def iso_date(day: int) -> str:
    return DATES[day].isoformat()


def week_of(day: int) -> int:
    """Business week, 1-based, five business days each."""
    return (day - 1) // 5 + 1


def local_to_utc(day: int, minutes: float, seconds: int = 0) -> dt.datetime:
    """Local wall-clock time on a business day (minutes after local midnight) as a UTC datetime, whole seconds."""
    base = dt.datetime.combine(DATES[day], dt.time(0, 0), tzinfo=_UTC)
    total = int(round(minutes * 60)) + seconds + LOCAL_UTC_OFFSET_HOURS * 3600
    return base + dt.timedelta(seconds=total)


def micros_for_day(day: int, hour: int = 0, minute: int = 0) -> int:
    """UTC midnight of the business day plus hour and minute, in microseconds (calendar.ts microsForDay)."""
    t = dt.datetime.combine(date_for_day(day), dt.time(hour, minute), tzinfo=_UTC)
    return micros(t)


def micros(t: dt.datetime) -> int:
    return (t - _EPOCH) // dt.timedelta(microseconds=1)


def iso(t: dt.datetime) -> str:
    return t.strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_iso(s: str) -> dt.datetime:
    return dt.datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=_UTC)


def iso_to_micros(s: str) -> int:
    return micros(parse_iso(s))


def local_label(t: dt.datetime) -> str:
    """Local time string for human-readable documents."""
    local = t - dt.timedelta(hours=LOCAL_UTC_OFFSET_HOURS)
    return local.strftime("%Y-%m-%d %H:%M") + " CDT"
