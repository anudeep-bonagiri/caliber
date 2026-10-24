# Decisions

Numbered, dated, append-only. Each entry: the decision, why, the consequence. Pattern from Nudge (HackGT) `DECISIONS.md`.

## D-1 (2026-10-24 14:05 PDT) Task 16.7, the standing "any OFAC hit, reject" rule, is cut

- Decision: no rule is drafted from a CRS hit. A vendor check that finds a hit leaves the hold open and the controller rejects it by hand from ASI:One or the terminal, with the audit row.
- Why: rules only ever clear. The rule model drafts `location_mismatch` and `rate_variance` clears and the module refuses rules on `capacity_exceeded` and `vendor_bank_change` (G6). An auto-reject rule would contradict that guardrail and give a model-shaped path to a money decision.
- Consequence: Task 16 is complete without 16.7. The README "Vendor checks" section and `context/JUDGE_QA.md` say the controller rejects a hit vendor by hand; the standing-rule beat is not in the runbook or the video.
