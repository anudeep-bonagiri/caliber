"""seed/calendar.py: the simulated business calendar, mirroring spacetimedb/src/calendar.ts.

This file name shadows the standard library's `calendar` whenever seed/ is first on sys.path, so it
first re-exports the real stdlib module (strptime and friends keep working) and then adds the
simulation functions from simcal.py: date_for_day, iso_date, week_of, local_to_utc, micros, iso.
"""
from __future__ import annotations

import importlib.util as _ilu
import os as _os
import sys as _sys
import sysconfig as _sysconfig

_std_path = _os.path.join(_sysconfig.get_paths()["stdlib"], "calendar.py")
_spec = _ilu.spec_from_file_location("_stdlib_calendar", _std_path)
_std = _ilu.module_from_spec(_spec)
_sys.modules["_stdlib_calendar"] = _std
_spec.loader.exec_module(_std)
globals().update({k: v for k, v in vars(_std).items() if not k.startswith("__")})

from simcal import (  # noqa: E402,F401
    DATES, LOCAL_UTC_OFFSET_HOURS, START, TOTAL_DAYS, date_for_day, iso, iso_date, iso_to_micros,
    local_label, local_to_utc, micros, micros_for_day, parse_iso, week_of,
)
