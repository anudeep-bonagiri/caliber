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

## D-3 (2026-10-24 15:25 PDT) A hand-authored CRS hit fixture so the hit-to-rejection beat runs offline

- Decision: add a hand-authored vendor-check fixture with an OFAC or public-records hit for one of the three planted bank-change vendors, so one bank-change hold is rejected by the controller and the other two are approved with a call-back note, offline. Three labels that cannot be missed: every evidence row carries source `fixture:hand-authored (CRS sandbox pending)`, the UI chip reads FIXTURE (not REPLAYED), and `docs/not-built.md` and `context/CLAIMS_AUDIT.md` say the CRS hit has not been produced by the sandbox yet. The moment the CRS invite lands, the real call is recorded, the fixture replaced, and the label flips to REPLAYED (recorded live).
- Why: the target line "one planted vendor has a hit and is rejected, one is clean and is approved with a call-back note" was only half met and CRS has not delivered the sandbox invite. The control (a hit vendor cannot be paid without a person rejecting it) is the product; the data source is what is pending, and the labels say so.
- Consequence: CRS stays selected in the Devpost draft. At the 9 PM freeze, if there is still no live call, Anudeep decides whether to deselect, and the runbook's vendor beat says "sandbox pending" out loud rather than implying live. One answer-key row changes its expected outcome to reject; the generator, not the key file, carries the change so seed 42 stays reproducible.

## D-4 (2026-10-24 15:25 PDT) Every commit carries the Co-Authored-By line

- Decision: every commit from a builder or from the director ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Anudeep's general no-trailer rule for his repos does not apply here.
- Why: Cal Hacks 13.0 is cohosted by Anthropic and has a Factory agent track; AI-assisted commits are expected, and a git log that hides them would contradict the honesty files.
- Consequence: builder briefs keep the trailer line; the three builder-W commits made without it (85aba06, de3d124, 548864d) stay as they are, since rewriting pushed history would be worse than the omission, and this entry records it.
