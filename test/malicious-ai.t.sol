// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {KasuwaTestBase} from "./helpers/KasuwaTestBase.sol";
import {AttestcoinVerifier} from "../src/AttestcoinVerifier.sol";
import {CreditLine} from "../src/CreditLine.sol";
import {PolicyEngine} from "../src/PolicyEngine.sol";

/// INVARIANT: AI cannot exceed protocol limits.
/// Scenario from the directive: policy maximum is $2,000 (PolicyEngine.maxLoanAmount), an AI
/// recommends $50,000. Expected: REJECTED, reason POLICY_LIMIT_EXCEEDED. The AI recommendation
/// never reaches fund-transfer logic — it is display-only data threaded through for the UI.
contract MaliciousAiTest is KasuwaTestBase {
    function setUp() public {
        setUpKasuwa();
    }

    function _giveMerchantCapacity(bytes32 merchantId) internal {
        // Verify enough economic activity to comfortably exceed the $2,000 policy cap, so the
        // rejection we observe is unambiguously the POLICY limit, not a capacity shortfall.
        AttestcoinVerifier.EvidenceInput memory ev =
            buildEvidence(merchantId, 0, 100_000, true, sourceContract, sourceContract);
        vm.prank(relayer);
        verifier.submitEvidence(ev);
    }

    function test_aiRecommendationOf50000_isBlockedByPolicyLimitOf2000() public {
        bytes32 merchantId = bytes32("merchant-1");
        _giveMerchantCapacity(merchantId);
        assertEq(policy.maxLoanAmount(), 2_000);

        uint256 requestedAmount = 2_000; // merchant actually requests exactly the policy max
        uint256 aiRecommendedAmount = 50_000; // AI recommends 25x the protocol limit

        vm.prank(merchantEOA);
        vm.expectEmit(true, false, false, true, address(creditLine));
        emit CreditLine.BorrowBlocked(merchantId, 2_001, aiRecommendedAmount, PolicyEngine.RejectionReason.POLICY_LIMIT_EXCEEDED);
        vm.expectRevert(abi.encodeWithSelector(CreditLine.BorrowRejected.selector, PolicyEngine.RejectionReason.POLICY_LIMIT_EXCEEDED));
        creditLine.borrow(merchantId, 2_001, 7 days, aiRecommendedAmount);

        // The legitimate amount, still carrying the same wild AI recommendation alongside it,
        // succeeds — proving the recommendation itself is inert to the outcome.
        vm.prank(merchantEOA);
        creditLine.borrow(merchantId, requestedAmount, 7 days, aiRecommendedAmount);
        assertEq(creditLine.getCurrentExposure(merchantId), requestedAmount);
    }

    function test_evaluateBorrow_ignoresAiRecommendedAmountEntirely() public view {
        (bool allowedLowAi,) = policy.evaluateBorrow(1_500, 7 days, 5_000, 0, 2, 10 ether, 0);
        (bool allowedHighAi,) = policy.evaluateBorrow(1_500, 7 days, 5_000, 0, 2, 10 ether, 50_000);
        assertEq(allowedLowAi, allowedHighAi);
    }
}
