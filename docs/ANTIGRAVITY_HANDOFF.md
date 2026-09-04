# ANTIGRAVITY HANDOFF — Kasuwa Credit OS: Real CC3 + Sepolia Deployment

You are continuing the Kasuwa Credit OS repository from a point where the local engineering
foundation is complete and verified, but nothing has ever touched a real public network. Read
`docs/IMPLEMENTATION_AUDIT.md`, `docs/SECURITY_MODEL.md`, and `docs/DEPLOYMENT.md` in full before
changing anything — they describe exactly what is real, what is simulated, and why, and every
claim in them was independently verified before being written. Do not contradict them without
re-verifying first.

## Baseline you must establish before touching anything

```
forge install foundry-rs/forge-std --no-commit
forge build
forge test          # expect 38/38 passing, 12 suites
cd relayer && npm install && npx tsc --noEmit -p tsconfig.json   # expect clean
bash demo/run_local_vertical_slice.sh   # expect it to complete with 4/4 attacks blocked
```

Do not proceed past a red baseline. Do not weaken, delete, skip, or rewrite any existing test to
make it pass. If something here fails and it worked before, that is a regression — find out why
before doing anything else.

## Load-bearing architecture you must preserve

`AttestcoinVerifier.EvidenceInput` has 7 fields: `chainKey, height, encodedTransaction,
merkleProof, continuityProof, sourceContract, logIndex`. There is no `merchantId`, `eventType`,
`amount`, `sourceTxHash`, or `sourceTxSuccess` field — those are all derived on-chain by
`src/lib/TransactionEvidence.sol` from the proven `encodedTransaction` bytes. The relayer
supplies only structural proof data, never a semantic claim about what happened. This is the
result of closing a real, previously-flagged trust gap (a relayer could otherwise pair a real
proof with a false claim about its content) — see `docs/SECURITY_MODEL.md` "Relayer honesty" for
the full account, including the one piece of real-world validation already done: a locally
produced transaction was encoded with the actual, unmodified `@gluwa/usc-sdk` `abiEncode`
function (not a reimplementation) and fed into the deployed contract, which correctly extracted
the real amount. Do not reintroduce a relayer-trusted content field. Do not remove
`TransactionEvidence.sol`'s on-chain decode step to "simplify" anything.

**Architectural rule to enforce for the rest of this work:** the CLI relayer
(`relayer/src/*.ts`) is the *authoritative* Attestcoin integration path — it must use the real
`@gluwa/usc-sdk` end to end (real `ProofBuilder`, real `PrecompileChainInfoProvider`, real
`encoding.abiEncode`/`getTransactionWithRaw`) with no shortcuts. `frontend/index.html` is an
*observation and interaction layer only* — it currently reproduces a simplified, structurally
compatible version of the SDK's encoding client-side for its own Security Lab demo buttons
(clearly labeled as such in its code comments), which is fine for browser-side interaction but
must never be described as equivalent to, or a substitute for, the real SDK path. If a judge asks
"is this really Attestcoin or a lookalike encoding," the answer must be: the CLI relayer path is
real Attestcoin, provably so by the CC3 transaction hashes this phase of work will produce; the
frontend just displays and interacts with the resulting state.

## What is proven and what is not, right now

Proven with real (if local) execution: contract logic, all named security invariants including
the relayer-honesty ones, deployment script mechanics, cross-contract wiring, one real
transaction's content correctly decoded via the real SDK's encoder. NOT proven: anything against
the real Creditcoin BlockProver precompile, the real Attestcoin Proof Builder service, or any
real cross-chain (Sepolia-to-Creditcoin) flow — because the environment this was built in has no
network route to any of them. That is the entire reason this handoff exists.

## Execution order

### 1. Audit current scripts against the current USC SDK/API before deploying anything

Do not assume anything in this repo about the SDK is still current — re-verify:

- Confirm the currently-published `@gluwa/usc-sdk` version and that its exported API
  (`PrecompileChainInfoProvider`, `PrecompileBlockProver`, `ProofBuilder`,
  `encoding.abiEncode`/`getTransactionWithRaw`, `BLOCK_PROVER_PRECOMPILE_ADDRESS`,
  `CHAIN_INFO_PRECOMPILE_ADDRESS`) matches what `src/interfaces/INativeQueryVerifier.sol` and
  `src/lib/TransactionEvidence.sol` assume. If the SDK has moved to a new major version or
  changed the encoding format (`src/encoding/abi/v1.ts` might have a v2 sibling by now), that is
  critical information — stop and reconcile the Solidity decoder against the new format before
  deploying, rather than deploying against a stale assumption.
- Confirm `0x0000000000000000000000000000000000000FD2` (BlockProver) and
  `0x0000000000000000000000000000000000000FD3` (ChainInfo) are still the correct precompile
  addresses on the CC3 testnet you're targeting — don't trust this document, re-check against
  Creditcoin's official network configuration repository.
- Confirm the current CC3 testnet RPC URL and Attestcoin Proof Builder URL from Creditcoin's
  OFFICIAL network configuration — do not use the SDK README's example URLs
  (`rpc.cc3-testnet.creditcoin.network`, `prover.cc3-testnet.creditcoin.network`) without
  independently confirming they're still current and live.
- Re-read `src/AttestcoinVerifier.sol` and `src/lib/TransactionEvidence.sol` in full and confirm
  for yourself (don't take this document's word for it) that: source-transaction-success is
  derived from the real receipt status inside the proven bytes (not a relayer flag);
  source-contract allowlisting is enforced before any decode happens; replay protection is keyed
  on `keccak256(chainKey, keccak256(encodedTransaction), logIndex)`, not any relayer-supplied
  identifier.

### 2. Deploy the exact current contract stack to Creditcoin CC3

Use `script/Deploy.s.sol` as-is — it already defaults `BLOCK_PROVER_ADDRESS` to the real
precompile constant unless overridden, so a forgotten override still does the right thing. Do
not fork or rewrite the deployment script unless step 1's audit found a real incompatibility.

```
PRIVATE_KEY=<dedicated CC3 testnet wallet — never a mainnet key> \
SOURCE_CHAIN_KEY=<the real chainKey Creditcoin has assigned your source chain — confirm via ChainInfo, NOT a guess> \
DEPLOY_ECONOMIC_EVENTS=false \
forge script script/Deploy.s.sol:Deploy --rpc-url <real CC3 RPC> --broadcast --verify
```

- Persist every resulting address and transaction hash — `deployments/<chainId>.json` is written
  automatically; do not hand-edit it.
- Verify contracts on CC3's explorer if it supports verification; record whether it does and the
  verification URLs if so.
- Run `script/smoke-test.sh` against the real RPC to confirm wiring:
  `RPC_URL=<real CC3 RPC> CHAIN_ID=<real chain id> ./script/smoke-test.sh`.

### 3. Deploy `EconomicEvents.sol` and create a real source-chain event on Sepolia (or your chosen source chain)

```
PRIVATE_KEY=<dedicated Sepolia testnet wallet> \
DEPLOY_ECONOMIC_EVENTS=true \
forge script script/Deploy.s.sol:Deploy --rpc-url <real Sepolia RPC> --broadcast
```

Then emit a real event (`emitPaymentSettled` or similar) against the deployed `EconomicEvents`
contract on Sepolia. Fetch the real receipt and explicitly confirm `receipt.status === 1` — do
not assume success. Record the transaction hash, block number, and receipt.

### 4. Generate and verify the real Attestcoin proof via the CLI relayer — no browser involved

Configure `relayer/.env` (see `relayer/.env.example`) with the real Sepolia RPC, the real CC3 RPC
and Proof Builder URL, and the real deployed contract addresses from steps 2–3. Run the relayer
(`npm run build && npm start` from `relayer/`, or invoke `watcher.ts` directly) and let it
actually detect the event, wait for attestation via `PrecompileChainInfoProvider`, build the
proof via `ProofBuilder`, and submit it to your real deployed `AttestcoinVerifier` via
`executor.ts`. This is the first time `TransactionEvidence.decode` will run against the REAL
BlockProver precompile's real verified output rather than `MockBlockProver`. **This is the
single most important step in this entire handoff.**

If it works: record the real Creditcoin-side transaction hash, the `EvidenceVerified` event's
contents, and the resulting `CreditPassport` capacity change.

If `TransactionEvidence.decode` reverts or produces wrong values against real data: **that is
critical, high-priority information, not a blocker to route around.** Do not paper over it or
loosen the decoder to "make it pass." Capture the real `encodedTransaction` bytes that caused the
problem, diagnose exactly which assumption about the encoding format was wrong, fix
`TransactionEvidence.sol` against the real observed format, add a regression test using the real
captured bytes (redact any sensitive data, but keep the structural content) as a fixture in
`test/`, and re-run the full local suite before re-attempting deployment.

### 5. Confirm the complete flow end-to-end

Sepolia economic event → Attestcoin proof (real Proof Builder) → CC3 verification (real
BlockProver precompile) → `CreditPassport` records the derived event → `CreditEngine` recomputes
capacity → (optional) `CreditLine.borrow` against the new capacity. Record every intermediate
state: capacity before/after, exposure before/after, the exact `VerifiedEventRecorded` and
`EvidenceVerified` event contents.

### 6. Point the frontend at the real deployment

Update `frontend/deployment.local.json` (or better, add a second config file,
e.g. `frontend/deployment.cc3-testnet.json`, and extend `frontend/index.html`'s Settings panel to
let the RPC/addresses be swapped — don't silently overwrite the local-Anvil defaults other
developers rely on for the local demo) with the real CC3 RPC URL and the real deployed addresses.
Confirm the Dashboard and Proof Explorer show the real values from step 5 — open it in an actual
browser and visually confirm; this was never done in the environment this repo was built in
(no browser tool was available there), so this is also the first real visual verification the
frontend has ever received.

### 7. Run the four Security Lab attacks against the real CC3 deployment

Using the real deployed contracts (not MockBlockProver), attempt: replay of already-consumed
evidence, a source-contract-mismatch claim, an evidence submission for a genuinely failed/
reverted source transaction, and a malicious AI recommendation against `CreditLine.borrow`.
Record the real revert selector/reason for each. If any of these unexpectedly succeeds instead of
being blocked, treat that as a critical security finding, not a demo hiccup — stop and fix the
contract before continuing.

### 8. Write up real, independently-verifiable evidence

Fill in `docs/REAL_TESTNET_EVIDENCE.md`'s "Live public network" section (currently empty by
design) with: every deployed contract address, the real Sepolia source transaction hash and
block, the real Creditcoin-side evidence-submission transaction hash and block, the
`VerifiedEventRecorded`/`EvidenceVerified` event contents, capacity before/after, and explorer
URLs for both chains wherever the explorers support them. Only include what actually happened —
if a step partially failed or needed a workaround, say so plainly rather than presenting a
cleaned-up narrative.

## Rules that apply throughout

- Never fabricate a transaction hash, address, block number, or "verified" result. If something
  cannot be executed or verified with your actual network access, say so plainly in the relevant
  doc rather than presenting an estimate or a plausible-looking placeholder as real.
- Run the full regression suite (`forge test`, relayer typecheck, `demo/run_local_vertical_slice.sh`)
  after every change that touches `src/`, `relayer/`, or `script/`, and do not proceed on a red
  baseline.
- Do not add new features (liquidity tiering, batching, the Developer API's remaining polish,
  additional frontend screens) until steps 1–8 are done and documented with real evidence. A
  judge can verify a transaction hash; they cannot verify a feature list.
- If you find a genuine bug or gap while doing this (as happened twice already in this repo's
  history — a relayer log-index convention bug, and a malformed test address literal — both
  caught only by actually running things against live state, not by inspection) fix it, add a
  regression test, and document what you found in the relevant doc rather than silently patching
  it. A discovered-and-fixed bug with an honest paper trail is a strength for review, not a
  weakness to hide.

## Demo structure for the final submission (once 1–8 are real)

Roughly 2:45, built around one line: **"The system doesn't ask you to trust the AI, the relayer,
or the frontend. The protocol enforces the credit decision."**

- 0:00–0:25 — Problem: verified economic activity that never becomes portable on-chain credit.
- 0:25–0:55 — Cross-chain evidence: the real Sepolia transaction → Proof Explorer → real CC3
  verification.
- 0:55–1:20 — Credit Passport: the verified event becoming persistent credit state.
- 1:20–1:40 — Credit capacity changing deterministically (show the real before/after numbers).
- 1:40–2:10 — A legitimate borrow.
- 2:10–2:45 — Security Lab: attack it four times, on the real deployment, show real blocked
  results.

Do not record this until steps 1–8 are done with real evidence — a demo built on local-only
results after promising real CC3 evidence would be a worse outcome than a shorter demo that is
entirely true.
