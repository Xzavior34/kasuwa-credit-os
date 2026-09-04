// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {KasuwaTestBase} from "./helpers/KasuwaTestBase.sol";
import {AttestcoinVerifier} from "../src/AttestcoinVerifier.sol";

contract CreditPassportTest is KasuwaTestBase {
    function setUp() public {
        setUpKasuwa();
    }

    function test_verifiedPaymentIncreasesCapacityAndIsInspectable() public {
        bytes32 merchantId = bytes32("merchant-1");
        AttestcoinVerifier.EvidenceInput memory ev =
            buildEvidence(merchantId, 0, 750, true, sourceContract, sourceContract);

        vm.prank(relayer);
        verifier.submitEvidence(ev);

        (uint256 eventCount, uint256 volume) = passport.getVerifiedEconomicActivity(merchantId);
        assertEq(eventCount, 1);
        assertEq(volume, 750);
        assertEq(passport.getCreditCapacity(merchantId), 75); // 750 / 10
    }

    function test_missedObligation_resetsStreakAndPenalizesCapacity() public {
        bytes32 merchantId = bytes32("merchant-1");

        AttestcoinVerifier.EvidenceInput memory repay1 =
            buildEvidence(merchantId, 2, 100, true, sourceContract, sourceContract);
        vm.prank(relayer);
        verifier.submitEvidence(repay1);

        (,, uint256 streakBefore,) = passport.getRepaymentHistory(merchantId);
        assertEq(streakBefore, 1);

        AttestcoinVerifier.EvidenceInput memory missed =
            buildEvidence(merchantId, 3, 200, true, sourceContract, sourceContract);
        vm.prank(relayer);
        verifier.submitEvidence(missed);

        (,, uint256 streakAfter, uint256 missedCount) = passport.getRepaymentHistory(merchantId);
        assertEq(streakAfter, 0);
        assertEq(missedCount, 1);
    }

    function test_verifiedLoanRepaymentEvent_doesNotReduceRealExposure() public {
        // Security invariant: a verified "LoanRepayment" economic event describes history —
        // it must NEVER by itself reduce this protocol's real exposure. Only CreditLine.repay()
        // (which moves real funds into LiquidityPool) may do that.
        bytes32 merchantId = bytes32("merchant-1");

        AttestcoinVerifier.EvidenceInput memory activity =
            buildEvidence(merchantId, 0, 100_000, true, sourceContract, sourceContract);
        vm.prank(relayer);
        verifier.submitEvidence(activity);

        vm.prank(merchantEOA);
        creditLine.borrow(merchantId, 1_000, 7 days, 0);
        assertEq(passport.getCurrentExposure(merchantId), 1_000);

        AttestcoinVerifier.EvidenceInput memory verifiedRepayment =
            buildEvidence(merchantId, 2, 1_000, true, sourceContract, sourceContract);
        vm.prank(relayer);
        verifier.submitEvidence(verifiedRepayment);

        // Exposure is unchanged — the verified event only improved history/streak, not exposure.
        assertEq(passport.getCurrentExposure(merchantId), 1_000);

        vm.deal(merchantEOA, 1_000);
        vm.prank(merchantEOA);
        creditLine.repay{value: 1_000}(merchantId, 1_000);
        assertEq(passport.getCurrentExposure(merchantId), 0);
    }
}
