# Caliber Investigator

![tag:innovationlab](https://img.shields.io/badge/innovationlab-3D8BD3)
![tag:hackathon](https://img.shields.io/badge/hackathon-5F43F1)

The read-only investigator for Caliber (repo and ledger name: dispatch-ledger), an autonomous accounts-payable clerk for a simulated trucking carrier. It explains any hold and reports the day clock, reading the public tables and the stored finding of the one SpacetimeDB module that holds the carrier's whole state. It holds a `reader` identity: the database refuses it on every payment, answer and rule call, writes that refusal to the audit trail with the reader's role, and this agent relays the refusal word for word. The controller agent (`dispatch-ledger-controller`) forwards `why` and `status` to this agent and relays the answer prefixed `investigator:`. The agent that explains cannot pay.

| Name | Handle | Address | Role | Code |
| --- | --- | --- | --- | --- |
| Caliber Investigator | `@caliber-investigator` | `agent1qvwvlc0vz2amjh4q4yf0p2fglqrzw2rmfm6afrsq82e8lq5df7yyxnrxaqh` | Holds the `reader` identity: answers `why <id>` and `status`; every write it is asked for is refused by the ledger and recorded | [agent/investigator.py](https://github.com/anudeep-bonagiri/dispatch-ledger/blob/main/agent/investigator.py) |

## Commands

| Command | Example | Reply shape |
| --- | --- | --- |
| `why <id>` | `why 2231` | `investigator: 2231  location_mismatch  $412.00  day 41  status awaiting_controller`, then `Finding: ...`, up to two `Evidence: "..." (source, ref)` lines, `Recommendation: ...`, `Question: ...`, `source: live | replayed | scripted stand-in` |
| `status` | `status` | `investigator: Day 41 of 92 (2026-08-27), clock paused, tick 2 s. Today: 16 transactions, 12 auto-paid ($14,210.00), 3 held, 1 rejected.` |

Any payment, answer or rule command sent here (`approve 2231`, `approve rule 1`, `answer 2231 ...`, `reject 2231 ...`) is passed to the ledger's `try_*` procedure with the reader's own token and comes back as `investigator: refused by the ledger: reader may not do this (needs controller)`; the refusal is an `audit_event` row with `actor_role reader`. Anything else gets `investigator: I answer why <id> and status; ask the controller agent.`

Simulated carrier. Sandbox money. Not for operational use.
