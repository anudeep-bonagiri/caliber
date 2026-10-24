"""Controller-side forwarding of `why <id>` and `status` to the investigator agent (Task 18.2).

Pure asyncio, no uagents import, so the mock-transport tests can drive it. The controller agent gives it
the investigator's address and two callables: `send(address, text, channel)` to deliver a chat line (the
channel is the uagents context of the user's own message, so every reply to that user goes out on the
session ASI:One opened), and `fallback(user, text) -> str` to answer from the ledger directly when the
investigator is late.

A pending entry is keyed on the user who asked. The investigator's reply is matched by the session the
forward went out on (uagents keeps the session id across the hop), else by the oldest pending entry. A reply
from the investigator is only ever relayed; it is never parsed as a command (see `is_investigator`).
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable

from .investigate import PREFIX, attribute

TIMEOUT_S = 8.0
LATE = "investigator did not answer in time; from the ledger directly:"

Send = Callable[[str, str, Any], Awaitable[Any]]
Fallback = Callable[[str, str], Awaitable[str]]


@dataclass
class Pending:
    user: str
    text: str
    session: Any
    started: float
    channel: Any = field(default=None, repr=False)
    timer: asyncio.Task | None = field(default=None, repr=False)


class Relay:
    def __init__(self, investigator: str | None, send: Send, fallback: Fallback, timeout: float = TIMEOUT_S,
                 clock: Callable[[], float] = time.monotonic, log: Callable[[str], None] = lambda s: None):
        self.investigator = investigator
        self.send = send
        self.fallback = fallback
        self.timeout = timeout
        self.clock = clock
        self.log = log
        self.pending: dict[str, Pending] = {}
        self.round_trips: list[float] = []   # seconds, measured on the real two processes
        self.late = 0

    @property
    def enabled(self) -> bool:
        return bool(self.investigator)

    def is_investigator(self, sender: str) -> bool:
        return bool(self.investigator) and sender == self.investigator

    def route(self, sender: str, intent_name: str | None) -> str:
        """Where one incoming chat line goes: "investigator_reply" (relay it, never run it), "forward" (the two
        read intents, when an investigator is configured) or "controller" (the seat's own handler)."""
        if self.is_investigator(sender):
            return "investigator_reply"
        if self.enabled and intent_name in ("why", "status"):
            return "forward"
        return "controller"

    async def forward(self, user: str, text: str, session: Any = None, channel: Any = None) -> None:
        """Send the user's line to the investigator and start the timer. One in flight per user: a second
        question from the same user before the first answer replaces it."""
        old = self.pending.pop(user, None)
        if old and old.timer:
            old.timer.cancel()
        p = Pending(user=user, text=text, session=session, started=self.clock(), channel=channel)
        self.pending[user] = p
        await self.send(self.investigator, text, channel)
        p.timer = asyncio.create_task(self._expire(user, p))

    async def _expire(self, user: str, p: Pending) -> None:
        try:
            await asyncio.sleep(self.timeout)
        except asyncio.CancelledError:
            return
        if self.pending.get(user) is not p:
            return
        self.pending.pop(user, None)
        self.late += 1
        self.log(f"investigator late for {user[:16]} after {self.timeout:g} s; answering from the ledger")
        answer = await self.fallback(user, p.text)
        await self.send(user, f"{LATE}\n{answer}", p.channel)

    async def on_investigator_reply(self, text: str, session: Any = None) -> bool:
        """Relay the investigator's answer to the user it belongs to. Returns False when nothing was pending."""
        p = self._match(session)
        if p is None:
            self.log("investigator reply with nothing pending; dropped (never run as a command)")
            return False
        if p.timer:
            p.timer.cancel()
        elapsed = self.clock() - p.started
        self.round_trips.append(elapsed)
        self.log(f"investigator round trip {elapsed:.2f} s for {p.user[:16]}")
        await self.send(p.user, attribute(text), p.channel)
        return True

    def _match(self, session: Any) -> Pending | None:
        if session is not None:
            for user, p in self.pending.items():
                if p.session == session:
                    return self.pending.pop(user)
        if not self.pending:
            return None
        user = min(self.pending, key=lambda u: self.pending[u].started)
        return self.pending.pop(user)


__all__ = ["Relay", "Pending", "PREFIX", "LATE", "TIMEOUT_S"]
