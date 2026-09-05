# Kasuwa Credit OS

> Verified economic activity → programmable credit capacity.

A programmable credit state layer for Creditcoin: cryptographically verified economic activity
(via the Attestcoin Protocol / USC) becomes a reusable, continuously evolving credit passport,
from which a deterministic policy engine derives borrowing capacity. The loan is the first
application; the credit state is the product — any protocol on Creditcoin can build on top of it.

## Live deployment status (updated 2026-09-05)

This table is the single source of truth for what's actually live vs. still local-only. Every
address below has been independently checked against its block explorer — not just claimed.

| Component | Network | Address | Status | Explorer |
|---|---|---|---|---|
| `EconomicEvents.sol` | Ethereum Sepolia | `0xEd15bEb8F5D7854F27b965D1FD4c0584877554c1` | **Live** — real contract, real transactions | [Etherscan](https://sepolia.etherscan.io/address/0xEd15bEb8F5D7854F27b965D1FD4c0584877554c1) |
| `AttestcoinVerifier.sol` | Creditcoin CC3 testnet | `0xF037AD72C341326e5B4E0B2Cb0217307Be697Aa0` | **Live** — real contract, confirmed on-chain | [Blockscout](https://creditcoin-testnet.blockscout.com/address/0xF037AD72C341326e5B4E0B2Cb0217307Be697Aa0) |
| `CreditPassport.sol`, `CreditEngine.sol`, `PolicyEngine.sol`, `CreditLine.sol`, `LiquidityPool.sol` | Creditcoin CC3 testnet | see `deployments/102031.json` once finalized | **Deployment in progress** — tracked in [GitHub Actions run #10](https://github.com/Xzavior34/kasuwa-credit-os/actions/runs/33964265571) | — |

Both live addresses above were deployed by the same wallet (`0x73af91CE084D84Ccdd6613D5B135EB10549C4616`)
on both chains — one coordinated cross-chain deployment, not two unrelated demos. The remaining
five contracts are also verified working end-to-end against a **local Anvil chain** (real
addresses, real tx hashes, real attack rejections — see `docs/DEMO.md`); their move to CC3 is
what the linked Actions run is completing. This file will be updated the moment that run
concludes, with every new address re-checked the same way as the two above.

**Security**: an internal audit against our own threat model found a real reentrancy exposure in
`CreditLine.borrow()` — the credit exposure was being recorded *after* the external funds
transfer, not before. It's fixed: checks-effects-interactions ordering, a dependency-free
`ReentrancyGuard` on every state-changing entry point, and dedicated attacker-contract tests
(`test/reentrancy.t.sol`) proving the exploit is now blocked. See `docs/SECURITY_MODEL.md`
("Reentrancy — fixed, previously mis-judged as low-risk") for the full writeup — we're
documenting the bug we found and fixed, not just the clean surface.

**Tests**: 45 tests across 13 Foundry test files, covering reentrancy, replay protection,
malicious-AI bounding, fake/unauthorized source rejection, over-limit rejection, and a full
deployment smoke test. Run `forge test -vv` to reproduce.

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

## Live demo

**https://kasuwa-credit-os.vercel.app/** — the Proof Explorer and Security Lab run against the
live Sepolia + Creditcoin CC3 deployment above, and default to it automatically outside of
localhost.

## How do I run it?

```bash
# Contracts (forge-std is vendored in this repo, not a submodule - skip install if already present)
forge build
forge test -vv          # 45 tests, 13 files, all passing

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

See the **Live deployment status** table above for the current, independently-checked state, and
`docs/REAL_TESTNET_EVIDENCE.md` for the full detail, including the local-Anvil vertical-slice
evidence for the parts of the stack still finishing their move to CC3.

## How do I reproduce the demo?

`docs/DEMO.md`.

## Docs index

- `docs/IMPLEMENTATION_AUDIT.md` - what was built, what wasn't, and why
- `docs/NETWORKS.md` - verified precompile addresses and how they were verified
- `docs/ARCHITECTURE.md` - data flow and contract breakdown
- `docs/SECURITY_MODEL.md` - the security invariants and where each is tested
- `docs/THREAT_MODEL.md` - threat-by-threat mitigation table, including honest gaps
- `docs/API.md` - the developer read API other apps can consume
- `docs/DEMO.md` - what "demo" means here and how to reproduce the tested parts
- `docs/DEPLOYMENT.md` - real deployment scripts, local-Anvil evidence, and the live CC3/Sepolia
  rollout
- `docs/REAL_TESTNET_EVIDENCE.md` - what's live vs. still local-only, precisely, with explorer
  links
- `frontend/README.md` - the Proof Explorer / Security Lab UI, and how to run it
