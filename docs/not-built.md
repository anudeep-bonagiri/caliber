# Not built

"Not built" is a complete answer. Say it without a wince.

- Real connectors. There is no fuel-card, toll-authority, telematics or accounting integration. Every row comes from `seed/generate.py` with seed 42 and a published answer key.
- Payment execution. A `payment` row is the end of the line. Nothing moves money to a bank.
- OCR or document extraction. Receipts and invoices are rendered as text from the same generator that made the rows; the kernel reads rows, not documents. The optional fine-tuning benchmark (Task 14 in the plan) was not attempted.
- Multi-entity, multi-currency, tax. One carrier, US dollars, cents as integers.
- Production identity. Roles are a table of identities granted by the publisher. No OIDC provider, no key rotation, no per-user dashboard login.
- Rule drafting by a model is optional and off in the offline demo; the deterministic draft (driver scope, five-day window) is what the judges see unless an Anthropic key is present.
- Live Droid and live Elastic runs are gated on keys the demo laptop does not export. Replay mode serves recorded or scripted findings and labels them as such on every card.
- A controller inbox beyond ASI:One and the terminal twin (no email, no Slack).
- Horizontal scale. One module, one worker (concurrency 2), one local server.
