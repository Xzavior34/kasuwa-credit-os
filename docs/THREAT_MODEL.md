# Threat Model

For each threat: what the protocol does about it, and where that's tested.

| Threat | Mitigation | Test |
|---|---|---|
| Replay of already-consumed evidence | `evidenceConsumed[evidenceId]` mapping, checked before any state change | `test/replay.t.sol`, `test/duplicate-event.t.sol` |
| Relayer forging economic-event content (merchantId/eventType/amount/success) while supplying a real proof | Content is derived on-chain from `encodedTransaction` by `TransactionEvidence.decode`, never taken as relayer input | `test/relayer-honesty.t.sol` |
| Source spoofing (fake/unregistered emitter) | `registeredSourceContracts[chainKey][address]` allowlist, admin-gated | `test/fake-source.t.sol` |
| Failed source transactions counted as successful | Explicit `sourceTxSuccess` check separate from inclusion proof | `test/failed-source-transaction.t.sol` |
| Malformed/invalid proof data | Delegated entirely to the real BlockProver precompile's `verify()` — this contract has no fallback path that accepts unverified data | `test/failed-source-transaction.t.sol::test_verificationItself_failing_isRejectedSeparately` |
| Unauthorized admin actions | `onlyAdmin` modifier on all privileged setters (`registerSourceContract`, `pause`, `setLimits`, etc.) | `test/PolicyEngine.t.sol::test_onlyAdminCanPauseOrChangeLimits`, `test/unauthorized-relayer.t.sol` |
| Reentrancy | Fixed. `src/lib/ReentrancyGuard.sol` (minimal, dependency-free) applied via `nonReentrant` to every function that makes a native-value external call: `CreditLine.borrow`/`repay`, `LiquidityPool.withdraw`/`fundCreditLine`. `CreditLine.borrow` also had its effects/interaction order corrected — `recordBorrow` (exposure update) now runs *before* `fundCreditLine` (the value transfer), not after, closing a real bypass of `maxBorrowerExposure` that a malicious borrower's `receive()` could otherwise exploit during the funding callback. | `test/reentrancy.t.sol` (4 tests: blocked reentrant borrow, exposure recorded exactly once, blocked reentrant withdraw, LP balance debited exactly once) |
| Integer overflow/underflow | Solidity 0.8.24 has built-in overflow checks; explicit underflow guards in `CreditEngine` (`missedPenalty >= raw ? 0 : raw - missedPenalty`) and `CreditPassport`/`LiquidityPool` exposure/balance arithmetic | `test/CreditEngine.t.sol::test_missedPenaltyCannotUnderflowBelowZero`, fuzz test `testFuzz_capacityAlwaysWithinBounds` |
| Stale proof / proof for wrong chain or height | `chainKey`/`height` are explicit arguments to `blockProver.verify`, not inferred | Implicit in `test/fake-source.t.sol` scenarios; not separately fuzzed for arbitrary chainKey/height combinations — gap |
| Duplicate events (content-level, not identity-level) | Explicitly *not* deduplicated by content — only by `(chainKey, sourceTxHash, logIndex)` identity, which is the cryptographically meaningful unit | `test/duplicate-event.t.sol` |
| Front-running a borrow/repay | Not specifically mitigated; PolicyEngine's checks are deterministic given on-chain state at execution time, so a front-run borrow just consumes capacity/liquidity first-come-first-served — no MEV-specific protection is claimed | Not tested — out of scope for this MVP |
| Liquidity exhaustion | `PolicyEngine.evaluateBorrow` checks `requestedAmount > availableLiquidity` as the final gate | `test/over-limit.t.sol::test_borrowExceedingPoolLiquidity_isRejected` |
| Excessive borrower exposure | `currentExposure + requestedAmount > maxBorrowerExposure` check | `test/PolicyEngine.t.sol`, exercised indirectly in `test/malicious-ai.t.sol` |
| Malicious AI recommendations | `aiRecommendedAmount` is inert to the decision — see Security Model | `test/malicious-ai.t.sol` |
| Oracle/attestation assumptions | Attestation state (whether a source height is "attested") is assumed correct as reported by Creditcoin's ChainInfo precompile once wired in; not independently re-verified by this contract. Not yet wired in this MVP — see Security Model limitations. | N/A yet |
| Relayer censorship | Any address can call `submitEvidence` — it is not relayer-gated. A censoring relayer can be replaced by anyone else running the same open relayer code against the same public proof-builder service. | Implicit in permissionless `submitEvidence`; not load-tested |
| Relayer restart / duplicate submission | On-chain `evidenceConsumed` is the actual source of truth; the relayer's local JSON job store (`relayer/src/state.ts`) is a convenience/observability layer only — see comments in that file | Not covered by an automated test in this MVP (would require simulating a relayer crash mid-submission) — gap |
| Pause / emergency controls | `PolicyEngine.pause()`/`unpause()` blocks new borrows; does not touch existing accounting or verified evidence recording (verification/history-building is independent of the pause) | `test/PolicyEngine.t.sol::test_pausedProtocol_rejectsAllBorrows` |

## Honest gaps (not swept under the rug)

- Reentrancy is now guarded and tested (`test/reentrancy.t.sol`), but the new tests were verified by direct
  code review and a standalone `solc` compile of `src/` (both new/edited contracts compile cleanly) —
  this pass could not reach a Foundry toolchain install (network egress to Foundry's installer and to
  `binaries.soliditylang.org` is blocked in this environment), so `forge test -vv` has not actually been
  re-run since this change. Run it before relying on this for a submission.
- No fuzzing across arbitrary `chainKey`/`height` combinations for the verifier.
- No simulated relayer-crash-mid-submission test (the design should be safe per the "on-chain is
  authoritative" principle, but this isn't demonstrated by an automated test yet).
- The on-chain transaction-content decoder (`TransactionEvidence.sol`) has been validated
  against one real, locally-produced transaction encoded via the actual `@gluwa/usc-sdk`, but not
  against the real Creditcoin BlockProver precompile's own verified output, nor against every
  transaction type (only EIP-1559/type-2 has been exercised with real data) — see
  `docs/SECURITY_MODEL.md` "Relayer honesty" and `docs/ANTIGRAVITY_HANDOFF.md`.
