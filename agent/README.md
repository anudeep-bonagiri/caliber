# Dispatch Ledger Controller

![tag:innovationlab](https://img.shields.io/badge/innovationlab-3D8BD3)
![tag:hackathon](https://img.shields.io/badge/hackathon-5F43F1)

The fleet controller's seat for Dispatch Ledger, an autonomous accounts-payable clerk for a simulated trucking carrier. The carrier's whole state (business day clock, fuel card and toll transactions, invoices, holds, rules, payments and the audit trail) lives in one SpacetimeDB module. A matching kernel pays clean transactions by itself, a Droid investigator works the exceptions and asks one question when it needs one, and this agent is where the controller answers it. Every reply is read from ledger rows, every approval is a reducer call that the database checks for role and segregation of duties, and every refusal shows the reducer's own message. No agent moves money on its own.

| Name | Handle | Address | Role | Code |
| --- | --- | --- | --- | --- |
| Dispatch Ledger Controller | `@dispatch-ledger-controller` | `agent1qt278cr9luj7xw9cs6c47lnfl9tvx9xsu7asxtmhuqkcqq920m6ju5y5yge` | Holds the `controller` identity: lists holds, explains findings, takes answers, approvals and rejections, drives the simulated clock | [agent/](https://github.com/anudeep-bonagiri/dispatch-ledger/tree/main/agent) |
| Dispatch Investigator | `@dispatch-investigator` | `agent1qvwvlc0vz2amjh4q4yf0p2fglqrzw2rmfm6afrsq82e8lq5df7yyxnrxaqh` | Holds the read-only `reader` identity: answers `why <id>` and `status`; every payment, answer or rule call it is asked for is refused by the ledger and recorded with its role | [agent/investigator.py](https://github.com/anudeep-bonagiri/dispatch-ledger/blob/main/agent/investigator.py) |

Two agents, one split the database already enforces: the agent that explains a hold cannot pay it. `why <id>` and `status` are the investigator's; the controller forwards them over agent-to-agent chat and relays the answer prefixed `investigator:` (after 8 seconds it answers from the ledger itself, prefixed `investigator did not answer in time; from the ledger directly:`). Sent straight to the investigator, `approve 2231` comes back `investigator: refused by the ledger: reader may not do this (needs controller)`, and that refusal is an `audit_event` row with `actor_role reader`.

## Commands

Five commands cover the whole workflow; each with one example as typed in ASI:One.

| Command | Example | Reply shape |
| --- | --- | --- |
| `what needs me` | `what needs me` | `Needs you (3):` then one line per hold: `2231  $412.00  location_mismatch  day 41  Q: <the investigator's question>` |
| `why <id>` | `why 2231` | `investigator:` then the hold line, `Finding: ...`, up to two `Evidence: "..." (source, ref)` lines, `Recommendation: ...`, `Question: ...`, `source: live | replayed | scripted stand-in` (answered by the investigator agent, relayed) |
| `answer <id> <text>` | `answer 2231 Yes. Ortiz drove unit 22 that week while unit 17 was in the shop, per the swap log.` | `answer_question 2231 written to audit_event by controller (event <n>, day 41, ...)` |
| `approve rule <n>` | `approve rule 7` (read `<n>` from `rules`) | `approve_rule 7 written to audit_event by controller (event <n>, day 41, location_mismatch {"driverId":23})` |
| `approve <id> [note]` | `approve INV-1077 Called Gulf Coast Diesel on the number on file; new account confirmed by M. Reyes.` | `approve_payment INV-1077 written to audit_event by controller (event <n>, day 44, <note>)`; without a note on a bank change: `Refused: call-back note required for a bank change` |

Everything else the seat understands:

| Say | What happens |
| --- | --- |
| `what needs me` (also `holds`, `queue`) | Holds waiting on you, one per line with the investigator's question; open holds still under investigation are listed as such |
| `why 2231` | Forwarded to the investigator agent: the finding, up to two evidence quotes with their source, the recommendation, the pending question, and whether the investigation was live, replayed or a scripted stand-in, prefixed `investigator:` |
| `answer 2231 <text>` or just type the answer | Records your answer; the worker drafts a rule from it |
| `approve 2231 [call-back note]` | Releases the payment (a bank change needs a call-back note of 8 or more characters) |
| `reject 2231 <reason>` | Refuses the payment |
| `rules` | Candidate and approved rules with backtest counts and expiry |
| `approve rule 1`, `reject rule 1 <reason>` | Decide a drafted rule |
| `status` | Forwarded to the investigator agent: business day clock and today's totals, prefixed `investigator:` |
| `pause`, `resume`, `step` | Control the simulated clock |
| `help` | This list |

Every action calls the module's `try_*` procedure (`try_approve_payment`, `try_reject_payment`, `try_answer_question`, `try_approve_rule`, `try_reject_rule`, `try_set_clock`, `try_step_day`) with the controller token. Confirmations echo the audit row, for example `approve_payment 2231 written to audit_event by controller (event 41, day 41)`. A refusal comes back from the database as `[false, "<message>"]`, is kept as an `audit_event` row with `action = refused`, and reads here as `Refused: requester cannot approve`. The controller who injected a test transaction is its requester and cannot approve it; that is the segregation of duties working.

## Run it

```
cd agent && uv venv .venv && uv pip install -p .venv/bin/python -r requirements.txt
cd .. && agent/.venv/bin/python -m agent.cli "what needs me"     # terminal, no internet needed
agent/.venv/bin/python agent/agent.py                             # the controller uAgent; open the Inspector link, Connect, Mailbox
INVESTIGATOR_PORT=8012 agent/.venv/bin/python agent/investigator.py  # the investigator uAgent, same Connect steps
```

Environment (repo root `.env`): `STDB_URI`, `STDB_DB`, `STDB_CONTROLLER_TOKEN`, `AGENT_SEED`, `AGENT_PORT`, and optionally `ASI_ONE_API_KEY` for free-text routing through `asi1-mini`. The investigator adds `STDB_READER_TOKEN` (minted by `scripts/mint_identities.py`; without it the investigator reads anonymously and says `read as anonymous`), `INVESTIGATOR_SEED` and `INVESTIGATOR_PORT`; the controller finds it through `INVESTIGATOR_ADDRESS` or derives the address from `INVESTIGATOR_SEED`. `AGENT_PEER_PATH=local` (default) delivers between the two agents on 127.0.0.1; `mailbox` sends through Agentverse. Without the key, free text is taken as the answer to the hold you last discussed. A line that starts like a command but does not parse (`aprove 2231`, a bare `answer`) gets the help text, never stored as an answer. Text is bounded before any call, matching the module: answers up to 1000 characters, call-back notes and reasons up to 500, control characters other than newline dropped; at most 2000 characters go to the classifier.

Simulated carrier. Sandbox money. Not for operational use.
