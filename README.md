# Kasuwa Credit OS

> Verified economic activity → programmable credit capacity.

A programmable credit state layer for Creditcoin: cryptographically verified economic activity
(via the Attestcoin Protocol / USC) becomes a reusable, continuously evolving credit passport,
from which a deterministic policy engine derives borrowing capacity. The loan is the first
application; the credit state is the product — any protocol on Creditcoin can build on top of it.

- **Live Production Console**: https://kasuwa-credit-os.vercel.app/
- **GitHub Repository**: https://github.com/Xzavior34/kasuwa-credit-os
- **Project Pitch Deck**: [`docs/assets/Kasuwa_Credit_OS_Project_Deck.pdf`](docs/assets/Kasuwa_Credit_OS_Project_Deck.pdf)
- **Demo Video**: not yet recorded — see the open item in `docs/DEMO.md` (script ready: [`Claude outputs/Kasuwa_Demo_Video_Script.md`](Claude%20outputs/Kasuwa_Demo_Video_Script.md))
- **TypeScript Client SDK**: [`src/sdk/KasuwaSDK.ts`](src/sdk/KasuwaSDK.ts) — reference client, not yet published to npm
- **Adversarial Verification Matrix**: [`docs/ADVERSARIAL_VERIFICATION.md`](docs/ADVERSARIAL_VERIFICATION.md) (47/47 Passing Invariant Tests)

## Live deployment status (updated 2026-09-06)

This table is the single source of truth for what is live at these exact addresses. All 7
contracts of the Kasuwa stack — the Sepolia source contract plus all 6 CC3 execution contracts —
are live and independently verified at the addresses below; every address has been checked
directly against its block explorer. In addition, the repository contains a further capability
that is implemented and tested but not yet part of this deployment: native decoding of canonical
Circle USDC transfers and composable third-party B2B credit markets, verified by 47/47 passing
Foundry invariant tests (see "What's technically novel" below) — this is not reachable from the
live dashboard today.

| Component | Network | Address | Status | Explorer |
|---|---|---|---|---|
| `EconomicEvents.sol` | Ethereum Sepolia | `0x84780ab03db7A3FebFdb789De402314F202D8263` | **Live** — real contract, real transactions | [Etherscan](https://sepolia.etherscan.io/address/0x84780ab03db7A3FebFdb789De402314F202D8263) |
| `AttestcoinVerifier.sol` | Creditcoin CC3 testnet | `0x8Fd160D9E7617a9C47d6c2824A425DB823cdc1C2` | **Live** — confirmed on-chain | [Blockscout](https://creditcoin-testnet.blockscout.com/address/0x8Fd160D9E7617a9C47d6c2824A425DB823cdc1C2) |
| `CreditPassport.sol` | Creditcoin CC3 testnet | `0x9DbaD85c6eBFA90fD4634deE08020Bb95a80942d` | **Live** — confirmed on-chain | [Blockscout](https://creditcoin-testnet.blockscout.com/address/0x9DbaD85c6eBFA90fD4634deE08020Bb95a80942d) |
| `CreditEngine.sol` | Creditcoin CC3 testnet | `0xcc364e6D87146abBdB47ebaAAe964f7d447E4875` | **Live** — confirmed on-chain | [Blockscout](https://creditcoin-testnet.blockscout.com/address/0xcc364e6D87146abBdB47ebaAAe964f7d447E4875) |
| `PolicyEngine.sol` | Creditcoin CC3 testnet | `0x30b7A70b4fA0Be2F3eD2ef7551c4890A481Ef047` | **Live** — confirmed on-chain | [Blockscout](https://creditcoin-testnet.blockscout.com/address/0x30b7A70b4fA0Be2F3eD2ef7551c4890A481Ef047) |
| `CreditLine.sol` | Creditcoin CC3 testnet | `0x3ed53F226dd8f46451E3e5D418b25Be7889fd49e` | **Live** — confirmed on-chain | [Blockscout](https://creditcoin-testnet.blockscout.com/address/0x3ed53F226dd8f46451E3e5D418b25Be7889fd49e) |
| `LiquidityPool.sol` | Creditcoin CC3 testnet | `0xB89E9A2D42BbE6Ffd7Dca9b8f225d4A43C219AF8` | **Live** — confirmed on-chain | [Blockscout](https://creditcoin-testnet.blockscout.com/address/0xB89E9A2D42BbE6Ffd7Dca9b8f225d4A43C219AF8) |

All seven addresses above were deployed by the same wallet (`0x73af91CE084D84Ccdd6613D5B135EB10549C4616`)
on both chains — one coordinated cross-chain deployment, not disconnected demos. Full addresses are
also committed in `deployments/102031.json` and `deployments/11155111.json`, and raw relayer/
attestation evidence (real tx hashes, relayer job state) is in `docs/REAL_TESTNET_EVIDENCE.generated.md`,
so every claim here can be independently cross-checked rather than taken on our word. The five
CC3 contracts beyond `AttestcoinVerifier` were also verified working end-to-end against a
**local Anvil chain** before this live deployment (see `docs/REAL_TESTNET_EVIDENCE.md` for that
walkthrough).

### Live Verification Receipts (Creditcoin CC3 Testnet & Sepolia)

Every action, event, and state transition in Kasuwa Credit OS is grounded in real testnet transactions with cryptographic proof receipts:

| Flow / Component | Network | Transaction Hash / Address | Verification Status | Explorer Link |
|---|---|---|---|---|
| **Commercial Event (PaymentSettled)** | Ethereum Sepolia (`11155111`) | `0x30e8780988f6641a8e426d315d16179f60556572a83540b7ed79fbdfab356fe0` | EIP-658 Status: `0x1` (Success) | [Etherscan ↗](https://sepolia.etherscan.io/tx/0x30e8780988f6641a8e426d315d16179f60556572a83540b7ed79fbdfab356fe0) |
| **Relayer Ingestion (Observed)** | Ethereum Sepolia (`11155111`) | `0xacb4856a667a29e5fa92f898f5e273d62a3cb951b0e23e0a6439fe6aed6a4321` | Attestcoin Observed (Log #79) | [Etherscan ↗](https://sepolia.etherscan.io/tx/0xacb4856a667a29e5fa92f898f5e273d62a3cb951b0e23e0a6439fe6aed6a4321) |
| **Economic Emitter Contract** | Ethereum Sepolia (`11155111`) | `0x84780ab03db7A3FebFdb789De402314F202D8263` | Verified Source Emitter | [Etherscan ↗](https://sepolia.etherscan.io/address/0x84780ab03db7A3FebFdb789De402314F202D8263) |
| **Canonical Sepolia USDC Proxy** | Ethereum Sepolia (`11155111`) | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` | Official Circle FiatTokenProxy | [Etherscan ↗](https://sepolia.etherscan.io/address/0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238) |
| **Attestcoin Verifier Hub** | Creditcoin CC3 (`102031`) | `0x8Fd160D9E7617a9C47d6c2824A425DB823cdc1C2` | Precompile `0x0FD2` Verified | [Blockscout ↗](https://creditcoin-testnet.blockscout.com/address/0x8Fd160D9E7617a9C47d6c2824A425DB823cdc1C2) |
| **Credit Passport State Primitive** | Creditcoin CC3 (`102031`) | `0x9DbaD85c6eBFA90fD4634deE08020Bb95a80942d` | Deterministic Capacity Ledger | [Blockscout ↗](https://creditcoin-testnet.blockscout.com/address/0x9DbaD85c6eBFA90fD4634deE08020Bb95a80942d) |
| **Policy Engine Risk Guard** | Creditcoin CC3 (`102031`) | `0x30b7A70b4fA0Be2F3eD2ef7551c4890A481Ef047` | $2,000 Hard Limit Enforced | [Blockscout ↗](https://creditcoin-testnet.blockscout.com/address/0x30b7A70b4fA0Be2F3eD2ef7551c4890A481Ef047) |
| **Credit Line Execution Facility** | Creditcoin CC3 (`102031`) | `0x3ed53F226dd8f46451E3e5D418b25Be7889fd49e` | Reentrancy-Guarded Drawdown | [Blockscout ↗](https://creditcoin-testnet.blockscout.com/address/0x3ed53F226dd8f46451E3e5D418b25Be7889fd49e) |
| **Liquidity Pool Capital Vault** | Creditcoin CC3 (`102031`) | `0xB89E9A2D42BbE6Ffd7Dca9b8f225d4A43C219AF8` | Isolated Treasury Vault | [Blockscout ↗](https://creditcoin-testnet.blockscout.com/address/0xB89E9A2D42BbE6Ffd7Dca9b8f225d4A43C219AF8) |
| **Deployer & Admin Authority** | Cross-Chain (`11155111` / `102031`) | `0x73af91CE084D84Ccdd6613D5B135EB10549C4616` | Coordinated Dual-Chain Origin | [Blockscout ↗](https://creditcoin-testnet.blockscout.com/address/0x73af91CE084D84Ccdd6613D5B135EB10549C4616) |


**Security**: an internal audit against our own threat model found a real reentrancy exposure in
`CreditLine.borrow()` — the credit exposure was being recorded *after* the external funds
transfer, not before. It's fixed: checks-effects-interactions ordering, a dependency-free
`ReentrancyGuard` on every state-changing entry point, and dedicated attacker-contract tests
(`test/reentrancy.t.sol`) proving the exploit is now blocked. See `docs/SECURITY_MODEL.md`
("Reentrancy — fixed, previously mis-judged as low-risk") for the full writeup — we're
documenting the bug we found and fixed, not just the clean surface.

**Tests**: 47 tests across 14 Foundry test files, covering canonical Circle USDC ERC-20 transfer ingestion, B2B third-party marketplace composability, reentrancy, replay protection, malicious-AI bounding, fake/unauthorized source rejection, over-limit rejection, and a full deployment smoke test. Run `forge test -vv` to reproduce. See [`docs/ADVERSARIAL_VERIFICATION.md`](docs/ADVERSARIAL_VERIFICATION.md) for the complete adversarial verification matrix.

## What is Kasuwa?

A credit state layer, not a lending app: economic history -> verified credit state -> reusable
capacity -> many possible downstream applications (see `docs/API.md` and `src/examples/SupplierB2BMarketplace.sol`).

## Why Creditcoin? Why Attestcoin?

Attestcoin/USC lets a smart contract on Creditcoin cryptographically verify that a specific
transaction happened, and succeeded, on another chain, without trusting an intermediary's
say-so. That's the exact primitive a portable, verifiable credit history needs: proof that a
merchant's claimed economic activity is real, not self-reported.

## What's technically novel

- **Canonical Economic Rails** (implemented, tested, not yet deployed): `TransactionEvidence.sol` natively decodes standard ERC-20 `Transfer(address,address,uint256)` events directly from canonical Circle USDC on Ethereum Sepolia (`0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`), allowing real merchant sales volume to prove into Kasuwa with zero merchant adoption friction. Verified by `test/circle-usdc-and-composability.t.sol`, but it landed after the contracts in the deployment table above were deployed, so it is not part of their live bytecode and is not wired into the live dashboard yet — a demonstrated capability for the next deployment, not something a judge can exercise against the live app today.
- **Credit State Layer & Ecosystem Composability** (same status as above): Built in [`src/examples/SupplierB2BMarketplace.sol`](src/examples/SupplierB2BMarketplace.sol) and [`src/sdk/KasuwaSDK.ts`](src/sdk/KasuwaSDK.ts) (a reference TypeScript client, not published to npm), demonstrating third-party protocols (B2B marketplaces, invoice factoring, supplier credit) querying uncollateralized borrowing headroom directly against Creditcoin `CreditPassport` state in 3 lines of code. Real, tested Solidity/TypeScript — not a deployed or live-linked capability.
- **Deterministic Capacity**: Credit capacity is computed by a fully documented, bounded, deterministic formula (`CreditEngine.sol`), never an opaque score.
- **AI Trust Boundary**: AI is architecturally incapable of moving funds: `PolicyEngine.evaluateBorrow` ignores its `aiRecommendedAmount` input entirely in the decision (see `docs/SECURITY_MODEL.md`, `test/malicious-ai.t.sol`).
- **Dual Verification**: Inclusion and success are checked as two separate, both-required conditions for any source transaction, see `docs/SECURITY_MODEL.md`.
- **State Isolation**: Verified repayment *history* and actual on-chain repayment are deliberately kept as separate concepts so that one can't be used to fake the other.

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
forge test -vv          # 47 tests, 14 files, all passing

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
