// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {KasuwaTestBase} from "./helpers/KasuwaTestBase.sol";
import {AttestcoinVerifier} from "../src/AttestcoinVerifier.sol";

/// Distinguishes "replay" (the same underlying transaction+log submitted twice) from
/// "duplicate-looking event" (different, genuinely distinct transactions that happen to
/// describe similar economic activity). Evidence identity is
/// keccak256(chainKey, keccak256(encodedTransaction), logIndex) — since merchantId/eventType/
/// amount are now DERIVED from encodedTransaction rather than separately claimed (see
/// docs/SECURITY_MODEL.md), there is no longer any way to submit "the same underlying evidence"
/// while claiming different content — content and identity are the same proven bytes.
contract DuplicateEventTest is KasuwaTestBase {
    function setUp() public {
        setUpKasuwa();
    }

    function test_genuinelyDifferentEvidence_withSimilarContent_bothSucceed() public {
        bytes32 merchantId = bytes32("merchant-1");

        // Same merchant/eventType/amount, but nonceSalt makes clear these represent two
        // genuinely different real transactions (exactly as two real payments of the same
        // amount would naturally differ in nonce/gas/etc even with identical claimed amounts).
        AttestcoinVerifier.EvidenceInput memory ev1 =
            buildEvidenceWithSalt(merchantId, 0, 500, true, sourceContract, sourceContract, 1);
        AttestcoinVerifier.EvidenceInput memory ev2 =
            buildEvidenceWithSalt(merchantId, 0, 500, true, sourceContract, sourceContract, 2);

        vm.prank(relayer);
        bytes32 id1 = verifier.submitEvidence(ev1);
        vm.prank(relayer);
        bytes32 id2 = verifier.submitEvidence(ev2);

        assertTrue(id1 != id2);
        (uint256 eventCount,) = passport.getVerifiedEconomicActivity(merchantId);
        assertEq(eventCount, 2); // both counted — these are two genuine, distinct events
    }

    function test_sameTransactionDifferentLogIndex_areDistinctEvidence() public {
        // One real transaction that emitted TWO different economic events (e.g. a payment and a
        // separate revenue record in the same tx) — each log is legitimately distinct evidence.
        AttestcoinVerifier.EvidenceInput memory evLog0 = buildEvidenceForLogAt(
            bytes32("merchant-1"), 0, 500, bytes32("merchant-2"), 1, 300, sourceContract, 0
        );
        AttestcoinVerifier.EvidenceInput memory evLog1 = buildEvidenceForLogAt(
            bytes32("merchant-1"), 0, 500, bytes32("merchant-2"), 1, 300, sourceContract, 1
        );

        vm.prank(relayer);
        verifier.submitEvidence(evLog0);
        vm.prank(relayer);
        verifier.submitEvidence(evLog1); // does not revert — different logIndex, different evidenceId

        (uint256 count1,) = passport.getVerifiedEconomicActivity(bytes32("merchant-1"));
        (uint256 count2,) = passport.getVerifiedEconomicActivity(bytes32("merchant-2"));
        assertEq(count1, 1);
        assertEq(count2, 1);
    }

    function test_exactSameUnderlyingTransactionSubmittedTwice_isRejected() public {
        // Even if two different callers (or the same caller twice) submit the literal same
        // proven bytes, the second submission is rejected — replay protection is tied to the
        // proven content's identity, not to who calls submitEvidence or when.
        bytes32 merchantId = bytes32("merchant-1");
        AttestcoinVerifier.EvidenceInput memory ev =
            buildEvidence(merchantId, 0, 500, true, sourceContract, sourceContract);

        vm.prank(relayer);
        verifier.submitEvidence(ev);

        address anotherCaller = address(0x9999);
        vm.prank(anotherCaller);
        vm.expectRevert(AttestcoinVerifier.EvidenceAlreadyConsumed.selector);
        verifier.submitEvidence(ev);
    }
}
