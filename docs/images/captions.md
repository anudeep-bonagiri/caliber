
## gallery-08.png

Elastic Serverless project my-elasticsearch-project-b5e003: Agent Builder tools (4), Workflow caliber-stale-holds executions, one escalations document.

- **Left, Dev Tools.** `GET escalations/_search`, newest document: hold 1421 (`location_mismatch`, open 33 business days) with the brief the Workflow's `ai.agent` step wrote. The brief quotes the receipt it found through `find_receipt_text`.
- **Right top, Agent Builder tools library.** Filtered to `tags:(dispatch)`, it shows the four Caliber ES|QL tools: `contract_rate_for_vendor`, `find_contract_clause`, `find_receipt_text`, `find_trips_near`.
- **Right bottom, Workflow run history.** Seven runs of `caliber-stale-holds` as of 21:01 PDT: six succeeded and one failed at 20:03 with a 429 from the Elastic trial model quota. Durations are whole-workflow run times.
- **The 63 s demo beat is not read off this image.** It is the time from a manual trigger to the new brief appearing in the controller agent's `status` reply, measured separately on 2026-10-24.
- **The hourly schedule shown here is gone.** The scheduled trigger was removed at 21:02 PDT, so the workflow (now id `caliber-stale-holds-5`) is manual only, and that copy's run history no longer exists in Kibana.

Captured 2026-10-24 between 21:00 and 21:06 PDT in Anudeep's Chrome session, with no key or URL in any panel. Composed with Pillow from the system Python (`/opt/homebrew/bin/python3`, Pillow 12.3.0), because no repo venv has Pillow.
