# Demo

## What "demo" means here, precisely

`EconomicEvents.sol` is a standalone contract that lets anyone call
`emitPaymentSettled`/`emitRevenueRecorded`/`emitLoanRepayment`/`emitObligationMissed` to produce
source-chain events on demand, plus `emitPaymentThatReverts` to deliberately produce an
included-but-failed transaction for testing the security path. This is explicitly a test
harness — Kasuwa does **not** currently claim a real integration with any specific
Nigerian or other emerging-market payment provider. The persona used in narrative material
("an Aba electronics merchant") describes the target use case, not a claimed existing
integration; any demo run uses "testnet economic activity modeled on an emerging-market
merchant," not real merchant data.

## Reproducing the tested (non-network) flow locally

```bash
forge install foundry-rs/forge-std --no-commit
forge build
forge test -vv
```

This runs the full contract suite (42 tests, 12 suites) against a `MockBlockProver` test double
in place of the real Creditcoin precompile — see `docs/SECURITY_MODEL.md` for exactly why, and
`docs/NETWORKS.md` for the real precompile addresses this mock stands in for.

## The full local vertical slice (real transactions, local chain)

```bash
# PowerShell (Windows)
powershell -ExecutionPolicy Bypass -File demo/run_local_vertical_slice.ps1

# Bash (Linux/macOS)
bash demo/run_local_vertical_slice.sh
```

## Running the Web Frontend Application

To launch the local Anvil EVM node, deploy the verified contracts, seed sample merchant data, and host the institutional web application:

```bash
# PowerShell (Windows)
powershell -ExecutionPolicy Bypass -File demo/start_local_environment.ps1
```

Once running, navigate to `http://localhost:3000` in your web browser.

The web application features:
1. **Overview**: Real-time capacity utilization gauge, credit health scorecard, and 7-step interactive lifecycle pipeline.
2. **Credit Passport**: Persistent on-chain economic identity with verified activity timeline.
3. **Capacity Engine**: Deterministic mathematical formula display and live evaluation breakdown.
4. **Credit Line**: Programmatic borrow facility governed by `PolicyEngine.sol` with Risk Advisor (`ADVISORY ONLY`) guardrail demonstration.
5. **Proof Explorer**: 5-stage cryptographic trace pipeline from source transaction to on-chain state with deep technical inspector.
6. **Economic Activity**: Single-click source event emitter and evidence submitter.
7. **Security Lab**: 4 live interactive attack consoles demonstrating on-chain custom error reverts.
8. **Developer API**: Live interface and interactive RPC query terminal.
9. **Settings**: Instant switching between Local Anvil (`31337`) and Creditcoin CC3 Testnet (`102031`).

