# Security Model

## Source transaction success is a first-class requirement

Transaction inclusion in a block does not imply successful execution — a reverted transaction
still produces a receipt and can still be included. `AttestcoinVerifier.submitEvidence` treats
these as two independent checks:

1. `blockProver.verify(...)` — is this transaction genuinely *included*, per a real Merkle +
   continuity proof against the BlockProver precompile? (`VerificationFailed` if not.)
2. `ev.sourceTxSuccess` — did it *succeed* (`receipt.status == 1`)? (`SourceTransactionFailed` if
   not.)

Both must hold before any credit-state change happens. See `test/failed-source-transaction.t.sol`
for both paths (verification-fails vs. included-but-reverted) tested independently, and
`relayer/src/verifier.ts` for where `receipt.status` is read off-chain.

## Replay protection

Evidence identity is `keccak256(chainKey, sourceTxHash, logIndex)` — content (merchantId,
amount, eventType) is never part of that identity. `test/duplicate-event.t.sol` specifically
tests that two submissions sharing that identity are rejected even when their claimed content
differs, and that two submissions with genuinely different identity (different tx hash, or same
tx hash with different log index) both succeed independently. See `test/replay.t.sol` for the
baseline replay case.

## Source contract allowlist

Only contracts explicitly registered via `AttestcoinVerifier.registerSourceContract(chainKey,
address)` can have their events accepted, regardless of whether the underlying proof is
otherwise valid. `test/fake-source.t.sol` covers both an unregistered address and a
subsequently-revoked one.

## AI cannot override protocol policy

`PolicyEngine.evaluateBorrow` accepts an `aiRecommendedAmount` parameter purely so callers can
emit/display it — every branch of the function reads only the hard limits
(`maxLoanAmount`, `maxTenorSeconds`, `maxBorrowerExposure`, `minCreditTier`) and real on-chain
state (`availableCredit`, `currentExposure`, `creditTier`, `availableLiquidity`). There is no
code path where a large `aiRecommendedAmount` changes the outcome. `test/malicious-ai.t.sol`
demonstrates the directive's exact scenario: policy max $2,000, AI recommends $50,000, requested
amount at or below the policy max succeeds, above it is rejected with `POLICY_LIMIT_EXCEEDED`
— irrespective of what the AI recommended.

## Least privilege / unauthorized relayer

The relayer (or any other address) has no privileged write path into `CreditPassport`:
`recordVerifiedEvent`, `recordBorrow`, and `recordRepayment` are gated to the registered
`attestcoinVerifier` and `creditLine` contract addresses respectively — never to an EOA, however
trusted. `test/unauthorized-relayer.t.sol` asserts a relayer-controlled address cannot call any
of these directly, and cannot register source contracts (admin-only). The relayer's real power
is limited to assembling and submitting evidence; the contract, not the relayer, decides whether
that evidence is accepted.

## Verified "repayment" events never directly reduce real exposure

This is a design decision worth calling out explicitly: a verified `LoanRepayment` economic
event (from *any* registered source chain) only ever updates history (`successfulRepaymentCount`,
`repaymentVolume`, `repaymentStreak`) — never `currentExposure`. Only an actual on-chain
`CreditLine.repay()` call, which moves real value into `LiquidityPool`, reduces exposure. If
verified repayment *events* directly reduced exposure, an attacker could submit
repayment-shaped evidence from an unrelated (but registered) source contract to zero out real
Kasuwa debt without ever repaying it. `test/CreditPassport.t.sol::test_verifiedLoanRepaymentEvent_doesNotReduceRealExposure`
covers this directly.

## Relayer honesty — event content IS independently re-decoded on-chain

Earlier versions of this document flagged "event content is not independently re-decoded
on-chain" as the single biggest remaining weakness — a relayer could supply a real, verifiable
`encodedTransaction` for a legitimate transaction while separately claiming false
`merchantId`/`eventType`/`amount`/`sourceTxSuccess` values, and the contract had no way to catch
that. **This has been fixed.**

`AttestcoinVerifier.EvidenceInput` no longer has fields for any of those facts. The relayer
supplies only structural proof data — which chain/height/log to check, and the proof for it.
`src/lib/TransactionEvidence.sol` independently decodes `merchantId`, `eventType`, `amount`, and
`sourceTxSuccess` directly from `encodedTransaction` — the same bytes `blockProver.verify`
cryptographically proves were really included — using the real, published encoding format from
`@gluwa/usc-sdk` v0.18.0 (`src/encoding/abi/v1.ts`, read directly from the downloaded npm
package; see `docs/NETWORKS.md`). A relayer that claims the wrong source contract, the wrong log
position, or that a transaction succeeded when it didn't, simply gets a revert
(`SourceContractDidNotEmitThisLog`, `LogIndexOutOfRange`, `UnknownEventSignature`,
`SourceTransactionFailed`) — there is no path from a relayer's claim to a recorded economic fact
without the chain itself having actually contained that fact. See `test/relayer-honesty.t.sol`
for tests proving this directly, and the contract natspec on `AttestcoinVerifier` for the
precise trust-boundary statement.

**Validated against the real SDK, not just self-consistent test fixtures.** In this build, a
real local transaction was emitted, encoded via the actual (unmodified) `@gluwa/usc-sdk`
`encoding.abiEncode`/`encoding.getTransactionWithRaw` functions — not a hand-rolled
reimplementation — and submitted to a live deployed `AttestcoinVerifier`. The on-chain decoder
correctly extracted the real amount (`4200`) from that real SDK-produced blob. See
`docs/DEPLOYMENT.md` for the full reproduction steps and result. This is strong evidence the
decode format assumption is correct; it has NOT been validated against the real Creditcoin
BlockProver precompile's actual verified output, since this sandbox has no network route to one
— see `docs/ANTIGRAVITY_HANDOFF.md` for what real-network validation is still owed.

**Known, stated limitation of the decoder itself:** `TransactionEvidence.decode` reads the first
chunk (common transaction fields) and the last chunk (receipt fields) — identical in position
and layout across all five transaction types (legacy, access-list, EIP-1559, blob,
authorization) per the real encoding format — and never needs to decode the type-specific middle
chunk(s). This means it does NOT need per-transaction-type branching and should work uniformly
regardless of which type the real transaction was. This has been validated for one real,
locally-produced type-2 (EIP-1559) transaction; it has not been separately validated against
real legacy/access-list/blob/authorization-type transactions, though the encoding format read
from the SDK source indicates it should work identically for all of them.

## Other known limitations (stated plainly, not hidden)

- **`ChainInfo` precompile is not yet wired into `AttestcoinVerifier`.** The "source chain
  recognized" check shown conceptually in a Proof Explorer UI (directive section 28) would use
  `PrecompileChainInfoProvider.getSupportedChainByKey` for this; the current contract doesn't
  call it. Not implemented due to time, not because it was judged unnecessary.
- **Reentrancy — fixed, previously mis-judged as low-risk.** An earlier version of this
  document judged `LiquidityPool`'s plain `.call` as low-risk because no external call back into
  the protocol was "expected from a standard EOA or the audited `CreditLine`" — but a *borrower*
  need not be a standard EOA. `CreditLine.borrow` called `liquidityPool.fundCreditLine`
  (an external value transfer to the caller) *before* `creditPassport.recordBorrow` updated
  exposure, so a malicious borrower contract's `receive()` could call `borrow` again while
  `currentExposure` was still stale — bypassing `maxBorrowerExposure` on every re-entrant call,
  bounded only by gas. This is now fixed two ways: `src/lib/ReentrancyGuard.sol` (a minimal,
  dependency-free guard — no OpenZeppelin dependency needed for this) applied via `nonReentrant`
  to `CreditLine.borrow`/`repay` and `LiquidityPool.withdraw`/`fundCreditLine`; and the
  effects/interaction order in `CreditLine.borrow` corrected so `recordBorrow` runs before
  `fundCreditLine` regardless. See `test/reentrancy.t.sol` and `docs/THREAT_MODEL.md`.
