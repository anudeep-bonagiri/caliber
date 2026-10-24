# Decisions

Numbered, dated, append-only. Each entry: the decision, why, the consequence. Pattern from Nudge (HackGT) `DECISIONS.md`.

## D-1 (2026-10-24 14:05 PDT) Task 16.7, the standing "any OFAC hit, reject" rule, is cut

- Decision: no rule is drafted from a CRS hit. A vendor check that finds a hit leaves the hold open and the controller rejects it by hand from ASI:One or the terminal, with the audit row.
- Why: rules only ever clear. The rule model drafts `location_mismatch` and `rate_variance` clears and the module refuses rules on `capacity_exceeded` and `vendor_bank_change` (G6). An auto-reject rule would contradict that guardrail and give a model-shaped path to a money decision.
- Consequence: Task 16 is complete without 16.7. The README "Vendor checks" section and `context/JUDGE_QA.md` say the controller rejects a hit vendor by hand; the standing-rule beat is not in the runbook or the video.

## D-2 (2026-10-24 14:30 PDT) A second uAgent, the read-only investigator, and no third

- Decision: add `dispatch-investigator`, a uAgent with a read-only `reader` identity that answers `why <id>` and `status` from the public views and the stored finding. The controller agent forwards those two intents to it and relays the reply prefixed "investigator:". No third agent.
- Why: the Fetch.ai judge said one orchestrator is acceptable but a visible agent split avoids being overlooked. The split the product already enforces is segregation of duties: the agent that explains cannot pay. Making that a second agent makes the module's refusal visible in ASI:One ("approve" sent to the investigator is refused by the reducer and lands in `audit_feed`).
- Consequence: Task 18 in `context/TASKS.md`; the Fetch row's Need column gains "a read-only investigator agent, so the agent that explains cannot pay"; one line in the module (`reader` in `grant_role`'s allowed roles) and a module test; two Agentverse profiles; the runbook's `why` beat shows the "investigator:" prefix.
