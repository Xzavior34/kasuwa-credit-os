// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ICreditEngine
/// @notice Deterministic, documented policy converting verified economic history into credit
/// capacity. See CreditEngine.sol for the concrete (demo) formula.
interface ICreditEngine {
    function computeCapacity(
        uint256 verifiedPaymentVolume,
        uint256 successfulRepaymentCount,
        uint256 repaymentStreak,
        uint256 missedObligations,
        uint256 currentExposure
    ) external pure returns (uint256 capacity);

    function getCreditTier(uint256 capacity) external pure returns (uint8 tier);
}
