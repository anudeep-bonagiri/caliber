"""Terminal front door, same handler as the uAgent. Works with no internet.

    python -m agent.cli "what needs me"
    python -m agent.cli            (interactive)
"""

from __future__ import annotations

import sys

from .handlers import handle

SENDER = "cli"


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    if argv:
        print(handle(SENDER, " ".join(argv)))
        return 0
    print("Dispatch Ledger controller. Type help, or quit to leave.")
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
        print(handle(SENDER, line))


if __name__ == "__main__":
    raise SystemExit(main())
