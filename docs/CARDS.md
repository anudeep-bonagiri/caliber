# Fifteen-second cards

Anudeep and Shrithik rehearse from this page at 3 AM. One rule: no number that is not on this page. Every number here is copied from docs/FACTS.md as written by the run of 2026-10-24 (FACTS line: "Written by scripts/facts.py at 2026-10-24T22:25:41+00:00. Nothing in it is typed by hand."). Where a card has no FACTS number it says so and names the thing the judge can see instead. The line number after each function is its grep hit. "Not built." is a complete answer; say it without a wince.

## The kernel

Need: Code decides money: a three-way match in integer cents, in plain TypeScript that never imports a model client, a database or a connector.
Where: `spacetimedb/src/kernel.ts`, `evaluateCardTxn` (line 148).
Number: 7886 payments auto-paid by the kernel or a rule (FACTS line: "Auto-paid by the kernel or a rule: 7886 payments, $1,083,630.52.").
They will ask: Is the model deciding what gets paid?
Answer: No. The kernel is plain code in integer cents: a fuel line against the truck's own telematics ping and tank size, a toll against the plate's prior tolls, an invoice against the PO, the contract rate valid that day, receiving and the vendor's bank-change date. Clean lines pay themselves under the auto-pay limits; everything else holds. It never calls a model, and a payment row is the end of the line.

## The reducers and segregation of duties

Need: A ledger where the agent physically cannot move money and every action is attributable.
Where: `spacetimedb/src/index.ts`, `checkApprovePayment` (line 784).
Number: 1 refusal in the audit trail, by the agent role (FACTS line: "Refusals recorded in the audit trail: 1 ({'agent': 1}).").
They will ask: Who approves, and what stops the agent from approving?
Answer: The controller does, from ASI:One or the terminal. Every reducer checks the caller's identity against the role table first; approve_payment refuses the agent identity, refuses whoever raised the hold, and on a bank change demands a call-back note. The refusal is an audit row with the role on it, through the try_ procedures, and audit_event has no update or delete reducer. Production identity with OIDC and key rotation: Not built.

## Rule memory

Need: Ask once: a controller answer becomes a scoped, expiring rule that the database backtests before it is stored and the kernel applies next time.
Where: `spacetimedb/src/index.ts`, `backtest` (line 644).
Number: 6 of 6 decoys cleared through an approved rule after exactly one controller answer (FACTS line: "Decoys cleared through an approved rule: 6 of 6 (6 with exactly one controller answer).").
They will ask: Can it learn, and could a rule ever hide a real exception?
Answer: It learns only from your answer. One answer becomes one rule with a scope (driver, truck, card or vendor) and an expiry; the module backtests it inside create_rule against every past match and refuses any rule that would clear a confirmed exception, and no planted exception was cleared by a rule in the measured run. Rules only ever clear, never reject, and the module refuses rules on capacity and bank-change holds. The optional model draft is off in the offline demo; the deterministic draft is what you see.

## The Droid investigator

Need: Reading evidence a kernel cannot: receipts, contracts, the swap log, and deciding what to ask.
Where: `worker/src/droid.ts`, `sessionOptions` (line 101).
Number: 25.6 s per investigation on average in the recorded live run (FACTS line: "Droid cost, from the recorded live run of 2026-10-24, 52 investigations: per task on average 1,033 input tokens, 1,354 output tokens and 70,386 cache tokens (cacheCreationTokens plus cacheReadTokens), 25.6 s; totals 53,739 input, 70,433 output, 3,660,097 cache tokens, 2,016,204 Factory credits.").
They will ask: Was that live, and what can Droid touch?
Answer: At the table, no: the worker runs in replay with every key empty, and each card says it replays the recording made 2026-10-24 by the live Droid run. Live, Droid gets the evidence folder and the Elastic tools over MCP, with autonomy Off, Execute, Edit, Create and ApplyPatch disabled by id, a permission handler that cancels anything write-like, and a timed abort; its output schema has no pay, and a zod gate checks every quote against its source before the write. A hard OS sandbox around its Read tool: Not built.

## The Elastic tools and the Workflow

Need: Finding the one telematics row or contract line that answers "was the truck there" and "what is the rate"; escalating holds nobody has answered.
Where: `elastic/setup_agent.py`, `upsert` (line 84).
Number: No number. The observable is the replayed `elastic___find_trips_near` tool call on hold 2231's card, which named a different truck at the pump in the recorded run.
They will ask: Was Elastic queried at this table just now?
Answer: No. The table exports no Elastic keys, so the card replays the recorded find_trips_near call. Live, the hand-written ES|QL tools in Agent Builder (exact lookups plus semantic ones over the JINA semantic_text fields) are created over the API and reached by Droid at the MCP endpoint under a least-privilege key, and one Workflow, caliber-stale-holds in `elastic/workflows/stale_holds.yaml`, briefs stale holds into an escalations index that the controller agent's status reads, about a minute after a manual trigger because the agent calls the tools before writing. Elastic is not the system of record. An escalation that lands inside the beat the plan called for: Not built.

## The CRS vendor check

Need: When a vendor changes bank details or appears for the first time, internal data cannot tell you if the vendor is who they say.
Where: `worker/src/vendor_check.ts`, `assessVendor` (line 160).
Number: 3 bank-change holds, 1 hit rejected by the controller, 2 clean approved with a call-back note, all from fixtures (FACTS line: "Vendor checks: 3 bank-change holds; 1 with a hit rejected by the controller, 2 clean approved with a call-back note; check source {'fixture': 3} (fixture means hand-authored, CRS sandbox pending); outcomes match the key: True.").
They will ask: Is this a live sandbox call, and is anyone's credit being pulled?
Answer: Nothing on people, ever: business credit, public records and an OFAC screen on the vendor entity only, as evidence rows on the hold, and the result is rule-based, not a model. Today every check is a hand-authored fixture labelled FIXTURE on the card and in every evidence row; the hit vendor stays held and the controller rejects it by hand, with the audit row, because rules only ever clear. The live sandbox call, pending the collection from CRS: Not built.

## Nessie settlement

Need: An approved payment has to land somewhere, and the audit row needs the bank's transaction id.
Where: `worker/src/settle.ts`, `startSettlement` (line 282).
Number: 7894 payments carry a labelled offline id and 0 a live transfer id in the measured run (FACTS line: "Settlement: 0 payments carry a live Nessie transfer id, 7894 a labelled offline id, 0 unsettled.").
They will ask: Did real money just move?
Answer: No. Nessie is Capital One's mock bank, and in the measured run every payment carries an id labelled offline. With a key, the worker makes one transfer per payment and writes the returned id through record_settlement, which can settle a payment but never create one; one live transfer was verified on 2026-10-24. The mock accepts whole dollars only, so the exact cents ride in the transfer description. Exact-cent transfers: Not built.

## The two agents

Need: The controller must be able to answer and approve from wherever they are, in plain language; a read-only investigator agent, so the agent that explains cannot pay.
Where: `agent/handlers.py`, `handle` (line 48).
Number: 8 payments released by the controller (FACTS line: "Released by the controller: 8 payments, $32,097.00.").
They will ask: Can the agent approve on its own, and where is the model?
Answer: No. The controller agent acts only on your typed line, through try_ procedures the database checks; the ASI:One mini model only classifies free text after the regex fast paths and never decides money. The investigator agent in `agent/investigator.py` holds a read-only reader identity and answers why and status; send it approve and the reducer refuses it, and that refusal is an audit row. The terminal twin runs the same handle with no internet. Say only what the Agentverse profile shows that day. Email or Slack as a controller inbox: Not built.

## The answer key

Need: Proof, not a claim: precision and recall computed against a hidden answer key by the one program allowed to read it.
Where: `seed/generate.py`, `generate` (line 47).
Number: precision 1.0 and recall 1.0 overall (FACTS line: "Overall precision 1.0, recall 1.0.").
They will ask: Is the company real, and how do you know those figures?
Answer: No. `seed/generate.py` makes the carrier with seed 42 and writes the key with the planted errors and the decoys; `scripts/facts.py` reads the public tables anonymously and the key, and writes docs/FACTS.json, and nothing in the module, worker, agents or web can read the key. The planted rows come from the same generator as the clean rows, so this measures whether the kernel finds what we planted, not how it behaves on a real carrier's statements.

## The model-only baseline

Need: Proof plus comparison: what a model alone does on the very rows the kernel reads.
Where: `bench/score.py`, `score_model` (line 47).
Number: precision 1.0 and recall 1.0 is the kernel's line, and the model table is not in FACTS.md yet (FACTS line: "Overall precision 1.0, recall 1.0."); the model figures stay in `bench/BASELINE.md` until scripts/facts.py runs again against a live module.
They will ask: Why not just ask the model?
Answer: On the sample, Claude Sonnet tied the kernel on every code, and the ASI:One mini model did not, holding clean rows mostly as duplicate tolls. Same generator, identical inputs, no fine-tuning, and the kernel's precision was measured on the whole run while the models saw a sample. The kernel is plain code with no paid call per row, and its decisions are audit rows; a model's are not. Read the table from `bench/BASELINE.md`, never from memory.

## The inbox connector

Need: The demo starts with data arriving the way a carrier's does: a file dropped in a folder, matched by the same path the clock uses.
Where: `scripts/ingest_watch.py`, `process` (line 206).
Number: No number. The observable is hold 2231 appearing on the dashboard about a second after the day 41 fuel-card CSV is copied into inbox/, under the chip "file connector; API connectors not built".
They will ask: Where does the data come from?
Answer: A file connector. CSV exports dropped in inbox/ are parsed by the watcher with exact arithmetic (dollars to integer cents, never a float) and handed to the ingest_rows reducer, which matches them exactly as advance_day does, so holds, auto-pay limits and duplicate rejects apply unchanged; re-dropping a file is safe. Every row is still from `seed/generate.py` with the published key. WEX, toll-authority, telematics or accounting API connectors: Not built.
