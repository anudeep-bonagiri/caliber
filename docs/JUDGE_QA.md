# Judge Q&A

Answers are short. Numbers come from `docs/FACTS.json`, never from memory.

## Why this sponsor, in one sentence

The spoken answer is the same at every table. Copied from the Need column of the plan.

- SpacetimeDB: A ledger where the agent physically cannot move money and every action is attributable.
- Factory Droid: Reading evidence a kernel cannot: receipts, contracts, the swap log, and deciding what to ask.
- Elastic: Finding the one telematics row or contract line that answers "was the truck there" and "what is the rate".
- Fetch.ai: The controller must be able to answer and approve from wherever they are, in plain language; a read-only investigator agent, so the agent that explains cannot pay.
- CRS: When a vendor changes bank details or appears for the first time, internal data cannot tell you if the vendor is who they say.
- Capital One Nessie: An approved payment has to land somewhere, and the audit row needs the bank's transaction id.
- Anthropic: Rule drafting and the two-sentence explanation need a model with a strict JSON schema.
- Microsoft: None technically. Their brief is the product: production-minded finance agent, judged on customer understanding, measurable usefulness, path to production, responsible design, end-to-end.
- Hyphenate: The whole thing.

## Built for the Real World (Microsoft's five criteria)

- Customer understanding: Cruze sells to fleets, and 91.5% of US carriers run 10 trucks or fewer (American Trucking Associations industry figure, not from our facts file). In those back offices the AP clerk is the person who matches fuel-card lines against trucks by hand. This is that clerk's job, in code.
- Measurable usefulness: precision 1.0 and recall 1.0 against a hidden answer key of 58 rows (52 planted exceptions and 6 decoys) over 7944 transactions. 7886 payments, $1,083,630.52, auto-paid by the kernel or a rule. 8 payments, $32,097.00, released by the controller. 6 of 6 decoys cleared after exactly one controller answer. 0 planted exceptions cleared by a rule. Droid cost from the recorded live run of 2026-10-24 (52 investigations): per investigation 1,033 input tokens, 1,354 output tokens and 70,386 cache tokens (cacheCreationTokens plus cacheReadTokens), 25.6 s.
- Path to production: segregation of duties is enforced in the reducers, so the agent cannot approve and the requester of a release cannot approve it. Rules are scoped and expire. The answer key is hidden from every agent. Replay mode runs the whole month with no network.
- Responsible design: the agent never reads the answer key. Every tool call is written to the ledger with its investigation. The controller approves every rule and every release. Nothing on people is ever sent to CRS; the check is on the vendor business only.
- End-to-end: clock, hold, investigate, vendor check, ask, rule, pay, settle. Vendor check and settle were built this afternoon; sandbox and mock bank.

## The sponsor judge

**Why not Convex / Moss / Coinbase / Visa?** Each one would be a second tool for a need we already fill. Convex is a second database and overlaps SpacetimeDB. Moss is a second retrieval layer and overlaps Elastic. Coinbase x402 is a second payment rail and overlaps Nessie, and a carrier pays by ACH. Visa is consumer shopping with no API.

**Is CRS pulling anyone's credit?** No. Business credit, public records and OFAC on the vendor entity only. No consumer credit, no driver or person data is ever sent.

**What happens on a hit?** The hold stays open and the controller rejects the vendor by hand from ASI:One or the terminal, with the audit row. There is no auto-reject rule: rules only ever clear, and the module refuses rules on bank-change holds (context/DECISIONS.md, D-1).

**Elastic Workflows?** One Workflow, `caliber-stale-holds` (`elastic/workflows/stale_holds.yaml`): every hour, and on demand, it finds holds open more than two business days in the `holds` index, has the Agent Builder agent write a one-paragraph brief per hold with the ES|QL tools, and indexes each brief into `escalations`; the controller agent's `status` reply ends with "N escalations, newest: ...". It ran on the Serverless project on 2026-10-24 (two executions, six briefs); a new brief shows in `status` about a minute after the trigger, not 30 seconds, because the agent calls the tools before writing. The scoped MCP key waits on a Kibana UI step; until then Droid uses the project key.

**Why two agents instead of one read-only command?** Because the split is enforced by the database role, not by agent code: the investigator holds a `reader` identity, and `approve 2231` sent to it in ASI:One comes back "refused by the ledger: reader may not do this (needs controller)" with an audit row whose actor_role is reader. The Fetch.ai judge asked for a visible agent split, and this one is a real segregation of duties: the agent that explains cannot pay. The decision is D-2 in `context/DECISIONS.md`.

**Can anyone who finds the agent on ASI:One approve a payment?** No. The controller seat runs a write command only when the ASI:One sender is listed in `ASI_ALLOWED_SENDERS`; anyone else gets "not authorised for this seat" before any ledger call, logged with the full sender address in the agent log (not in `audit_event`), while reads stay open. Behind the seat the database still checks the controller role on every write: `agent/handlers.py`.

## The finance person

**Is the company real?** No. It is generated by us, with a published answer key. Forty trucks, six Texas terminals, five vendors, 92 business days. The key lists every planted error and the six legitimate truck swaps that look like fraud until you read the swap log.

**Where does the data come from?** A file connector: CSV exports dropped in a folder, parsed by a 60-line watcher and handed to one reducer that matches them exactly as the clock does. API connectors are not built; the label on the dashboard says so.

**What is the clerk actually doing?** A three-way match in integer cents, in plain code: fuel card line against the truck's own telematics ping and tank size, toll against the plate's prior tolls, invoice against the PO, the contract rate valid that day, receiving, and the vendor's bank-change date. Clean lines pay themselves under the auto-pay limits. Everything else holds.

**Who approves?** You do, as the controller, from ASI:One or the terminal. The agent identity is refused by the database when it tries, and the refusal is a row in the audit trail with its role on it.

**The card issuer drafts fuel and tolls from your account. What does approving a hold mean there?** Fuel-card and toll statements are auto-drafted by the issuer, so a hold on one of those lines is a dispute inside the issuer's window plus a credit memo, not an approval. Repair invoices are paid per invoice and go through `approve_payment`, where the controller's approval is the real gate. The dispute path is not built: `docs/not-built.md`.

**Can it learn?** Only through you. One answer becomes one rule with a scope (driver, truck, card or vendor) and an expiry. The database backtests the rule against every past match before it will even store it, and refuses it if it would have cleared anything you had confirmed as a real exception.

**What happens when the model is down?** The same holds, raised by the same code. The investigator's card says "scripted stand-in, not a model" or "replayed from a recording made 2026-10-24 by droid live run" instead of "live". A rate limit or server error leaves the hold open as "deferred", never a silent replay. No money moves differently.

**Would you hire it?** For the first seat, matching and coding, yes, under these limits. For the controller's seat, no, and it is built so it cannot take it.

## The engineer

**Why SpacetimeDB?** The permission model is the database. Roles are a table, every reducer checks the caller's identity first, the business-day clock is a scheduled reducer inside the same module, and the dashboard, the worker and the chat agent are all just identities writing to one world. No API layer to bypass.

**What does Droid touch?** A read-only evidence folder (receipts, contracts, invoices, swap log, telematics CSVs) and four Agent Builder tools over MCP, two ES|QL (find_trips_near, contract_rate_for_vendor) and two semantic on JINA (find_contract_clause, find_receipt_text); the recordings call three of them. Autonomy is Off, Execute, Edit, Create and ApplyPatch are disabled by id (plus any edit or execute tool `listTools()` reports as allowed), the permission handler cancels anything write-like and lets MCP and read confirmations proceed once, and there is a 90 second abort, but Read is not confined to the folder: recording 770003 read `~/AGENTS.md` from the laptop's home folder (text redacted from the committed recording in e2243e1; nine other probes found nothing). The options block is pasted in the README.

**How is the output validated?** zod schema with a closed recommendation set (clear, hold, hold_and_ask; there is no pay), string caps, and evidence references that must resolve to a fixture file or a tool name.

**How do you know precision and recall?** `scripts/facts.py` reads the public tables anonymously and the answer key, and writes `docs/FACTS.json`. It is the only program allowed to read the key.

**Where does "planted" come from at runtime?** It does not: the kernel codes each row from its own evidence (pings, tank size, contract rate, PO, receiving, bank-change date) and never sees a label. "Planted" exists only in the answer key, which no module, worker or agent code reads; the rule backtest counts the controller's own decisions. The key is read by the scoring side alone, `scripts/facts.py` and `bench/score.py`.

**Claude Sonnet tied the kernel. What does the kernel buy?** The same result with zero model calls, in integer cents, reproducible byte for byte, so code decides and the model only explains what the kernel cannot read. The comparison is `bench/BASELINE.md`, and every threshold the kernel uses is in `spacetimedb/src/thresholds.ts`.

**What about the two tolls at the same instant?** Tie-break on id, so exactly one is the duplicate. Reviewed and tested.

**What was not built?** See `docs/not-built.md`.

## The investor

**Who buys this?** Carriers with 20 to 200 trucks whose AP clerk is also the dispatcher's backup. The pain is fuel-card misuse and duplicate billing that nobody has time to chase.

**Why you?** Anudeep runs a fleet software company with a signed pilot; this is the back office of the same customers.

**What is the moat?** The rule memory. Every controller answer is a scoped, backtested, expiring policy that the kernel enforces. That history is the asset.

**What is fake today?** All of the data, the bank, and the vendors. None of the controls.
