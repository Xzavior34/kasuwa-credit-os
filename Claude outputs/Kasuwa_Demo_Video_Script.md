# Kasuwa Credit OS — Demo Video Script
Target length: 2:30–3:00. Read it once out loud before recording — trim anything that feels slow.

## Before you hit record

As of this writing, all 7 contracts (the Sepolia source contract plus all 6 CC3 contracts) are deployed and independently verified on Blockscout/Etherscan, so you can say plainly: "the full contract stack is live on Ethereum Sepolia and Creditcoin CC3." Double-check this is still true right before you record (re-run through the Judge Tour once) in case anything changed.

Screen order: Vercel live app → Proof Explorer tab → Security Lab tab → one block explorer tab open in the background (Sepolia or Blockscout) to cut to.

---

## Script

**[0:00–0:15] Hook — cold open on the problem**

> "Merchants across Nigeria generate real transaction history every single day. None of it counts as credit history on-chain. Most DeFi lending still needs crypto collateral — which shuts out exactly the people with the most real economic activity to lend against."

*(Screen: Vercel live app, landing view.)*

**[0:15–0:40] What Kasuwa does**

> "Kasuwa Credit OS turns verified, real-world economic activity into reusable, programmable credit capacity on Creditcoin. Not another isolated lending app — a credit state layer other protocols can build on top of."

*(Screen: click into the Proof Explorer.)*

**[0:40–1:10] Live proof walkthrough**

> "Here's how it actually works. An economic event — a payment, a repayment — happens on Ethereum Sepolia. The Attestcoin Protocol proves that event happened, cryptographically, cross-chain, to Creditcoin. No bridge, no custodian, no relayer you have to trust blindly."

*(Screen: walk the proof timeline step by step — source tx → attestation → verification. Open the raw proof drawer and show the Merkle root / tx receipt for a few seconds.)*

> "This is a real Merkle proof against a real transaction — you can check every value yourself on the block explorer."

**[1:10–1:45] Security Lab — prove the security claim, don't just say it**

> "We don't just claim this is secure — we built in live attack simulators so you can watch it fail safely."

*(Screen: Security Lab tab. Trigger ONE attack live — the replayed attestation or the malicious-AI one is the most visual.)*

> "Watch — I'm trying to replay an already-used proof to double-credit the same transaction." *(click, wait for revert)* "Rejected on-chain: `EvidenceAlreadyConsumed`. No human moderation, no off-chain check — the contract itself refuses it."

> "Same story with AI. Our system lets an AI model *recommend* a loan amount — but the smart contract enforces a hard, deterministic cap no matter what the AI says. AI can advise. AI cannot authorize."

*(Optional, if time allows: switch to the Credit Facility tab and try to draw more than the $2,000 policy ceiling in the live UI — it gets rejected with "POLICY LIMIT EXCEEDED" before it ever reaches the chain. This is a nice second, very visual proof of the same point.)*

**[1:45–2:10] Real evidence, not a local demo**

*(Cut to the block explorer tab you already had open.)*

> "This isn't running against a local test chain for the demo — these are real contracts, real transactions, on Ethereum Sepolia and Creditcoin's CC3 testnet, both deployed from the same wallet, both verifiable right here on the explorer."

*(Screen: scroll the explorer page briefly — transaction hash, contract address visible.)*

**[2:10–2:30] Security honesty beat (this is a differentiator, don't cut it)**

> "We also audited our own threat model and found a real reentrancy bug in our borrow function — and fixed it, with tests that prove the exploit is now blocked. We'd rather show you the bug we found and fixed than pretend there wasn't one."

**[2:30–2:50] Close**

> "Kasuwa Credit OS: verified economic activity, into reusable, programmable credit — for anyone building on Creditcoin. Live demo and full source are linked below."

*(Screen: final frame — logo + URLs.)*
```
https://kasuwa-credit-os.vercel.app/
https://github.com/Xzavior34/kasuwa-credit-os
```

---

## Delivery notes

- Speak slightly slower than feels natural — judges are often watching at 1.25–1.5x.
- Don't apologize or hedge on camera ("this is still a work in progress...") — state what's true, plainly, and move on.
- If a live attack demo call is slow to revert, don't stop recording — a 2–3 second pause while the chain confirms actually reads as authentic, not scripted.
- Cut ruthlessly if you're over 3:00 — losing the hook or the security section hurts more than losing the closing line.
