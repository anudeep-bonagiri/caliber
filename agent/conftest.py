"""Test-run environment for agent/. ASI_MOCK=1 makes intents._chat_completion return a canned reply instead of
calling asi1.ai, so the tests never make a paid call even when ASI_ONE_API_KEY is present in .env."""
import os

os.environ["ASI_MOCK"] = "1"
