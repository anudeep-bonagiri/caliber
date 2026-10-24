"""How the two uAgents find each other (Task 18).

Addresses: each agent's address is derived from its seed. The controller finds the investigator through
INVESTIGATOR_ADDRESS, or derives it from INVESTIGATOR_SEED when both run from the same .env on the demo
laptop. The investigator finds the controller the same way through AGENT_ADDRESS or AGENT_SEED.

Delivery path: both agents are mailbox agents, so by default a message between them goes out through
Agentverse and back (Sprout measured about 4 s per hop). AGENT_PEER_PATH=local (the default on the demo
laptop, where both listen on 127.0.0.1) resolves the peer's address straight to its local /submit endpoint
and leaves every other destination (ASI:One users) to the normal resolver. AGENT_PEER_PATH=mailbox forces
the Agentverse path, for measuring it.
"""

from __future__ import annotations

import os

from uagents.crypto import Identity
from uagents.resolver import GlobalResolver, Resolver


def address_from_seed(seed: str | None) -> str | None:
    if not seed:
        return None
    return Identity.from_seed(seed, 0).address


def investigator_address() -> str | None:
    return os.getenv("INVESTIGATOR_ADDRESS") or address_from_seed(os.getenv("INVESTIGATOR_SEED"))


def controller_address() -> str | None:
    return os.getenv("AGENT_ADDRESS") or address_from_seed(os.getenv("AGENT_SEED"))


def peer_path() -> str:
    return (os.getenv("AGENT_PEER_PATH") or "local").strip().lower()


def local_endpoint(port: str | int) -> str:
    return f"http://127.0.0.1:{int(port)}/submit"


class LocalFirstResolver(Resolver):
    """One or two peers resolved to fixed local endpoints; everything else through the global resolver."""

    def __init__(self, rules: dict[str, str], fallback: Resolver | None = None):
        self._rules = {k: v for k, v in rules.items() if k and v}
        self._fallback = fallback or GlobalResolver()

    async def resolve(self, destination: str) -> tuple[str | None, list[str]]:
        endpoint = self._rules.get(destination)
        if endpoint:
            return destination, [endpoint]
        return await self._fallback.resolve(destination)


def resolver_for(peer_address: str | None, peer_port: str | int | None) -> Resolver | None:
    """The resolver to hand the Agent constructor: a local-first one when AGENT_PEER_PATH=local and the
    peer is known, else None (the uagents default, which is the mailbox path)."""
    if peer_path() != "local" or not peer_address or not peer_port:
        return None
    return LocalFirstResolver({peer_address: local_endpoint(peer_port)})
