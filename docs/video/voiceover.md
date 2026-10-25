# Voiceover for docs/video/screen_take.mov (4:10), two voices

Start each line at its time with the video playing. Pennies on the dollar is honest: Droid's credits for the 52 holds are about $5.44 against Sonnet's roughly $91 a quarter at list for every line.

0:00, Anudeep (title card): "This is Caliber. An AP clerk for trucking companies that physically can't pay a bill. On purpose."

0:05, Sreesanth (investigator chat): "Here's its investigator agent on ASI:One. It can read everything in the ledger. So let's see what happens when we ask it to pay."

0:14, Anudeep (refusal appears): "Nope. The database refused it and wrote down who asked. Role: reader. The agent that explains the money can't touch the money."

0:19, Sreesanth (controller chat): "The controller's seat can. Here's a clean repair invoice that's just over the auto-pay limit."

0:26, Anudeep (approval appears at 0:31): "One reducer checks the role, writes the payment, and the money goes to Capital One's mock bank. The bank's id is on the audit row in under a second."

0:37, Sreesanth (architecture slide): "Here's the thing. We could have paid a frontier model to read every fuel receipt in Texas. We did the math on that, got a little nervous, and wrote three hundred lines of TypeScript instead. That's the kernel. Whole cents, no model, same answer every single time."

0:55, Anudeep (same slide): "It checks every charge against where the truck actually was, the purchase order, the contract, and the vendor's bank details. Clean lines pay themselves. Anything weird becomes a hold."

1:05, Sreesanth (the hold card): "Like this one. Hold 2231. A fuel card for truck 17 buys a hundred and twenty gallons, four hundred twelve bucks, in Schulenburg, Texas. Truck 17's own GPS puts it ninety-seven miles away, engine off, twelve minutes after the swipe. Nothing gets paid."

1:21, Anudeep (Droid slide): "So who looks into it? Factory's Droid. Read-only. It gets a folder of evidence and Elastic's search tools, and that's it. Honestly, it has about the permissions of an intern on day one, which makes it the best-behaved employee we've ever had."

1:40, Sreesanth (why 2231, reply at 1:53): "Ask why. The controller agent passes it to the investigator and relays what it found. It asked Elastic which trucks pinged at that pump: truck 22. It read the dispatcher's swap log. And it comes back with one question: did Ramon Ortiz fuel truck 22 while 17 was in the shop?"

2:00, Anudeep (answer, reply at 2:12): "The controller answers like a person would. One sentence. That's not a payment. It becomes a rule: this driver, this week, one use. And Caliber checks it against every charge the controller already ruled on before it'll save it."

2:17, Sreesanth (rules, then approve rule 1): "Rule one. One past charge would've cleared, zero confirmed exceptions. Approve it. The kernel runs the exact same code with the rule in place and the hold clears. It's not going to ask about that swap again."

2:31, Anudeep (status): "And status: Elastic's workflow has already briefed the holds nobody answered. Count's on the last line."

2:38, Sreesanth (INV-1077 refused, then approved): "One more. A vendor changed its bank account two days before a nine-thousand-eight-hundred-dollar invoice. Try to approve it without a call-back note, and the reducer says no. Add the note, it's released and settled. The vendor check screens the business, never a person, and today it's a labelled fixture."

2:57, Anudeep (proof slide): "So, proof. We made up an entire trucking company. Forty trucks, ninety-two days, a driver named Ortiz. We planted fifty-two mistakes and hid the answers from our own AI, which felt a little mean. It caught all fifty-two. Zero false holds. And all six decoys cleared after exactly one answer each."

3:17, Sreesanth (benchmark): "Then we gave Claude Sonnet the same inputs with no kernel at all. And it matched us. Which was humbling for about a minute."

3:27, Anudeep (benchmark): "Then we looked at the bill. Claude charges on every line. Our kernel charges nothing, and the only model we pay for runs on the handful of holds. Pennies on the dollar. A smaller model hit thirty-one percent precision."

3:42, Sreesanth (Elastic composite): "Under the hood: one SpacetimeDB module is the whole ledger. Droid is read-only, with no 'pay' in its schema. Elastic finds the truck with a geo query and the contract clause with Jina embeddings. The company, the vendor check and the bank are simulated, and labelled. The controls are real."

3:59, Anudeep (close card): "Code decides. The investigator explains. The controller approves. The ledger refuses everything else. That's Caliber."

4:06, Sreesanth: "Repo, agents and the facts file are in the description. Go break it."
