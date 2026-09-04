# Architecture

## Core loop

```
ECONOMIC ACTIVITY (source chain)
  -> SOURCE-CHAIN EVENT (EconomicEvents.sol)
  -> RELAYER detects, confirms receipt.status, waits for attestation, builds proof (@gluwa/usc-sdk)
  -> ATTESTCOIN VERIFICATION (AttestcoinVerifier.sol, real BlockProver precompile)
  -> CREDIT PASSPORT (CreditPassport.sol) records the verified event
  -> CREDIT ENGINE (CreditEngine.sol) recomputes deterministic capacity
  -> POLICY ENGINE (PolicyEngine.sol) is consulted at borrow time — independent of AI
  -> CREDIT LINE (CreditLine.sol) executes borrow/repay against LiquidityPool
  -> CREDIT CAPACITY EVOLVES with each new verified event or repayment
```

AI sits beside PolicyEngine, not inside the trust root:

```
AI recommendation (off-chain, advisory)
        |
        v
PolicyEngine (on-chain, deterministic)
        |
        v
   ALLOW / REJECT
```

## Contracts

- `EconomicEvents.sol` — demo/test source-chain event emitter (see docs/DEMO.md for why this is
  explicitly a harness, not a claimed production payment-rail integration)
- `AttestcoinVerifier.sol` — the trust boundary. Verifies inclusion via the real BlockProver
  precompile, allowlists source contracts, enforces replay protection, then hands off to
  `src/lib/TransactionEvidence.sol` to independently DERIVE merchantId/eventType/amount/
  sourceTxSuccess from the proven bytes — the relayer supplies no semantic claims about what
  happened, only which chain/height/log to check. See docs/SECURITY_MODEL.md "Relayer honesty".
- `CreditPassport.sol` — inspectable per-merchant state; the reusable credit-state product.
  Read-only developer API for other Creditcoin applications to consume (`docs/API.md`)
- `CreditEngine.sol` — pure, deterministic, documented formula converting history into capacity
- `PolicyEngine.sol` — deterministic hard limits; the sole authority over whether a borrow is
  allowed
- `CreditLine.sol` — borrow/repay orchestration; calls PolicyEngine, then CreditPassport and
  LiquidityPool
- `LiquidityPool.sol` — minimal single-pool liquidity (deposit/withdraw/fundCreditLine/receiveRepayment)

## A specific design decision worth flagging

Verified `LoanRepayment` *events* (economic history from a source chain) and actual on-chain
*repayment* (`CreditLine.repay()`, moving real value) are deliberately different things with
different effects: the former only ever improves history/streak, the latter is the only thing
that reduces `currentExposure`. See `docs/SECURITY_MODEL.md` for why conflating them would be a
real vulnerability.

## Relayer (`relayer/`)

`watcher.ts` ties together `verifier.ts` (fetches the real receipt — used only to translate a
block-relative log index to the per-transaction index AttestcoinVerifier expects; it no longer
decides success/failure, since the contract derives that itself), `proof-builder.ts` (thin
wrapper around the real `@gluwa/usc-sdk` `PrecompileChainInfoProvider`/`ProofBuilder`),
`executor.ts` (submits to `AttestcoinVerifier.submitEvidence` — now a 7-field, purely structural
payload with no semantic claims), `retry.ts` (exponential backoff, distinguishing permanent vs.
temporary failures), and `state.ts` (idempotent job-state
persistence — see that file's comments on why on-chain `evidenceConsumed` remains the actual
authority, not the relayer's local bookkeeping). `health.ts` exposes `GET /health` and
`GET /status/:jobId`.

## What's not built yet

Frontend (Proof Explorer, Security Lab, dashboard), deployment scripts, and real testnet
evidence — see `docs/IMPLEMENTATION_AUDIT.md` for exactly why and what's needed to finish them.
