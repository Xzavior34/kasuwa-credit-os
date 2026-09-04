// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PolicyEngine} from "../src/PolicyEngine.sol";

contract PolicyEngineTest is Test {
    PolicyEngine internal policy;
    address internal admin = address(0xA11CE);

    function setUp() public {
        policy = new PolicyEngine(admin);
    }

    function test_defaultLimits() public view {
        assertEq(policy.maxLoanAmount(), 2_000);
        assertEq(policy.maxBorrowerExposure(), 2_000);
        assertEq(policy.minCreditTier(), 1);
    }

    function test_pausedProtocol_rejectsAllBorrows() public {
        vm.prank(admin);
        policy.pause();
        (bool allowed, PolicyEngine.RejectionReason reason) = policy.evaluateBorrow(100, 1 days, 1_000, 0, 2, 10 ether, 0);
        assertFalse(allowed);
        assertEq(uint8(reason), uint8(PolicyEngine.RejectionReason.PROTOCOL_PAUSED));
    }

    function test_onlyAdminCanPauseOrChangeLimits() public {
        vm.expectRevert(PolicyEngine.NotAdmin.selector);
        policy.pause();

        vm.expectRevert(PolicyEngine.NotAdmin.selector);
        policy.setLimits(1, 1, 1, 1);
    }

    function test_belowMinTier_isRejected() public {
        vm.prank(admin);
        policy.setLimits(2_000, 30 days, 2_000, 2);
        (bool allowed, PolicyEngine.RejectionReason reason) = policy.evaluateBorrow(100, 1 days, 1_000, 0, 1, 10 ether, 0);
        assertFalse(allowed);
        assertEq(uint8(reason), uint8(PolicyEngine.RejectionReason.BELOW_MIN_TIER));
    }

    function test_tenorExceedingMax_isRejected() public {
        (bool allowed, PolicyEngine.RejectionReason reason) = policy.evaluateBorrow(100, 60 days, 1_000, 0, 2, 10 ether, 0);
        assertFalse(allowed);
        assertEq(uint8(reason), uint8(PolicyEngine.RejectionReason.TENOR_LIMIT_EXCEEDED));
    }

    function test_validRequest_isAllowed() public view {
        (bool allowed, PolicyEngine.RejectionReason reason) = policy.evaluateBorrow(500, 7 days, 1_000, 0, 2, 10 ether, 0);
        assertTrue(allowed);
        assertEq(uint8(reason), uint8(PolicyEngine.RejectionReason.NONE));
    }
}
