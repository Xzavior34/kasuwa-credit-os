// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ReentrancyGuard
/// @notice Minimal, dependency-free reentrancy guard (no OpenZeppelin import needed — this repo
/// only vendors forge-std). Closes the gap flagged in docs/THREAT_MODEL.md's "Honest gaps"
/// ("No dedicated reentrancy attack test", "no ReentrancyGuard yet"). Applied to every function
/// that performs a native-value external call (`CreditLine.borrow`/`repay`,
/// `LiquidityPool.withdraw`/`fundCreditLine`) so a malicious receiver's fallback cannot re-enter
/// the same call path before its state updates complete. See test/reentrancy.t.sol.
abstract contract ReentrancyGuard {
    error ReentrantCall();

    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;
    uint256 private _status = _NOT_ENTERED;

    modifier nonReentrant() {
        if (_status == _ENTERED) revert ReentrantCall();
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }
}
