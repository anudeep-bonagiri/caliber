# Video script, about 4:00

One cut serves Cal Hacks, Fetch.ai (3 to 5 minutes) and the sponsor tracks. It opens on the moment in the order the council set: the investigator agent is refused when asked to pay, the controller's approval becomes a bank id, then the hold-to-rule story, then the proof. Staging, typed lines and pauses: docs/video/moment-script.md. Every number below is read off the screen or from docs/FACTS.md and bench/BASELINE.md (runs of 2026-10-25); nothing is from memory. Three dry jokes, no more.

[0:00] ASI:One, the @caliber-investigator chat, the console beside it on day 41.
Say: "This is Caliber, an accounts-payable clerk for a trucking company that cannot pay anything itself. This is its investigator agent on ASI:One. It can read the whole ledger. Watch it get asked to pay."
Type: approve 2231
Say: "Refused by the database, which wrote down who asked: role reader. The agent that explains cannot pay."

[0:20] ASI:One, the @caliber-controller chat, then the audit feed on the console.
Say: "The controller's seat can."
Type: approve INV-1075
Say: "A clean repair invoice over the auto-pay limit. One reducer checked the role and the split of duties, wrote the payment, and the transfer posted to Capital One's mock bank. The bank id is on the audit row in under a second."

[0:40] Terminal: scripts/clock.sh step, then the Elastic Workflow trigger (cd elastic && .venv/bin/python setup_workflow.py --run --no-wait). Console shows Day 42 of 92.
Say: "Business day 42. And I have started Elastic's stale-holds Workflow, which briefs every hold nobody has answered."

[0:55] Console, the day-41 queue in view.
Say: "We could have paid a frontier model to read every fuel receipt in Texas. We did the math, got a little nervous, and wrote three hundred lines of TypeScript instead. That's our kernel. It works in whole cents and never calls a model. It matches every charge against the truck's own telematics, the purchase order, the contract and the vendor's bank details. Clean lines pay themselves. Everything else becomes a hold."

[1:15] Console, click hold 2231.
Say: "Hold 2231. A fuel card assigned to truck 17 bought one hundred twenty gallons, four hundred twelve dollars, at Love's in Schulenburg, Texas. Truck 17's own telematics put it ninety-seven miles away, engine off, twelve minutes after the charge. Nothing paid. The investigator is Factory's Droid, locked down to read-only, with Elastic's tools over MCP as its only reach into data. It has roughly the permissions of an intern on their first day, which makes it the best-behaved employee we've ever had. It asked Elastic which trucks pinged at that pump: truck 22. It read the dispatcher's swap log. Its finding ends in one question: did Ramon Ortiz fuel truck 22 while truck 17 was in the shop?"

[1:45] ASI:One, the controller chat.
Type: why 2231
Say: "The controller agent relays the investigator's reply. The controller answers in one sentence."
Type: answer 2231 Yes. Ortiz drove unit 22 that week while unit 17 was in the shop, per the swap log.

[2:00] Console, the Rules panel, then ASI:One.
Say: "The answer is not a payment. The worker drafts a rule: that driver, for that week, one use. The database tests it against every charge the controller has already decided before it will store it."
Type: rules (read the candidate's id off the reply), then: approve rule <n>
Say: "The kernel re-runs the same code with the rule in place and clears the hold. It will never ask that question twice."

[2:20] ASI:One, the controller chat, at least 63 seconds after the Workflow trigger.
Type: status
Say: "And Elastic's brief is back: the status line ends with the escalation count the Workflow wrote."

[2:30] Console, the queue on day 44 (two more clock steps), INV-1077 selected.
Say: "One more kind of hold: a vendor changed its bank account two days before a nine thousand eight hundred dollar invoice. The vendor check screened the business, nothing on people, as a labelled fixture today."
Type: approve INV-1077 Called Gulf Coast Diesel on the number on file; new account confirmed by M. Reyes.
Say: "Without a call-back note the reducer refuses. With it, released and settled."

[2:50] docs/FACTS.md on screen, then the benchmark image.
Say: "So we made up a whole trucking company. Forty trucks, ninety-two days, a driver named Ortiz. Then we planted 52 mistakes and hid the answers from our own AI, which felt a little mean. It caught all 52. Zero false holds. All six decoys, the legitimate truck swaps that look like fraud, cleared after exactly one answer each."
Say: "We also gave Claude Sonnet the same inputs with no kernel at all, and it matched us. Which was humbling for about a minute. Then we checked the price: Claude costs money on every charge, and our kernel costs zero. So on cost, we win by infinity. We did the division. A smaller model reached 31 percent precision and held a hundred and one clean charges."

[3:25] Three stills, five seconds each: the architecture drawing, the Droid options block, the honesty chips.
Say: "One SpacetimeDB module holds the ledger: roles are a table, the clock is a scheduled reducer, every action and every refusal is an audit row. Droid runs read-only on a trigger, with a ninety-second abort and no pay in its schema. The company, the vendor check and the bank are simulated and labelled. The controls are not."

[3:45] Console, clock paused.
Say: "Caliber. The money does not move until the code has matched the line, and the agent can never approve what it proposed. Repo, agents and the facts file are in the description."

Fetch.ai cut: the 0:00, 0:20, 1:45, 2:00 and 2:20 beats must be the live ASI:One chat, recorded only with both mailboxes connected and ASI_ALLOWED_SENDERS holding the recording account (verified 07:41 with an allowlisted pause). If the mailbox drops mid-take, type the same lines through the terminal twin (docs/video/moment-script.md) and keep talking.

Verified before keeping: "caught all 52" is FACTS recall 1.0; "31 percent" is asi1-mini precision 0.31 in BASELINE; "Claude Sonnet matched us" is BASELINE Sonnet 1.00 / 1.00, and Opus is never claimed; "tests it against every charge the controller has already decided" is the module backtest against confirmed controller decisions (D-6); "for that week" matches the drafted rule's five-business-day window; "three hundred lines" is spacetimedb/src/kernel.ts (333 lines, 301 of code); "a driver named Ortiz" because Ramon Ortiz is driver 23 in the swap log, not the dispatcher; the Sonnet run cost $6.38 at list. Never say the kernel beat Claude on accuracy.

## Never say (from docs/RUNBOOK.md, section 7)

- Never say "rule 1". The rule id keeps counting across resets; read <n> from `rules`.
- `what needs me` lists every hold still waiting, oldest days included. Point at the 2231 line.
- The CLI `rules` reply prints a used rule as `expired`; the Rules panel shows it as `used`. Both mean the one-time rule cleared 2231.
- Inject only on day 44 or day 42. Those are the days truck 29 sits at San Antonio with the engine off in every ping.
- No dollar amount or distance from memory. The Investigation panel and the terminal print them; read them off the screen.
- Never say "live" for a replayed finding, a fixture vendor check, or an offline settlement id. The badge on the card is the word to use.
