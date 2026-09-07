# Kasuwa Credit OS — Adversarial Verification Matrix

This document provides independent auditors and hackathon judges with the complete cryptographic and smart contract verification matrix for adversarial attack vectors against the **Kasuwa Credit OS** protocol.

Kasuwa is designed with strict **relayer untrusted delivery semantics**: the relayer supplies only raw bytes and Merkle paths; all semantic facts (event type, merchant identity, turnover volume, transaction success) are derived directly on-chain via `TransactionEvidence.sol` and verified against Creditcoin's native `BlockProver` precompile (`0x0000000000000000000000000000000000000FD2`).

---

## 1. Adversarial Attack Verification Matrix

| # | Attack Vector | Attacker Payload / Strategy | Enforcing Smart Contract | On-Chain Error Selector | Invariant Test Suite |
|---|---|---|---|---|---|
| **01** | **Replay / Double-Credit** | Relayer submits identical source proof twice to inflate credit capacity | `AttestcoinVerifier.sol` (`evidenceConsumed` mapping) | `EvidenceAlreadyConsumed()` (`0xae5c42ee`) | `test/replay.t.sol`, `test/duplicate-event.t.sol` |
| **02** | **Spoofed / Unregistered Source** | Malicious contract emits payment events; relayer attempts to verify them | `AttestcoinVerifier.sol` (`registeredSourceContracts`) | `SourceContractMismatch()` (`0x6e9f1345`) | `test/fake-source.t.sol` |
| **03** | **Relayer Emitter Substitution** | Real proof submitted, but relayer claims it came from another registered source | `TransactionEvidence.sol` (emitter check) | `SourceContractDidNotEmitThisLog()` | `test/relayer-honesty.t.sol` |
| **04** | **Reverted Source Transaction** | Transaction failed on Sepolia (EIP-658 `status = 0`); relayer tries to claim capacity | `TransactionEvidence.sol` & `AttestcoinVerifier.sol` | `SourceTransactionFailed()` (`0xc60cdba1`) | `test/failed-source-transaction.t.sol` |
| **05** | **AI Parameter Jailbreak** | Compromised off-chain AI advises a $50,000 borrow to drain liquidity | `PolicyEngine.sol` & `CreditLine.sol` | `BorrowRejected(uint8)` (`0x3777de94`) | `test/malicious-ai.t.sol` |
| **06** | **Over-Limit Borrow Attempt** | Merchant requests amount exceeding calculated capacity or pool balance | `CreditLine.sol` & `LiquidityPool.sol` | `CapacityExceeded()` / `PoolLiquidityExceeded()` | `test/over-limit.t.sol` |
| **07** | **Reentrancy Drainage** | Malicious receiver contract calls back into `borrow()` during transfer | `ReentrancyGuard.sol` & CEI ordering in `CreditLine.sol` | `ReentrancyGuardReentrantCall()` | `test/reentrancy.t.sol` |
| **08** | **Fake Loan Repayment Event** | Verified source repayment event used to wipe out real Creditcoin debt | `CreditPassport.sol` (State separation) | Handled by state isolation (repay history != on-chain debt relief) | `test/CreditPassport.t.sol` |

---

## 2. Canonical Rails: Standard ERC-20 & Circle USDC Ingestion

Unlike toy prototypes that rely on custom mock event emitters, Kasuwa natively decodes **canonical ERC-20 `Transfer(address,address,uint256)`** events on Ethereum Sepolia:

- **Canonical Sepolia Circle USDC**: [`0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`](https://sepolia.etherscan.io/address/0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238)
- **ERC-20 Transfer Event Signature**: `0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef`
- **On-Chain Extraction**:
  - `merchantId`: Extracted from `topics[2]` (recipient merchant address).
  - `amount`: Extracted from 32-byte `data` payload.
  - `sourceTxSuccess`: Verified via EIP-658 receipt chunk status.

**Test Proof**: `test/circle-usdc-and-composability.t.sol` passes with 0 gas failures:
```bash
[PASS] test_circleUsdcTransfer_verifiesAndIncreasesMerchantCapacity() (gas: 226473)
```

---

## 3. The "Credit OS" Composability Proof

To demonstrate why Kasuwa is an **Operating System** and not merely a lending application, third-party protocols can gate their own services directly against `CreditPassport`:

```solidity
// From src/examples/SupplierB2BMarketplace.sol
function checkoutInventory(bytes32 merchantId, uint256 invoiceAmount) external {
    uint256 available = passport.getAvailableCredit(merchantId);
    uint8 tier = passport.getCreditTier(merchantId);

    require(tier >= 2, "SupplierB2B: Merchant must be at least Tier 2");
    require(invoiceAmount <= available, "SupplierB2B: Order exceeds available credit capacity");

    // Release inventory on 30-day net terms...
    emit InventoryDispatched(merchantId, invoiceAmount, available - invoiceAmount);
}
```

**Test Proof**:
```bash
[PASS] test_thirdPartyB2BMarketplace_composesWithCreditPassport() (gas: 303466)
```

---

## 4. Test Suite Summary

- **Total Invariant Suites**: 14
- **Total Tests**: 47 passed, 0 failed, 0 skipped
- **Reproduce Locally**:
  ```bash
  forge test -vv
  ```
