// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CreditLine} from "../../src/CreditLine.sol";

/// @title MaliciousReentrantBorrower
/// @notice TEST-ONLY attacker contract. On receiving the funded-borrow value transfer inside
/// `CreditLine.borrow` -> `LiquidityPool.fundCreditLine`, its `receive()` immediately tries to
/// call `CreditLine.borrow` again for the same merchant before the first call has returned —
/// the classic reentrancy window. Used by test/reentrancy.t.sol to prove this is blocked.
contract MaliciousReentrantBorrower {
    CreditLine public immutable creditLine;
    bytes32 public merchantId;
    uint256 public amount;
    uint256 public tenorSeconds;
    bool public armed;
    bool public reentryReverted;
    bytes public reentryRevertData;

    constructor(CreditLine _creditLine) {
        creditLine = _creditLine;
    }

    function attack(bytes32 _merchantId, uint256 _amount, uint256 _tenorSeconds) external {
        merchantId = _merchantId;
        amount = _amount;
        tenorSeconds = _tenorSeconds;
        armed = true;
        creditLine.borrow(_merchantId, _amount, _tenorSeconds, 0);
        armed = false;
    }

    receive() external payable {
        if (armed) {
            armed = false; // disarm first: only attempt the reentrant call once
            try creditLine.borrow(merchantId, amount, tenorSeconds, 0) {
                // If this ever succeeds, the test will catch it via exposure/balance assertions.
            } catch (bytes memory reason) {
                reentryReverted = true;
                reentryRevertData = reason;
            }
        }
    }
}
