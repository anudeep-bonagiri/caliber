# Not built

"Not built" is a complete answer. Say it without a wince.

- Real connectors. One file connector exists (`scripts/ingest_watch.py`, three CSV layouts in `docs/CONNECTORS.md`); there is no WEX, toll-authority, telematics or accounting API integration. Every row comes from `seed/generate.py` with seed 42 and a published answer key, whether it is loaded as a fixture or dropped as a file.
- Payment execution to a real bank. A `payment` row settles into the Capital One Nessie mock bank (one transfer, its id on the row) or carries a labelled `offline-<txnRef>` id when no bank is called; no real money moves.
- OCR or document extraction. Receipts and invoices are rendered as text from the same generator that made the rows; the kernel reads rows, not documents. The optional fine-tuning benchmark (Task 14 in the plan) was not attempted.
- Multi-entity, multi-currency, tax. One carrier, US dollars, cents as integers.
- Production identity. Roles are a table of identities granted by the publisher. No OIDC provider, no key rotation, no per-user dashboard login.
- Rule drafting by a model is optional and off in the offline demo; the deterministic draft (driver scope, five-day window) is what the judges see unless an Anthropic key is present.
- Live Droid and live Elastic runs are gated on keys the demo laptop does not export. Replay mode serves recorded or scripted findings and labels them as such on every card.
- A controller inbox beyond ASI:One and the terminal twin (no email, no Slack).
- Horizontal scale. One module, one worker (concurrency 2), one local server.
- A hard sandbox around Droid. Session options disable write and execute tools and the permission handler cancels anything write-like, but Droid's `Read` can address any path; in the live run it probed for instruction files above the evidence folder (none existed). A read-only mount or OS sandbox is the real boundary and is not built.
- CRS live calls until the sandbox collection arrives: endpoint paths, request bodies and response fields are placeholders; the vendor check replays hand-authored fixtures labelled as such. The CRS hit has not been produced by the sandbox yet; the hit vendor's check is a hand-authored fixture labelled FIXTURE on the card and in every evidence row.
- Nessie in the measured run. The 92-day run in `docs/FACTS.md` settled every payment with a labelled offline id (0 live transfer ids); live transfers happen only when the worker runs with the Nessie key.
- The issuer dispute path. Fuel-card and toll statements are auto-drafted by the issuer, so a hold on those lines should become a dispute inside the issuer's dispute window, a credit memo when it is upheld, and a statement reconciliation; none of that is built. Today a hold is resolved by approve or reject in the ledger, which is the right gate only for per-invoice repair bills.
