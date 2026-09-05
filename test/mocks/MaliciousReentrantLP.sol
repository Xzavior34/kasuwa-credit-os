// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LiquidityPool} from "../../src/LiquidityPool.sol";

/// @title MaliciousReentrantLP
/// @notice TEST-ONLY attacker contract. On receiving its withdrawal payout from
/// `LiquidityPool.withdraw`, its `receive()` immediately tries to withdraw again before the
/// first call has returned, attempting to drain more than its real `lpBalance` should allow.
/// Used by test/reentrancy.t.sol to prove this is blocked.
contract MaliciousReentrantLP {
    LiquidityPool public immutable pool;
    uint256 public reentryAmount;
    bool public armed;
    bool public reentryReverted;
    bytes public reentryRevertData;

    constructor(LiquidityPool _pool) {
        pool = _pool;
    }

    function deposit() external payable {
        pool.deposit{value: msg.value}();
    }

    function attackWithdraw(uint256 firstAmount, uint256 _reentryAmount) external {
        reentryAmount = _reentryAmount;
        armed = true;
        pool.withdraw(firstAmount);
        armed = false;
    }

    receive() external payable {
        if (armed) {
            armed = false;
            try pool.withdraw(reentryAmount) {
                // If this ever succeeds, the test will catch it via balance assertions.
            } catch (bytes memory reason) {
                reentryReverted = true;
                reentryRevertData = reason;
            }
        }
    }
}
