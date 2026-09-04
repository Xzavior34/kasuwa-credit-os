// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {KasuwaTestBase} from "./helpers/KasuwaTestBase.sol";
import {AttestcoinVerifier} from "../src/AttestcoinVerifier.sol";
import {CreditLine} from "../src/CreditLine.sol";
import {PolicyEngine} from "../src/PolicyEngine.sol";

/// INVARIANT: Borrowing cannot exceed available capacity.
/// INVARIANT: Borrowing cannot exceed pool liquidity.
contract OverLimitTest is KasuwaTestBase {
    function setUp() public {
        setUpKasuwa();
    }

    function test_borrowExceedingAvailableCapacity_isRejected() public {
        bytes32 merchantId = bytes32("merchant-1");
        // Small amount of verified activity -> small capacity, well under the $2,000 policy cap.
        AttestcoinVerifier.EvidenceInput memory ev =
            buildEvidence(merchantId, 0, 500, true, sourceContract, sourceContract); // capacity = 50
        vm.prank(relayer);
        verifier.submitEvidence(ev);

        uint256 capacity = passport.getCreditCapacity(merchantId);
        assertTrue(capacity < 2_000);

        vm.prank(merchantEOA);
        vm.expectRevert(
            abi.encodeWithSelector(CreditLine.BorrowRejected.selector, PolicyEngine.RejectionReason.INSUFFICIENT_CREDIT_CAPACITY)
        );
        creditLine.borrow(merchantId, capacity + 1, 7 days, 0);
    }

    function test_borrowExceedingPoolLiquidity_isRejected() public {
        bytes32 merchantId = bytes32("merchant-1");
        // Enough verified activity for capacity=4000 (activityContribution capped at 4000),
        // comfortably within the default policy caps (maxLoanAmount=2000, maxBorrowerExposure=2000)
        // for the actual amount we request below — only capacity/tier need to clear, not the
        // full $4000, since the borrow itself is well under the $2000 policy ceiling anyway.
        AttestcoinVerifier.EvidenceInput memory ev =
            buildEvidence(merchantId, 0, 100_000, true, sourceContract, sourceContract);
        vm.prank(relayer);
        verifier.submitEvidence(ev);
        assertEq(passport.getCreditCapacity(merchantId), 4_000);

        // Drain the pool down to 50 wei of available liquidity so the requested amount clears
        // the capacity/exposure/tier checks but fails specifically on liquidity.
        vm.prank(lp);
        pool.withdraw(10 ether - 50);
        assertEq(pool.availableLiquidity(), 50);

        vm.prank(merchantEOA);
        vm.expectRevert(
            abi.encodeWithSelector(CreditLine.BorrowRejected.selector, PolicyEngine.RejectionReason.INSUFFICIENT_LIQUIDITY)
        );
        creditLine.borrow(merchantId, 500, 7 days, 0);
    }
}
