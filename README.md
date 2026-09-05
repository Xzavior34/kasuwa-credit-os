# Kasuwa Credit OS

> Verified economic activity → programmable credit capacity.

A programmable credit state layer for Creditcoin: cryptographically verified economic activity
(via Attestcoin/USC) becomes a reusable, continuously evolving credit passport, from which a
deterministic policy engine derives borrowing capacity. The loan is the first application; the
credit state is the product.

**Status: contracts (38 tests previously confirmed passing, +4 new reentrancy tests in
`test/reentrancy.t.sol` added since — see "Honesty note" below, this newest batch has not yet
been re-run through `forge test` in this environment) + relayer + real deployment scripts + a
Proof Explorer/Security Lab frontend, all actually run end-to-end against a local Anvil chain
(real addresses, real tx hashes, real attack rejections). The relayer-trust gap flagged in
earlier review has been closed: AttestcoinVerifier now derives event content on-chain from the
proven transaction bytes rather than trusting relayer claims — validated against the real
`@gluwa/usc-sdk` encoder, not just hand-built fixtures (see `docs/SECURITY_MODEL.md` "Relayer
honesty"). A real reentrancy bug in `CreditLine.borrow` (exposure recorded after, not before, the
value transfer) has also just been found and fixed — see `docs/SECURITY_MODEL.md` "Reentrancy —
fixed, previously mis-judged as low-risk". No live public-testnet deployment yet — see "Honesty
note" below before assuming otherwise.**

## What is Kasuwa?

A credit state layer, not a lending app: economic history -> verified credit state -> reusable
capacity -> many possible downstream applications (see `docs/API.md`).

## Why Creditcoin? Why Attestcoin?

Attestcoin/USC lets a smart contract on Creditcoin cryptographically verify that a specific
transaction happened, and succeeded, on another chain, without trusting an intermediary's
say-so. That's the exact primitive a portable, verifiable credit history needs: proof that a
merchant's claimed economic activity is real, not self-reported.

## What's technically novel

- Credit capacity is computed by a fully documented, bounded, deterministic formula
  (`CreditEngine.sol`), never an opaque score.
- AI is architecturally incapable of moving funds: `PolicyEngine.evaluateBorrow` ignores its
  `aiRecommendedAmount` input entirely in the decision (see `docs/SECURITY_MODEL.md`,
  `test/malicious-ai.t.sol`).
- Inclusion and success are checked as two separate, both-required conditions for any source
  transaction, see `docs/SECURITY_MODEL.md`.
- Verified repayment *history* and actual on-chain repayment are deliberately kept as separate
  concepts so that one can't be used to fake the other.

## How does the system work?

See `docs/ARCHITECTURE.md` for the full data flow and contract-by-contract breakdown.

## How do I run it?

```bash
# Contracts (forge-std is excluded from this archive as a dependency - fetch it once first)
forge install foundry-rs/forge-std --no-commit
forge build
forge test -vv          # 38 tests, 12 files, all passing as of the last confirmed run;
                         # +4 reentrancy tests added in test/reentrancy.t.sol since — re-run to confirm

# Real local deployment + full vertical slice (deploy, real source tx, evidence, capacity
# update, borrow, four live attacks) against a local Anvil chain - see docs/DEMO.md
bash demo/run_local_vertical_slice.sh

# Relayer (typechecks against the real @gluwa/usc-sdk types; requires real RPC/proof-builder
# URLs in .env to actually run against a network - see relayer/.env.example)
cd relayer
npm install
npx tsc --noEmit -p tsconfig.json
```

## Where are the deployed contracts? Where is the proof?

No live public-network deployment yet — see `docs/IMPLEMENTATION_AUDIT.md` "Environment
constraints" for exactly why. There IS a real local deployment (Anvil, chainId 31337) with real
addresses and transaction hashes from an actual run of `script/Deploy.s.sol` — see
`docs/DEPLOYMENT.md` and `docs/REAL_TESTNET_EVIDENCE.md` for the full detail and what's needed
to move this to a real public network.

## How do I reproduce the demo?

`docs/DEMO.md`.

## Honesty note

This was built in a sandbox with **no network access to any blockchain RPC**, only package
registries. Every contract, test, and relayer type-check claimed above was actually run and
actually passed in that sandbox. Nothing about a live testnet, a real transaction hash, or a
deployed address is claimed anywhere in this repo, because none of that has happened yet. See
`docs/IMPLEMENTATION_AUDIT.md` for the full, specific breakdown of what's real vs. not yet done.

## Docs index

- `docs/IMPLEMENTATION_AUDIT.md` - what was built, what wasn't, and why
- `docs/NETWORKS.md` - verified precompile addresses and how they were verified
- `docs/ARCHITECTURE.md` - data flow and contract breakdown
- `docs/SECURITY_MODEL.md` - the security invariants and where each is tested
- `docs/THREAT_MODEL.md` - threat-by-threat mitigation table, including honest gaps
- `docs/API.md` - the developer read API other apps can consume
- `docs/DEMO.md` - what "demo" means here and how to reproduce the tested parts
- `docs/DEPLOYMENT.md` - real deployment scripts, and the real local-Anvil evidence they produced
- `docs/REAL_TESTNET_EVIDENCE.md` - what's real vs. not yet, precisely
- `frontend/README.md` - the Proof Explorer / Security Lab UI, and how to run it
- `docs/ANTIGRAVITY_HANDOFF.md` - the exact handoff directive for real CC3/Sepolia deployment
  (the one thing this environment cannot do — no network route to any live blockchain RPC)
