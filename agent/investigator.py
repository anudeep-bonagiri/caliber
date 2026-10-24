"""The read-only investigator on ASI:One: a second Fetch.ai uAgent (mailbox) with the `reader` identity.

Run from the repo root:  INVESTIGATOR_PORT=8012 agent/.venv/bin/python agent/investigator.py
Open the Agent Inspector link it prints, Connect, Mailbox, Finish. Then paste agent/INVESTIGATOR_README.md
into the Agentverse profile. INVESTIGATOR_SEED fixes the address; never change it after registering.

It answers `why <id>` and `status` from the public tables and the stored finding. Every money or rule command
sent to it goes to the module's `try_*` procedure with the reader token, so the database refuses it and the
refusal is an audit_event row with actor_role reader. The agent that explains cannot pay.
"""

from __future__ import annotations

import asyncio
import inspect
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote
from uuid import uuid4

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(ROOT / ".env")

from uagents import Agent, Context, Protocol  # noqa: E402
from uagents_core.contrib.protocols.chat import (  # noqa: E402
    ChatAcknowledgement,
    ChatMessage,
    EndSessionContent,
    TextContent,
    chat_protocol_spec,
)

from agent import intents, investigate, ledger, peers  # noqa: E402

AGENT_NAME = "caliber-investigator"
README = str(Path(__file__).resolve().parent / "INVESTIGATOR_README.md")
TAGS = ["innovationlab", "hackathon"]
DEFAULT_PORT = "8012"   # 8000 is an ssh forward on the demo laptop, 8011 the controller agent


def build_agent() -> Agent:
    seed = os.getenv("INVESTIGATOR_SEED")
    if not seed:
        sys.exit("INVESTIGATOR_SEED is not set. Run `python3 scripts/mint_identities.py` once (it generates it) and never change it.")
    kwargs = dict(
        name=AGENT_NAME,
        seed=seed,
        port=int(os.getenv("INVESTIGATOR_PORT", DEFAULT_PORT)),
        mailbox=True,
        publish_agent_details=True,
        readme_path=README,
    )
    params = inspect.signature(Agent.__init__).parameters
    if "metadata" in params:
        kwargs["metadata"] = {"is_public": "True", "tags": TAGS}
    if "description" in params:
        kwargs["description"] = (
            "The read-only investigator for Caliber, an autonomous accounts-payable clerk for a simulated "
            "trucking carrier. Explains any hold (why <id>) and reports the day clock (status). Holds a reader "
            "identity the database refuses on every payment, answer and rule call."
        )
    resolver = peers.resolver_for(peers.controller_address(), os.getenv("AGENT_PORT"))
    if resolver is not None and "resolve" in params:
        kwargs["resolve"] = resolver
    return Agent(**kwargs)


agent = build_agent()
chat = Protocol(spec=chat_protocol_spec)


def reply(text: str) -> ChatMessage:
    # Text-only replies must end the session or ASI:One does not display them.
    return ChatMessage(
        timestamp=datetime.now(timezone.utc),
        msg_id=uuid4(),
        content=[TextContent(type="text", text=text), EndSessionContent(type="end-session")],
    )


@agent.on_event("startup")
async def on_start(ctx: Context):
    port = os.getenv("INVESTIGATOR_PORT", DEFAULT_PORT)
    inspector = f"https://agentverse.ai/inspect/?uri={quote(f'http://127.0.0.1:{port}', safe='')}&address={agent.address}"
    ctx.logger.info(f"{AGENT_NAME} address {agent.address}")
    ctx.logger.info(f"Agent Inspector: {inspector}")
    with ledger.using("reader"):
        label = ledger.identity_label()
    path = "local 127.0.0.1" if peers.peer_path() == "local" and peers.controller_address() else "mailbox"
    ctx.logger.info(f"ledger {os.getenv('STDB_URI')} db {os.getenv('STDB_DB')} reads as {label}; peer path to the controller: {path}")


@chat.on_message(ChatMessage)
async def on_chat(ctx: Context, sender: str, msg: ChatMessage):
    await ctx.send(sender, ChatAcknowledgement(timestamp=datetime.now(timezone.utc), acknowledged_msg_id=msg.msg_id))
    raw = " ".join(c.text for c in msg.content if isinstance(c, TextContent)).strip()
    if not raw:
        return  # bare start-session or end-session marker
    # ASI:One delivers "@caliber-investigator approve 2231"; the command starts after the mention.
    text = intents.strip_mentions(raw)
    ctx.logger.info(f"{sender[:16]}: {raw[:120]}" + (f" -> {text[:60]}" if text != raw else ""))
    try:
        answer = await asyncio.to_thread(investigate.handle, sender, text)
    except Exception as e:  # the handler already maps ledger errors; this is a last net
        ctx.logger.error(f"handler failed: {e}")
        answer = f"Ledger error: {str(e)[:200]}"
    await ctx.send(sender, reply(investigate.attribute(answer)))


@chat.on_message(ChatAcknowledgement)
async def on_ack(ctx: Context, sender: str, msg: ChatAcknowledgement):
    pass


agent.include(chat, publish_manifest=True)

if __name__ == "__main__":
    agent.run()
