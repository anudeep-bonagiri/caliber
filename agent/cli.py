"""Terminal front door, same handlers as the two uAgents. Works with no internet.

    python -m agent.cli "what needs me"
    python -m agent.cli            (interactive)
"""

from __future__ import annotations

import sys

from . import handlers, intents, investigate
from .handlers import handle

SENDER = "cli"


def answer(line: str) -> str:
    """The same split as the two uAgents: `why` and `status` come from the investigator's handler module as the
    reader identity and carry the "investigator:" prefix; everything else is the controller's."""
    line = intents.strip_mentions(line)   # the same front door rule as the two uAgents
    it = intents.parse(line)
    if investigate.answers(it):
        if it.name == "why":
            try:
                handlers.remember(SENDER, it.ref or "")
            except Exception:
                pass    # the investigator reports the bad reference
        return investigate.attribute(investigate.handle(SENDER, line))
    return handle(SENDER, line)


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    if argv:
        print(answer(" ".join(argv)))
        return 0
    print("Caliber controller. Type help, or quit to leave.")
    while True:
        try:
            line = input("controller> ")
        except (EOFError, KeyboardInterrupt):
            print()
            return 0
        if line.strip().lower() in ("quit", "exit", "q"):
            return 0
        if not line.strip():
            continue
        print(answer(line))


if __name__ == "__main__":
    raise SystemExit(main())
