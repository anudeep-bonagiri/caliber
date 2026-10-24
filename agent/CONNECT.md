# Connect the controller seat to Agentverse and ASI:One

Anudeep does these clicks once. The agent's address is fixed by `AGENT_SEED` in `.env`; never change the seed after this.

## Start order

1. The local ledger must be up (the demo laptop runs `scripts/demo_up.sh` first; it rewrites the controller token in `.env`, so the agent is always started after it, never before).
2. Start the seat from the repo root: `agent/.venv/bin/python agent/agent.py` (port 8011; 8000 is held by an ssh forward on this laptop, see `AGENT_PORT` in `.env`).
3. The terminal prints two lines to keep: `Starting agent with address: agent1q...` and `Agent inspector available at https://agentverse.ai/inspect/?uri=http%3A//127.0.0.1%3A8011&address=agent1q...`. The address must read `agent1qt278cr9luj7xw9cs6c47lnfl9tvx9xsu7asxtmhuqkcqq920m6ju5y5yge`; if it differs, the seed changed, stop and say so.

## Inspector: Connect, Mailbox, Finish

1. Open the Inspector link from the terminal in a browser signed in to agentverse.ai.
2. Click Connect, choose Mailbox, click Finish. The terminal log stops saying `Agent mailbox not found` and shows the mailbox client running.
3. On agentverse.ai open the agent's page. Paste the whole of `agent/README.md` into the profile README. Set the tags `innovationlab` and `hackathon` (the two badge lines in the README must stay byte-exact).
4. Confirm the agent is public and that "Chat with Agent" opens a conversation in ASI:One.

## Cal Hacks submission agent

Register the agent through the Cal Hacks ASI:One submission agent linked from Fetch.ai's event page (the hackpack calls it the submission agent). It asks for the `agent1q...` address and the repo link. The Fetch.ai video must be 3 to 5 minutes; `docs/VIDEO.md` plans a 3:30 to 4:00 cut.

## The scripted session, right after Connect

Start a stopwatch at the first keystroke. Task 10 says the whole exchange is under 60 seconds; Agentverse adds a few seconds per hop, so type the next line as soon as a reply lands.

| Order | Type | Expected reply shape (from `agent/handlers.py` and `agent/formatting.py`) |
| --- | --- | --- |
| 1 | `status` | `Day <d> of 92 (<date>), clock paused|running, tick <n> s. Today: <n> transactions, <n> auto-paid ($...), <n> held, <n> rejected.` |
| 2 | `why 2231` | The hold line, `Finding: ...`, two `Evidence:` lines, `Recommendation: ...`, `Question: ...`, `source: replayed` (or `live` when the worker is live) |
| 3 | `answer 2231 Yes. Ortiz drove unit 22 that week while unit 17 was in the shop, per the swap log.` | `answer_question 2231 written to audit_event by controller (event <n>, day 41, ...)` |
| 4 | `rules` then `approve rule <n>` | `Rules (<k>):` with the candidate rule and its backtest line; then `approve_rule <n> written to audit_event by controller (...)` |
| 5 | `approve 2231` | `Refused: hold is cleared_by_rule` (the rule already cleared and paid it; that refusal is correct and is itself an audit row). For a payment that needs a release, use `approve INV-1077 <call-back note of 8+ characters>` on day 44 and read `approve_payment INV-1077 written to audit_event by controller (...)` |

Stop the watch after the last reply. Write the time into `context/PROJECT_STATUS.md` with the five lines as typed. If any line is refused for a reason you did not expect, the reply shows the database's own message after `Refused:`; say it out loud, it is the point.

If the mailbox is not connected at the table, the terminal twin runs the same five lines: `agent/.venv/bin/python -m agent.cli "<line>"`. Same handler, other front door.
