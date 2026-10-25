# Decisions

Numbered, dated, append-only. Each entry: the decision, why, the consequence. Pattern from Nudge (HackGT) `DECISIONS.md`.

## D-1 (2026-10-24 14:05 PDT) Task 16.7, the standing "any OFAC hit, reject" rule, is cut

- Decision: no rule is drafted from a CRS hit. A vendor check that finds a hit leaves the hold open and the controller rejects it by hand from ASI:One or the terminal, with the audit row.
- Why: rules only ever clear. The rule model drafts `location_mismatch` and `rate_variance` clears and the module refuses rules on `capacity_exceeded` and `vendor_bank_change` (G6). An auto-reject rule would contradict that guardrail and give a model-shaped path to a money decision.
- Consequence: Task 16 is complete without 16.7. The README "Vendor checks" section and `docs/JUDGE_QA.md` say the controller rejects a hit vendor by hand; the standing-rule beat is not in the runbook or the video.

## D-2 (2026-10-24 14:30 PDT) A second uAgent, the read-only investigator, and no third

- Decision: add `dispatch-investigator`, a uAgent with a read-only `reader` identity that answers `why <id>` and `status` from the public views and the stored finding. The controller agent forwards those two intents to it and relays the reply prefixed "investigator:". No third agent.
- Why: the Fetch.ai judge said one orchestrator is acceptable but a visible agent split avoids being overlooked. The split the product already enforces is segregation of duties: the agent that explains cannot pay. Making that a second agent makes the module's refusal visible in ASI:One ("approve" sent to the investigator is refused by the reducer and lands in `audit_feed`).
- Consequence: Task 18 in `context/TASKS.md`; the Fetch row's Need column gains "a read-only investigator agent, so the agent that explains cannot pay"; one line in the module (`reader` in `grant_role`'s allowed roles) and a module test; two Agentverse profiles; the runbook's `why` beat shows the "investigator:" prefix.

## D-3 (2026-10-24 15:25 PDT) A hand-authored CRS hit fixture so the hit-to-rejection beat runs offline

- Decision: add a hand-authored vendor-check fixture with an OFAC or public-records hit for one of the three planted bank-change vendors, so one bank-change hold is rejected by the controller and the other two are approved with a call-back note, offline. Three labels that cannot be missed: every evidence row carries source `fixture:hand-authored (CRS sandbox pending)`, the UI chip reads FIXTURE (not REPLAYED), and `docs/not-built.md` and `docs/CLAIMS_AUDIT.md` say the CRS hit has not been produced by the sandbox yet. The moment the CRS invite lands, the real call is recorded, the fixture replaced, and the label flips to REPLAYED (recorded live).
- Why: the target line "one planted vendor has a hit and is rejected, one is clean and is approved with a call-back note" was only half met and CRS has not delivered the sandbox invite. The control (a hit vendor cannot be paid without a person rejecting it) is the product; the data source is what is pending, and the labels say so.
- Consequence: CRS stays selected in the Devpost draft. At the 9 PM freeze, if there is still no live call, Anudeep decides whether to deselect, and the runbook's vendor beat says "sandbox pending" out loud rather than implying live. One answer-key row changes its expected outcome to reject; the generator, not the key file, carries the change so seed 42 stays reproducible.

## D-4 (2026-10-24 15:25 PDT) Every commit carries the Co-Authored-By line

- Decision: every commit from a builder or from the director ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Anudeep's general no-trailer rule for his repos does not apply here.
- Why: Cal Hacks 13.0 is cohosted by Anthropic and has a Factory agent track; AI-assisted commits are expected, and a git log that hides them would contradict the honesty files.
- Consequence: builder briefs keep the trailer line; the three builder-W commits made without it (85aba06, de3d124, 548864d) stay as they are, since rewriting pushed history would be worse than the omission, and this entry records it.
- Addendum (2026-10-24 20:25 PDT): the trailer names the model that made the commit. Sessions started after Anudeep switched the default model at about 20:00 run Claude Opus 5.5 and write `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; earlier commits name Claude Fable 5.1.

## D-5 (2026-10-24 15:45 PDT) Tasks 21 to 25: close the two half-met winner traits

- Decision: add Task 21 (inbox file connector), 22 (model-only baseline against Sonnet and asi1-mini), 23 (harness vocabulary from the Hyphenate deck), 24 (the opening moment recorded tonight) and 25 (fifteen-second component cards). 21, 22 and 23 run in parallel in different folders; 24 after 21; 25 after 22. The 9 PM freeze stands for integrations; 24 and 25 are not integrations and may finish after it.
- Why: the HackMIT finance winners shared seven traits. Five are built (code decides money, rule memory, honesty artifacts, offline two-terminal demo, three-minute README); "proof plus model comparison" is half (answer key, no model baseline) and "the moment in the first 30 seconds" is not recorded. 21 makes the demo start with data arriving; 22 produces the comparison honestly; 23 says it in the judges' words; 24 and 25 make it sayable.
- Consequence: labels "file connector; API connectors not built" and the baseline caveat (same generator, identical inputs, no fine-tuning) go into README and not-built; the baseline numbers live in FACTS so Devpost and the site read one source; the README line reports whatever the baseline table says, including a model tying or beating the kernel on a code.

## D-6 (2026-10-24 20:25 PDT) The rule backtest reads ledger rows only; planted counts appear only under a BENCHMARK chip

- Decision: the rule backtest is production logic and reads only `match_result` and `hold` rows; a confirmed exception is a hold the controller rejected. The answer key is read only by `scripts/facts.py` and `bench/`. A planted count appears on a rule card only under a BENCHMARK chip, from `FACTS.rulesPlanted`, computed by facts.py.
- Why: the council read "planted true exceptions" on the rule card (G7 wording) as the agent scoring itself against the key. It never did (`worker/src/rules.ts` and the module's `backtest()` take ledger rows only), but the card and the Devpost sentence did not separate what a production clerk would see from what the benchmark measures.
- Consequence: G7's "how many of those are planted true exceptions" reads "how many were confirmed exceptions (controller-rejected holds)"; the planted count is benchmark-labelled; `bench/carrierbench/key_readers.sh` and the `backtest provenance` test are the checks; the Devpost sentence reads "a hidden answer key that no agent or worker code reads; only scripts/facts.py and the bench score against it, and the rule backtest counts controller-resolved holds, never the key".

## D-7 (2026-10-24 20:25 PDT) A customer view at "/", the console at "/console"

- Decision: Task 29 adds a customer view for the controller at "/" and moves the current dashboard to "/console", unchanged except a BENCHMARK chip on "Planted vs raised", brass only on PAUSED when no hold is open, and invisible element ids on audit rows so the customer feed can link to them. The customer view reads the same public tables with the anonymous identity, adds no reducer, holds no token, and moves no money; every ask links to the controller agent on ASI:One with the exact command to copy.
- Why: the console answers a judge's "show me the mechanism"; it does not answer a controller's "what do you need from me". The winners' demos opened on the user's screen, not the machine room.
- Consequence: the receipt thumbnail on a hold card is drawn from the receipt quote already stored in the investigation, never by serving evidence files to the browser (G12: the dashboard serves no raw documents). The carrier's display name is one constant shown beside the SIMULATED CARRIER chip. Task 29 is built in a git worktree on its own dev port so the staged demo on 5173 never serves half-built code, and merges on the director's go; the table demo opens on "/" and switches to "/console".

## D-8 (2026-10-24 21:20 PDT) The table serves a production build, not the Vite dev server

- Decision: `scripts/demo_up.sh` builds the web app and serves it with `vite preview` on 5173 instead of running the dev server.
- Why: measured, not guessed. At the 0.5 s tick the dev server's pages trailed the ledger by up to 33 s and drew 11 of 41 days, on master and on the Task 29 branch alike, so it was not a regression; the production build of the same code trailed by 0.1 s and drew every day (builder-29's probe, 21:15).
- Consequence: no hot reload on 5173 during the demo, so any web change needs a fresh `demo_up.sh` (or a rebuild) to show; the build adds a few seconds to `demo_up.sh`; the console code is unchanged.

## D-9 (2026-10-25 05:45 PDT) Opus 5.5 joins the model-only baseline after the freeze; no new sponsor integration

- Decision: run Claude Opus 5.5 through the Task 22 harness under the same $15 cap and API defaults; run a GPT model only if an OpenAI key is in .env when the builder starts; publish only measured lines (no model call per paid line; each model's cost at list; tie or miss per model) and never a dollar comparison against Droid, whose credits our files do not price.
- Why: Anudeep asked whether the comparison holds against stronger models. It costs under $15 and one builder, touches no sponsor path, and either answer is publishable: a tie says the kernel's edge is cost and auditability, a miss says it is accuracy too.
- Consequence: README, Devpost, cards, JUDGE_QA and the paper table gain one column; the Devpost paragraph changes, so Anudeep re-pastes that paragraph only; effort defaults differ by model (Sonnet 5.5 high, Opus 5.5 medium) and the footnote says so.
