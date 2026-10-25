"""The controller seat on ASI:One: a Fetch.ai uAgent (mailbox) that runs the shared handler.

Task 18: `why <id>` and `status` are forwarded to the investigator agent (agent/investigator.py) over
agent-to-agent chat and relayed back under the hop line "asked @caliber-investigator <address>, <n> s", then
prefixed "investigator:"; after 8 s the controller answers from the
ledger itself, prefixed "investigator did not answer in time; from the ledger directly:".

Task 28 item 3: every write (answer, approve, reject, rule decisions, clock) is allowed only for senders listed
in ASI_ALLOWED_SENDERS (.env, comma-separated agent1q... addresses; empty means nobody). Anyone else gets
"not authorised for this seat"; the refusal, with the full sender address, goes to this agent's log and, through
try_record_seat_refusal signed by the controller, to an audit_event row (action seat_refused). If that call
fails it is logged and the reply is unchanged. Reads stay open to everyone.

Run from the repo root or this folder:  python agent/agent.py
Open the Agent Inspector link it prints, Connect, Mailbox, Finish. Then paste agent/README.md
into the Agentverse profile. AGENT_SEED fixes the address; never change it after registering.
"""

from __future__ import annotations

import asyncio
import inspect
import logging
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
from uagents import Agent, Context, Protocol  # noqa: E402
from uagents_core.contrib.protocols.chat import (  # noqa: E402
    ChatAcknowledgement,
    ChatMessage,
    EndSessionContent,
    TextContent,
    chat_protocol_spec,
)

load_dotenv(ROOT / ".env")

from agent import handlers, intents, peers  # noqa: E402
from agent.handlers import handle  # noqa: E402
from agent.relay import Relay  # noqa: E402

AGENT_NAME = "caliber-controller"
README = str(Path(__file__).resolve().parent / "README.md")
TAGS = ["innovationlab", "hackathon"]


def build_agent() -> Agent:
    seed = os.getenv("AGENT_SEED")
    if not seed:
        sys.exit("AGENT_SEED is not set. Run `openssl rand -hex 32` once, put it in .env, and never change it.")
    kwargs = dict(
        name=AGENT_NAME,
        seed=seed,
        port=int(os.getenv("AGENT_PORT", "8000")),
        mailbox=True,
        publish_agent_details=True,
        readme_path=README,
    )
    params = inspect.signature(Agent.__init__).parameters
    if "metadata" in params:
        kwargs["metadata"] = {"is_public": "True", "tags": TAGS}
    if "description" in params:
        kwargs["description"] = (
            "The fleet controller's seat for Caliber, an autonomous accounts-payable clerk for a "
            "simulated trucking carrier. Lists holds, explains findings, takes answers and approvals."
        )
    # Task 18: the investigator peer, reached on 127.0.0.1 when both agents run on this laptop.
    resolver = peers.resolver_for(peers.investigator_address(), os.getenv("INVESTIGATOR_PORT", "8012"))
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


# ---- Task 18: `why` and `status` are the investigator's. The controller forwards them and relays the answer.
INVESTIGATOR = peers.investigator_address()
LOG = logging.getLogger(AGENT_NAME)


async def _send(address: str, text: str, channel) -> None:
    # `channel` is the uagents context of the user's own message: the reply rides that user's session.
    await channel.send(address, reply(text))


async def _fallback(user: str, text: str) -> str:
    return await asyncio.to_thread(handle, user, text, handlers.may_write(user), _refusal_logger(user))


def _refusal_logger(sender: str):
    return handlers.seat_refusal(sender, LOG.warning)


relay = Relay(INVESTIGATOR, _send, _fallback, log=LOG.info)


@agent.on_event("startup")
async def on_start(ctx: Context):
    port = os.getenv("AGENT_PORT", "8000")
    inspector = f"https://agentverse.ai/inspect/?uri={quote(f'http://127.0.0.1:{port}', safe='')}&address={agent.address}"
    ctx.logger.info(f"{AGENT_NAME} address {agent.address}")
    ctx.logger.info(f"Agent Inspector: {inspector}")
    ctx.logger.info(f"ledger {os.getenv('STDB_URI')} db {os.getenv('STDB_DB')} model {'on' if os.getenv('ASI_ONE_API_KEY') else 'off (regex + last-hold fallback)'}")
    if INVESTIGATOR:
        path = "local 127.0.0.1" if peers.peer_path() == "local" else "mailbox"
        ctx.logger.info(f"investigator {INVESTIGATOR} (why and status forwarded; peer path {path}; timeout 8 s)")
    else:
        ctx.logger.info("no investigator configured (INVESTIGATOR_ADDRESS or INVESTIGATOR_SEED); why and status answered here")
    n = len(handlers.allowed_senders())
    ctx.logger.info(f"writes allowed for {n} sender(s) in ASI_ALLOWED_SENDERS" if n else
                    "ASI_ALLOWED_SENDERS is empty: every write is refused (not authorised for this seat); reads stay open")


@chat.on_message(ChatMessage)
async def on_chat(ctx: Context, sender: str, msg: ChatMessage):
    await ctx.send(sender, ChatAcknowledgement(timestamp=datetime.now(timezone.utc), acknowledged_msg_id=msg.msg_id))
    raw = " ".join(c.text for c in msg.content if isinstance(c, TextContent)).strip()
    if not raw:
        return  # bare start-session or end-session marker
    # ASI:One delivers "@caliber-controller why 2231"; the command starts after the mention.
    text = intents.strip_mentions(raw)
    it = intents.parse(text)
    route = relay.route(sender, it.name if it else None)
    if route == "investigator_reply":
        # The investigator's answer. Relayed to the user who asked, never parsed as a command.
        ctx.logger.info(f"investigator replied: {text[:80].replace(chr(10), ' | ')}")
        await relay.on_investigator_reply(text, ctx.session)
        return
    ctx.logger.info(f"{sender[:16]}: {raw[:120]}" + (f" -> {text[:60]}" if text != raw else ""))
    if route == "forward":
        if it.name == "why":
            try:
                handlers.remember(sender, it.ref or "")   # a later free-text line still answers this hold
            except Exception as e:                      # a bad reference: let the investigator say so
                ctx.logger.info(f"forwarding why with a bad reference: {e}")
        await relay.forward(sender, text, ctx.session, ctx)
        return
    try:
        answer = await asyncio.to_thread(handle, sender, text, handlers.may_write(sender), _refusal_logger(sender))
    except Exception as e:  # the handler already maps ledger errors; this is a last net
        ctx.logger.error(f"handler failed: {e}")
        answer = f"Refused: {str(e)[:200]}"
    await ctx.send(sender, reply(answer))


@chat.on_message(ChatAcknowledgement)
async def on_ack(ctx: Context, sender: str, msg: ChatAcknowledgement):
    pass


agent.include(chat, publish_manifest=True)

if __name__ == "__main__":
    agent.run()
