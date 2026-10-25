
## gallery-00.png

The controller's screen in Caliber (`/`, Task 29) for the simulated carrier Mesquite Freight, on business day 41, Wed Aug 26. This is the first gallery image and the Devpost thumbnail.

- **Card.** Fuel charge 2231 is held. The sentence is built from the ledger's own match row (station, gallons, GPS distance 97.2 miles, engine off), not from model prose. The question in brass is the stored question, verbatim: was Ramon Ortiz fueling truck 22 while truck 17 was in the shop?
- **Map and receipt.** The map is two points and the ledger's distance, with no tile server. The receipt is the quote stored with the investigation. The card says "replay of a recorded investigation" because this run replayed a recorded Droid investigation.
- **Learned.** The rule from the controller's answer on decoy 2044 (Jerome Watkins, truck 14), approved through the controller agent's CLI and used once.
- **Tiles and Activity.** Read from the same public tables as the console, with the anonymous identity.

Captured 2026-10-24 at 21:17 PDT by Playwright (Chromium, 1800 by 1200, device scale 1) against a staged ledger: seeded, clock run to day 41 at a 0.5 s tick, worker in replay. The page holds no token and has no button that moves money.

## gallery-08.png

Elastic Serverless project my-elasticsearch-project-b5e003: Agent Builder tools (4), Workflow caliber-stale-holds executions, one escalations document.

- **Left, Dev Tools.** `GET escalations/_search`, newest document: hold 1421 (`location_mismatch`, open 33 business days) with the brief the Workflow's `ai.agent` step wrote. The brief quotes the receipt it found through `find_receipt_text`.
- **Right top, Agent Builder tools library.** Filtered to `tags:(dispatch)`, it shows the four Caliber ES|QL tools: `contract_rate_for_vendor`, `find_contract_clause`, `find_receipt_text`, `find_trips_near`.
- **Right bottom, Workflow run history.** Seven runs of `caliber-stale-holds` as of 21:01 PDT: six succeeded and one failed at 20:03 with a 429 from the Elastic trial model quota. Durations are whole-workflow run times.
- **The 63 s demo beat is not read off this image.** It is the time from a manual trigger to the new brief appearing in the controller agent's `status` reply, measured separately on 2026-10-24.
- **The hourly schedule shown here is gone.** The scheduled trigger was removed at 21:02 PDT, so the workflow (now id `caliber-stale-holds-5`) is manual only, and that copy's run history no longer exists in Kibana.

Captured 2026-10-24 between 21:00 and 21:06 PDT in Anudeep's Chrome session, with no key or URL in any panel. Composed with Pillow from the system Python (`/opt/homebrew/bin/python3`, Pillow 12.3.0), because no repo venv has Pillow.
