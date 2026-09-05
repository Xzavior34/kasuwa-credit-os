# Deployment

## Real vs. local — read this first

`script/Deploy.s.sol` is a genuine Foundry deployment script. It has been **run and verified only
against a local Anvil chain** in the environment this repo was built in, because that environment
has no network route to any live blockchain RPC (see `docs/IMPLEMENTATION_AUDIT.md`). It has
**not** been run against Creditcoin CC3 testnet, Sepolia, or any other public network. Nothing
in this file claims otherwise.

The script itself is not local-only — point `--rpc-url` at a real endpoint with real funds behind
`PRIVATE_KEY` and it deploys there exactly the same way. The only thing that changes between a
local run and a real Creditcoin run is `BLOCK_PROVER_ADDRESS`.

## Local run (verified, reproducible)

```bash
bash demo/run_local_vertical_slice.sh
```

This starts a local Anvil chain, deploys `MockBlockProver` (since Anvil cannot execute
Creditcoin's real precompile), deploys the full stack against it, writes
`deployments/31337.json`, then walks through one real local transaction end-to-end plus the four
named attacks. See `docs/DEMO.md` for the full transcript and what each step means.

Deploying just the stack, without the rest of the demo:

```bash
anvil &
export PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80  # Anvil dev key #0
export BLOCK_PROVER_ADDRESS=<address of a deployed MockBlockProver, or omit for the real precompile address>
forge script script/Deploy.s.sol:Deploy --rpc-url http://127.0.0.1:8545 --broadcast
cat deployments/31337.json
```

## Deploying to a real Creditcoin testnet

1. Confirm the current CC3 testnet RPC URL and Attestcoin Proof Builder URL against Creditcoin's
   official network configuration repository — do not trust the SDK README's example URLs
   without checking (see `docs/NETWORKS.md`).
2. Fund a **dedicated testnet wallet** (never a mainnet key) and set `PRIVATE_KEY` to it.
3. Do **not** set `BLOCK_PROVER_ADDRESS` — leave it unset so the script uses the real, verified
   `0x0000000000000000000000000000000000000FD2` address.
4. Run the source-chain half first, then the Creditcoin half. **Use
   `script/DeploySourceOnly.s.sol:DeploySourceOnly`** for the source-chain half (Sepolia) — it
   deploys only `EconomicEvents.sol`, not the full Kasuwa stack, avoiding unused
   CreditEngine/CreditPassport/PolicyEngine/LiquidityPool/CreditLine/AttestcoinVerifier
   instances sitting wired to a nonexistent-on-Sepolia BlockProver precompile address. Then run
   `script/Deploy.s.sol:Deploy` with `DEPLOY_ECONOMIC_EVENTS=false` against the real Creditcoin
   RPC for the Creditcoin half, passing the Sepolia `EconomicEvents` address via
   `ECONOMIC_EVENTS_ADDRESS`.

   `.github/workflows/testnet-deploy.yml` automates exactly this split (plus the full relayer
   round-trip and evidence capture) as a one-click, `workflow_dispatch`-triggered CI job — see
   its comments for the full step-by-step. It requires two repo secrets:
   `TESTNET_PRIVATE_KEY` (a dedicated, funded testnet wallet — see below) and
   `SEPOLIA_RPC_URL`. Fund the wallet via a Sepolia faucet and the Creditcoin CC3 faucet (Discord
   `#token-faucet`, `/faucet address:<address>` — see `docs/NETWORKS.md`) before running it.
5. Configure the relayer's `.env` (see `relayer/.env.example`) with the resulting addresses and
   real RPC/proof-builder URLs, then run it against the real deployment.
6. Fill in `docs/REAL_TESTNET_EVIDENCE.md` with the actual resulting hashes/addresses — only
   after they exist.

## Deployment smoke test

`test/DeploymentSmoke.t.sol` runs the same deployment logic as `script/Deploy.s.sol` inside
Foundry's test EVM (not Anvil — this is a `forge test`, part of the regular, fast test suite) and
asserts every cross-contract permission wire-up is correct. This is the fast, CI-friendly check;
`demo/run_local_vertical_slice.sh` is the slower, "real RPC round-trip" proof.

`script/smoke-test.sh` is a standalone alternative for verifying wiring on an *already deployed*
chain via live `cast call` reads against `deployments/<chainId>.json`, without re-running the
rest of the demo — useful after a real (non-local) deployment where you just want to confirm the
wiring took: `RPC_URL=<rpc> CHAIN_ID=<chainId> ./script/smoke-test.sh`.
