"""The controller seat on ASI:One: a Fetch.ai uAgent (mailbox) that runs the shared handler.

Run from the repo root or this folder:  python agent/agent.py
Open the Agent Inspector link it prints, Connect, Mailbox, Finish. Then paste agent/README.md
into the Agentverse profile. AGENT_SEED fixes the address; never change it after registering.
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
from uagents import Agent, Context, Protocol  # noqa: E402
from uagents_core.contrib.protocols.chat import (  # noqa: E402
    ChatAcknowledgement,
    ChatMessage,
    EndSessionContent,
    TextContent,
    chat_protocol_spec,
)

from agent.handlers import handle  # noqa: E402

load_dotenv(ROOT / ".env")

AGENT_NAME = "dispatch-ledger-controller"
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
            "The fleet controller's seat for Dispatch Ledger, an autonomous accounts-payable clerk for a "
            "simulated trucking carrier. Lists holds, explains findings, takes answers and approvals."
        )
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
    port = os.getenv("AGENT_PORT", "8000")
    inspector = f"https://agentverse.ai/inspect/?uri={quote(f'http://127.0.0.1:{port}', safe='')}&address={agent.address}"
    ctx.logger.info(f"{AGENT_NAME} address {agent.address}")
    ctx.logger.info(f"Agent Inspector: {inspector}")
    ctx.logger.info(f"ledger {os.getenv('STDB_URI')} db {os.getenv('STDB_DB')} model {'on' if os.getenv('ASI_ONE_API_KEY') else 'off (regex + last-hold fallback)'}")


@chat.on_message(ChatMessage)
async def on_chat(ctx: Context, sender: str, msg: ChatMessage):
    await ctx.send(sender, ChatAcknowledgement(timestamp=datetime.now(timezone.utc), acknowledged_msg_id=msg.msg_id))
    text = " ".join(c.text for c in msg.content if isinstance(c, TextContent)).strip()
    if not text:
        return  # bare start-session or end-session marker
    ctx.logger.info(f"{sender[:16]}: {text[:120]}")
    try:
        answer = await asyncio.to_thread(handle, sender, text)
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
