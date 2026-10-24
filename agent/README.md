# Dispatch Ledger Controller

![tag:innovationlab](https://img.shields.io/badge/innovationlab-3D8BD3)
![tag:hackathon](https://img.shields.io/badge/hackathon-5F43F1)

The fleet controller's seat for Dispatch Ledger, an autonomous accounts-payable clerk for a simulated trucking carrier. The carrier's whole state (business day clock, fuel card and toll transactions, invoices, holds, rules, payments and the audit trail) lives in one SpacetimeDB module. A matching kernel pays clean transactions by itself, a Droid investigator works the exceptions and asks one question when it needs one, and this agent is where the controller answers it. Every reply is read from ledger rows, every approval is a reducer call that the database checks for role and segregation of duties, and every refusal shows the reducer's own message. No agent moves money on its own.

| Name | Handle | Address | Role | Code |
| --- | --- | --- | --- | --- |
| Dispatch Ledger Controller | `@dispatch-ledger-controller` | `agent1q...` | Holds the `controller` identity: lists holds, explains findings, takes answers, approvals and rejections, drives the simulated clock | [agent/](https://github.com/anudeep-bonagiri/dispatch-ledger/tree/main/agent) |

## Commands

| Say | What happens |
| --- | --- |
| `what needs me` (also `holds`, `queue`) | Holds waiting on you, one per line with the investigator's question; open holds still under investigation are listed as such |
| `why 2231` | The finding, up to two evidence quotes with their source, the recommendation, the pending question, and whether the investigation was live, replayed or a scripted stand-in |
| `answer 2231 <text>` or just type the answer | Records your answer; the worker drafts a rule from it |
| `approve 2231 [call-back note]` | Releases the payment (a bank change needs a call-back note of 8 or more characters) |
| `reject 2231 <reason>` | Refuses the payment |
| `rules` | Candidate and approved rules with backtest counts and expiry |
| `approve rule 1`, `reject rule 1 <reason>` | Decide a drafted rule |
| `status` | Business day clock and today's totals |
| `pause`, `resume`, `step` | Control the simulated clock |
| `help` | This list |

Confirmations echo the audit row, for example `approve_payment 2231 written to audit_event by controller (event 41, day 41)`. Refusals read `Refused: requester cannot approve`.

## Run it

```
cd agent && uv venv .venv && uv pip install -p .venv/bin/python -r requirements.txt
cd .. && agent/.venv/bin/python -m agent.cli "what needs me"     # terminal, no internet needed
agent/.venv/bin/python agent/agent.py                             # the uAgent; open the Inspector link, Connect, Mailbox
```

Environment (repo root `.env`): `STDB_URI`, `STDB_DB`, `STDB_CONTROLLER_TOKEN`, `AGENT_SEED`, `AGENT_PORT`, and optionally `ASI_ONE_API_KEY` for free-text routing through `asi1-mini`. Without the key, free text is taken as the answer to the hold you last discussed.

Simulated carrier. Sandbox money. Not for operational use.
