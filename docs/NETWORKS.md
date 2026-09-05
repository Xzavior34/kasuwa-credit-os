# Networks

## How these values were obtained (verification trail, not a stale tutorial)

On 2026-09-05, from this build environment:

```
npm view @gluwa/usc-sdk versions --json     # confirmed 0.18.0 is the latest published version
npm pack @gluwa/usc-sdk@0.18.0               # downloaded the real published tarball
tar xzf gluwa-usc-sdk-0.18.0.tgz
cat package/dist/block-prover/index.d.ts     # read the real shipped type declarations
cat package/dist/chain-info/index.d.ts
cat package/dist/block-prover/block_prover.json   # read the real shipped ABI
cat package/dist/chain-info/chain_info.json
```

Anyone can rerun this to reproduce or refute what's below — it isn't from memory or training
data, it's read directly from the artifact npm actually serves.

## Creditcoin precompiles (verified)

| Precompile | Address | Source |
|---|---|---|
| BlockProver | `0x0000000000000000000000000000000000000FD2` | `BLOCK_PROVER_PRECOMPILE_ADDRESS` export, `@gluwa/usc-sdk` v0.18.0 |
| ChainInfo | `0x0000000000000000000000000000000000000FD3` | `CHAIN_INFO_PRECOMPILE_ADDRESS` export, `@gluwa/usc-sdk` v0.18.0 |

`AttestcoinVerifier.sol` mirrors the BlockProver ABI exactly (`src/interfaces/INativeQueryVerifier.sol`)
— same struct shapes (`MerkleProof`, `MerkleProofEntry`, `ContinuityProof`), same function
names (`verify`, `verifyAndEmit`, `calculateTxIndex`), same event
(`TransactionVerified(uint64,uint64,uint64)`). Nothing was invented.

## What was NOT independently verified from this environment

- The current CC3 testnet RPC URL and Creditcoin Proof Builder URL. The SDK's own README lists
  example values (`https://rpc.cc3-testnet.creditcoin.network`,
  `https://prover.cc3-testnet.creditcoin.network/`) but this environment has no network route to
  reach them and confirm they're still live — see `docs/IMPLEMENTATION_AUDIT.md` "Environment
  constraints". Do not treat the example URLs above as confirmed current; re-check
  Creditcoin's official network configuration repository before deploying.
- The current list of `chainKey` values for specific supported source chains
  (`getSupportedChains()` would answer this against a live RPC, which this environment cannot
  reach). `SOURCE_CHAIN_KEY=2` used throughout the demo/tests is an arbitrary placeholder, not a
  claim about any real chain's assigned key.

## Source chain (demo)

`EconomicEvents.sol` is deployed to whatever EVM-compatible chain is configured as the demo
source chain (e.g. a local Anvil instance or a public testnet) — this is explicitly a
demo/test harness, not a production payment rail. See `docs/DEMO.md`.

## Local test environment

Foundry tests do not run against any of the above networks. They construct
`AttestcoinVerifier` with a `MockBlockProver` test double (`test/mocks/MockBlockProver.sol`)
instead of the real precompile address, because this sandbox cannot reach a live Creditcoin RPC.
This substitution is confined to `test/` and documented in `docs/SECURITY_MODEL.md`.


## Live network values — independently re-verified 2026-09-05 (for real deployment)

Re-checked directly against Creditcoin's and Attestcoin's official docs sites (not the SDK
README's example values) ahead of the first real testnet deployment attempt — see
`.github/workflows/testnet-deploy.yml` and `docs/ANTIGRAVITY_HANDOFF.md`.

| Value | Confirmed | Source |
|---|---|---|
| Creditcoin CC3 testnet RPC | `https://rpc.cc3-testnet.creditcoin.network` | docs.creditcoin.org/environments/testnet |
| Creditcoin CC3 testnet chain ID | `102031` | docs.creditcoin.org/environments/testnet |
| Creditcoin CC3 explorer (EVM) | `https://creditcoin-testnet.blockscout.com/` | docs.creditcoin.org/environments/testnet |
| Attestcoin Proof Builder (testnet) | `https://prover.cc3-testnet.creditcoin.network` (alt: `https://proof-gen-api.cc3-testnet.creditcoin.network/`) | docs.attestcoin.org/attestcoin-protocol/environments/testnet |
| BlockProver precompile | `0x0000000000000000000000000000000000000FD2` | docs.attestcoin.org (matches SDK export used throughout this repo) |
| **Ethereum Sepolia chainKey** | **`1`** | docs.attestcoin.org/attestcoin-protocol/environments/testnet |
| Ethereum Mainnet chainKey | `3` | docs.attestcoin.org/attestcoin-protocol/environments/testnet |
| Testnet CTC faucet | Discord `#token-faucet` channel, `/faucet address:<your EVM address>` | docs.creditcoin.org/wallets/using-testnet-faucet |

**Correction this establishes:** `test/helpers/KasuwaTestBase.sol`'s `SOURCE_CHAIN_KEY = 2` was
always documented as "an arbitrary demo source chain" placeholder, never a claim about Sepolia's
real assigned key — that placeholder is fine to leave as-is in `test/` (it never touches a real
network). But any REAL deployment targeting Sepolia as the source chain must use `chainKey = 1`,
not `2` — `.github/workflows/testnet-deploy.yml` sets `SOURCE_CHAIN_KEY=1` accordingly. Deploying
with the wrong chainKey wouldn't silently corrupt anything (Attestcoin's own chain registry would
simply fail to recognize transactions under the wrong key), but it's worth getting right before
spending real testnet gas on a deployment that can't attest.
