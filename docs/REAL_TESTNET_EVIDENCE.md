# Real Testnet Evidence & Verification Report

## Live public-network status (updated 2026-09-06)

All 7 contracts of the Kasuwa stack are now live and independently verified on public testnets —
no local-only or in-progress components remain. Every address below was checked directly against
Blockscout (CC3) or Etherscan (Sepolia): `is_contract: true`, `creation_status: success`.

| Contract | Network | Address | Verified how |
|---|---|---|---|
| `EconomicEvents.sol` | Ethereum Sepolia (`11155111`) | `0x84780ab03db7A3FebFdb789De402314F202D8263` | Confirmed on Etherscan: real contract, real transactions, deployed by `0x73af91CE084D84Ccdd6613D5B135EB10549C4616` |
| `AttestcoinVerifier.sol` | Creditcoin CC3 testnet (`102031`) | `0x8Fd160D9E7617a9C47d6c2824A425DB823cdc1C2` | Confirmed on Blockscout: `is_contract: true`, `creation_status: success` |
| `CreditPassport.sol` | Creditcoin CC3 testnet (`102031`) | `0x9DbaD85c6eBFA90fD4634deE08020Bb95a80942d` | Confirmed on Blockscout: `is_contract: true`, `creation_status: success` |
| `CreditEngine.sol` | Creditcoin CC3 testnet (`102031`) | `0xcc364e6D87146abBdB47ebaAAe964f7d447E4875` | Confirmed on Blockscout: `is_contract: true`, `creation_status: success` |
| `PolicyEngine.sol` | Creditcoin CC3 testnet (`102031`) | `0x30b7A70b4fA0Be2F3eD2ef7551c4890A481Ef047` | Confirmed on Blockscout: `is_contract: true`, `creation_status: success` |
| `CreditLine.sol` | Creditcoin CC3 testnet (`102031`) | `0x3ed53F226dd8f46451E3e5D418b25Be7889fd49e` | Confirmed on Blockscout: `is_contract: true`, `creation_status: success` |
| `LiquidityPool.sol` | Creditcoin CC3 testnet (`102031`) | `0xB89E9A2D42BbE6Ffd7Dca9b8f225d4A43C219AF8` | Confirmed on Blockscout: `is_contract: true`, `creation_status: success` |

All seven contracts were deployed from the same wallet, `0x73af91CE084D84Ccdd6613D5B135EB10549C4616`,
on both chains — one coordinated cross-chain deployment, not disconnected demos. Full addresses
are also committed in the repo at `deployments/102031.json` and `deployments/11155111.json`, and
raw relayer/attestation evidence (real tx hashes, relayer job state) is in
`docs/REAL_TESTNET_EVIDENCE.generated.md`, so this table can be cross-checked without taking our
word for it.

Real source and evidence-verification transactions from this deployment:
- Source tx (Sepolia): [`0x30e8780988f6641a8e426d315d16179f60556572a83540b7ed79fbdfab356fe0`](https://sepolia.etherscan.io/tx/0x30e8780988f6641a8e426d315d16179f60556572a83540b7ed79fbdfab356fe0)
- Relayer-observed source tx (Sepolia): [`0xacb4856a667a29e5fa92f898f5e273d62a3cb951b0e23e0a6439fe6aed6a4321`](https://sepolia.etherscan.io/tx/0xacb4856a667a29e5fa92f898f5e273d62a3cb951b0e23e0a6439fe6aed6a4321)

**Important correction**: an earlier internal report listed `CreditFacility` and `CreditScoreOracle`
addresses on CC3 that turned out, on independent verification, to be the **local Anvil (chain
`31337`)** addresses in the section below, mislabeled as CC3. Nothing in this file states an
address is live on a public network unless it has been checked directly against that network's
block explorer.

## Local Verification & Security Audit Results

### 1. Security Audit Matrix (45/45 Foundry tests across 13 suites)

All 45 smart contract tests pass in Foundry against a sandboxed EVM, including 4 dedicated
reentrancy-attack tests (`test/reentrancy.t.sol`) added after an internal threat-model review
found and fixed a real reentrancy exposure in `CreditLine.borrow()`:

| Suite | Tests | Result | Invariant Covered |
|---|---|---|---|
| `RelayerHonestyTest` | 8/8 | **PASS** | Independent on-chain decoding of receipt status, merchantId, eventType, volume; deterministic rejection of empty chunks, malformed bytes, insufficient topics, wrong emitters |
| `PolicyEngineTest` | 6/6 | **PASS** | Hard bounds, pause controls, deterministic rules |
| `CreditEngineTest` | 9/9 | **PASS** | Mathematical capacity formula, streak bonuses, missed penalties, fuzzing |
| `CreditPassportTest` | 3/3 | **PASS** | State tracking, isolation of repayment events from debt reduction |
| `FailedSourceTransactionTest` | 2/2 | **PASS** | Reverted source transactions cannot increase capacity |
| `FakeSourceTest` | 2/2 | **PASS** | Unregistered and revoked source contracts rejected |
| `MaliciousAiTest` | 2/2 | **PASS** | AI recommendations ($50k) strictly advisory, hard policy limits ($2k) enforced |
| `UnauthorizedRelayerTest` | 3/3 | **PASS** | Relayers cannot call privileged write methods |
| `DuplicateEventTest` | 3/3 | **PASS** | Exact replay rejected, distinct events with identical content succeed |
| `OverLimitTest` | 2/2 | **PASS** | Borrows exceeding capacity or liquidity rejected |
| `ReplayTest` | 1/1 | **PASS** | Evidence consumption prevents double-execution |
| `DeploymentSmokeTest` | 1/1 | **PASS** | Multi-contract permission wiring and admin setup |
| `ReentrancyTest` | 4/4 | **PASS** | Reentrant borrow/withdraw attacks blocked by `ReentrancyGuard` + checks-effects-interactions |

### 2. Local Vertical Slice Execution Evidence (chain 31337, Anvil)

This full walkthrough — deploy, real source tx, evidence verification, capacity update, borrow,
and four live attack rejections — was run end-to-end against a local Anvil chain before the CC3
deployment above. These addresses are **local-only**, not to be confused with the CC3 table:

- **Chain ID**: `31337` (Anvil Local EVM)
- **Deployed Contracts**:
  - `MockBlockProver`: `0x5FbDB2315678afecb367f032d93F642f64180aa3`
  - `AttestcoinVerifier`: `0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0`
  - `CreditPassport`: `0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9`
  - `CreditEngine`: `0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512`
  - `PolicyEngine`: `0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9`
  - `LiquidityPool`: `0x5FC8d32690cc91D4c39d9d3abcBD16989F875707`
  - `CreditLine`: `0x0165878A594ca255338adfa4d48449f69242Eb8F`
  - `EconomicEvents`: `0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e`
- **Real Source Tx**: `0x5ffa2b3538ef229702e82fa4d73d2af260650b7865330a5684883854a2e18933` (Block `8`, emitted `PaymentSettled(750)`)
- **Real SDK Encoding**: 3,522 hex chars generated via `@gluwa/usc-sdk` v0.18.0 `abiEncode`
- **Evidence Verification Tx**: `0x74ef60fe4b1b10e5abcee05932a04e4944052fa08da405d59d433980aebe969d` (Status `0x1`)
- **Credit Capacity**: Before: `0` -> After: `75` (`750 / 10`)
- **Borrow Tx**: Exposure increased from `0` to `50`
- **Security Lab 4 Attack Rejections**:
  1. Replay Attack: Reverted with selector `0xae5c42ee` (`EvidenceAlreadyConsumed()`)
  2. Fake Source Contract: Reverted with selector `0xd1ec97f1` (`SourceContractMismatch()`)
  3. Reverted Source Tx: Blocked at source (0 emitted logs)
  4. Malicious AI Recommendation ($50,000): Reverted with selector `0x3777de94` (`BorrowRejected` with reason `POLICY_LIMIT_EXCEEDED`)
