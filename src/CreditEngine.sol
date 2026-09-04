// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ICreditEngine} from "./interfaces/ICreditEngine.sol";

/// @title CreditEngine
/// @notice Converts verified economic history into a deterministic, bounded credit capacity.
/// THIS IS A DEMO PROTOCOL POLICY — it does not represent real-world underwriting and is
/// documented here in full so it is never an opaque black box.
///
/// capacity = min(MAX_CAPACITY, max(0,
///     BASE_CAPACITY
///     + min(paymentVolume / ACTIVITY_DIVISOR, ACTIVITY_CONTRIBUTION_CAP)
///     + min(repaymentCount * REPAYMENT_UNIT, REPAYMENT_CONTRIBUTION_CAP)
///     + min(streak, MAX_STREAK_BONUS_STEPS) * STREAK_UNIT
///     - missedObligations * MISSED_PENALTY_UNIT
/// ))
/// ...and never allowed to fall below currentExposure (a merchant's capacity can't be computed
/// lower than what they already owe).
contract CreditEngine is ICreditEngine {
    uint256 public constant BASE_CAPACITY = 0;
    uint256 public constant ACTIVITY_DIVISOR = 10;
    uint256 public constant ACTIVITY_CONTRIBUTION_CAP = 4_000;
    uint256 public constant REPAYMENT_UNIT = 50;
    uint256 public constant REPAYMENT_CONTRIBUTION_CAP = 2_000;
    uint256 public constant STREAK_UNIT = 25;
    uint256 public constant MAX_STREAK_BONUS_STEPS = 20;
    uint256 public constant MISSED_PENALTY_UNIT = 300;
    // Component caps can sum above MAX_CAPACITY (4000 + 2000 + 500 = 6500), so this is a genuine,
    // reachable backstop rather than dead code — see test_capacityCap_neverExceedsMaxCapacity.
    uint256 public constant MAX_CAPACITY = 5_000;

    uint256 public constant TIER_2_MIN = 1_000;
    uint256 public constant TIER_3_MIN = 3_000;

    function computeCapacity(
        uint256 verifiedPaymentVolume,
        uint256 successfulRepaymentCount,
        uint256 repaymentStreak,
        uint256 missedObligations,
        uint256 currentExposure
    ) external pure returns (uint256 capacity) {
        uint256 activityContribution = verifiedPaymentVolume / ACTIVITY_DIVISOR;
        if (activityContribution > ACTIVITY_CONTRIBUTION_CAP) activityContribution = ACTIVITY_CONTRIBUTION_CAP;

        uint256 repaymentContribution = successfulRepaymentCount * REPAYMENT_UNIT;
        if (repaymentContribution > REPAYMENT_CONTRIBUTION_CAP) repaymentContribution = REPAYMENT_CONTRIBUTION_CAP;

        uint256 streakSteps = repaymentStreak > MAX_STREAK_BONUS_STEPS ? MAX_STREAK_BONUS_STEPS : repaymentStreak;
        uint256 streakContribution = streakSteps * STREAK_UNIT;

        uint256 missedPenalty = missedObligations * MISSED_PENALTY_UNIT;

        uint256 raw = BASE_CAPACITY + activityContribution + repaymentContribution + streakContribution;
        raw = missedPenalty >= raw ? 0 : raw - missedPenalty;

        capacity = raw > MAX_CAPACITY ? MAX_CAPACITY : raw;
        if (capacity < currentExposure) capacity = currentExposure;
    }

    function getCreditTier(uint256 capacity) external pure returns (uint8 tier) {
        if (capacity >= TIER_3_MIN) return 3;
        if (capacity >= TIER_2_MIN) return 2;
        return 1;
    }
}
