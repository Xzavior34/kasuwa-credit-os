// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CreditEngine} from "../src/CreditEngine.sol";

contract CreditEngineTest is Test {
    CreditEngine internal engine;

    function setUp() public {
        engine = new CreditEngine();
    }

    function test_zeroHistory_zeroCapacity() public view {
        assertEq(engine.computeCapacity(0, 0, 0, 0, 0), 0);
    }

    function test_positivePaymentVolume_increasesCapacity() public view {
        uint256 capacity = engine.computeCapacity(1_000, 0, 0, 0, 0);
        assertEq(capacity, 100); // 1000 / ACTIVITY_DIVISOR(10) = 100
    }

    function test_repayments_increaseCapacity() public view {
        uint256 capacity = engine.computeCapacity(0, 4, 4, 0, 0);
        // repaymentContribution = 4 * 50 = 200, streakContribution = 4 * 25 = 100
        assertEq(capacity, 300);
    }

    function test_missedObligation_reducesCapacity() public view {
        uint256 withoutMiss = engine.computeCapacity(100_000, 0, 0, 0, 0); // activity capped at 4000
        uint256 withMiss = engine.computeCapacity(100_000, 0, 0, 1, 0);
        assertEq(withoutMiss, 4_000);
        assertEq(withMiss, 4_000 - 300);
    }

    function test_missedPenaltyCannotUnderflowBelowZero() public view {
        uint256 capacity = engine.computeCapacity(100, 0, 0, 5, 0); // tiny activity, big penalty
        assertEq(capacity, 0);
    }

    function test_highExposure_capacityNeverBelowExposure() public view {
        uint256 capacity = engine.computeCapacity(0, 0, 0, 0, 777);
        assertEq(capacity, 777);
    }

    function test_capacityCap_neverExceedsMaxCapacity() public view {
        uint256 capacity = engine.computeCapacity(type(uint128).max, 1_000_000, 1_000_000, 0, 0);
        assertEq(capacity, engine.MAX_CAPACITY());
    }

    function test_creditTierBoundaries() public view {
        assertEq(engine.getCreditTier(0), 1);
        assertEq(engine.getCreditTier(999), 1);
        assertEq(engine.getCreditTier(1_000), 2);
        assertEq(engine.getCreditTier(2_999), 2);
        assertEq(engine.getCreditTier(3_000), 3);
        assertEq(engine.getCreditTier(5_000), 3);
    }

    function testFuzz_capacityAlwaysWithinBounds(
        uint256 paymentVolume,
        uint256 repaymentCount,
        uint256 streak,
        uint256 missed,
        uint256 exposure
    ) public view {
        paymentVolume = bound(paymentVolume, 0, type(uint128).max);
        repaymentCount = bound(repaymentCount, 0, 1_000_000);
        streak = bound(streak, 0, 1_000_000);
        missed = bound(missed, 0, 1_000_000);
        exposure = bound(exposure, 0, 10_000);

        uint256 capacity = engine.computeCapacity(paymentVolume, repaymentCount, streak, missed, exposure);
        assertTrue(capacity <= engine.MAX_CAPACITY() || capacity == exposure);
        assertTrue(capacity >= exposure);
    }
}
