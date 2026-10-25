# Connect the two agents to Agentverse and ASI:One

Anudeep does these clicks once per agent. Each address is fixed by its seed in `.env` (`AGENT_SEED` for the controller, `INVESTIGATOR_SEED` for the investigator); never change a seed after this.

## Start order

1. The local ledger must be up (the demo laptop runs `scripts/demo_up.sh` first; it rewrites the controller token in `.env`, so the agents are always started after it, never before). Then `python3 scripts/mint_identities.py` so `.env` has the reader token for the investigator (it reuses an existing reader line).
2. Start the investigator from the repo root: `INVESTIGATOR_PORT=8012 agent/.venv/bin/python agent/investigator.py` (port 8012). It prints `dispatch-investigator address agent1q...`; that address is the one in `agent/INVESTIGATOR_README.md` and the README table.
3. Start the seat from the repo root: `agent/.venv/bin/python agent/agent.py` (port 8011; 8000 is held by an ssh forward on this laptop, see `AGENT_PORT` in `.env`). It logs `investigator agent1q... (why and status forwarded; peer path local 127.0.0.1; timeout 8 s)`; the address there must equal the investigator's.
4. The controller's terminal prints two lines to keep: `Starting agent with address: agent1q...` and `Agent inspector available at https://agentverse.ai/inspect/?uri=http%3A//127.0.0.1%3A8011&address=agent1q...`. The address must read `agent1qt278cr9luj7xw9cs6c47lnfl9tvx9xsu7asxtmhuqkcqq920m6ju5y5yge`; if it differs, the seed changed, stop and say so.

## Inspector: Connect, Mailbox, Finish (once per agent)

1. Open the Inspector link from the terminal in a browser signed in to agentverse.ai.
2. Click Connect, choose Mailbox, click Finish. The terminal log stops saying `Agent mailbox not found` and shows the mailbox client running.
3. On agentverse.ai open the agent's page. Paste the whole of `agent/README.md` (controller) or `agent/INVESTIGATOR_README.md` (investigator) into the profile README. Set the tags `innovationlab` and `hackathon` (the two badge lines in each README must stay byte-exact).
4. Confirm the agent is public and that "Chat with Agent" opens a conversation in ASI:One.
5. Repeat for the second agent: its Inspector link is in `logs/investigator.log` (`Agent Inspector: https://agentverse.ai/inspect/?uri=http%3A%2F%2F127.0.0.1%3A8012&address=agent1q...`).

## The two-line ASI:One check (Task 18)

1. In a chat with `caliber-controller`, type `why 2231`. The reply's first line is `asked @caliber-investigator agent1qvwvlc0vz2amjh4q4yf0p2fglqrzw2rmfm6afrsq82e8lq5df7yyxnrxaqh, <round trip> s` and the second starts `investigator:`; it came from the investigator agent over agent-to-agent chat and was relayed. (If it starts `investigator did not answer in time; from the ledger directly:` the hop took over 8 seconds; the rows are the same.)
2. In a chat with `caliber-investigator`, type `approve 2231`. The reply is `investigator: refused by the ledger: reader may not do this (needs controller)`. The dashboard's Ledger of trust shows a red `refused` row with actor `reader` and ref `2231`; so does `SELECT actor_role, action, ref, detail FROM audit_event WHERE actor_role = 'reader'`.

## Who may write

Only the ASI:One senders in `ASI_ALLOWED_SENDERS` (repo root `.env`, comma-separated `agent1q...`) can answer, approve, reject, decide rules or move the clock; anyone else gets `not authorised for this seat`. Empty means nobody. To find your own sender address, send `approve 2231` from your ASI:One account once: `logs/agent.log` prints `refused approve from agent1q...: not authorised for this seat (not in ASI_ALLOWED_SENDERS)` with the full address. Put it in `.env` and restart the controller.

## Cal Hacks submission agent

Register the agent through the Cal Hacks ASI:One submission agent linked from Fetch.ai's event page (the hackpack calls it the submission agent). It asks for the `agent1q...` address and the repo link. The Fetch.ai video must be 3 to 5 minutes; `docs/VIDEO.md` plans a 3:30 to 4:00 cut.

## The scripted session, right after Connect

Start a stopwatch at the first keystroke. Task 10 says the whole exchange is under 60 seconds; Agentverse adds a few seconds per hop, so type the next line as soon as a reply lands.

| Order | Type | Expected reply shape (from `agent/handlers.py` and `agent/formatting.py`) |
| --- | --- | --- |
| 1 | `status` | `asked @caliber-investigator agent1q..., <round trip> s`, then `investigator: Day <d> of 92 (<date>), clock paused|running, tick <n> s. Today: <n> transactions, <n> auto-paid ($...), <n> held, <n> rejected.` (relayed from the investigator) |
| 2 | `why 2231` | `asked @caliber-investigator agent1q..., <round trip> s`, then `investigator:` and the hold line, `Finding: ...`, two `Evidence:` lines, `Recommendation: ...`, `Question: ...`, `source: replayed` (or `live` when the worker is live); answered by the investigator agent and relayed |
| 3 | `answer 2231 Yes. Ortiz drove unit 22 that week while unit 17 was in the shop, per the swap log.` | `answer_question 2231 written to audit_event by controller (event <n>, day 41, ...)` |
| 4 | `rules` then `approve rule <n>` | `Rules (<k>):` with the candidate rule and its backtest line; then `approve_rule <n> written to audit_event by controller (...)` |
| 5 | `approve 2231` | `Refused: hold is cleared_by_rule` (the rule already cleared and paid it; that refusal is correct and is itself an audit row). For a payment that needs a release, use `approve INV-1077 <call-back note of 8+ characters>` on day 44 and read `approve_payment INV-1077 written to audit_event by controller (...)` |

Stop the watch after the last reply. Write the time into `context/PROJECT_STATUS.md` with the five lines as typed. If any line is refused for a reason you did not expect, the reply shows the database's own message after `Refused:`; say it out loud, it is the point.

If the mailbox is not connected at the table, the terminal twin runs the same five lines: `agent/.venv/bin/python -m agent.cli "<line>"`. Same handlers, other front door: `why` and `status` come from the investigator's handler module as the reader identity and carry the `investigator:` prefix there too.
