// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CreditPassport} from "./CreditPassport.sol";
import {PolicyEngine} from "./PolicyEngine.sol";
import {ICreditEngine} from "./interfaces/ICreditEngine.sol";
import {ILiquidityPool} from "./interfaces/ILiquidityPool.sol";

/// @title CreditLine
/// @notice Handles borrow/repay against a merchant's CreditPassport capacity.
///
/// Architecture: AI recommendation -> PolicyEngine -> ALLOW/REJECT. This contract never
/// transfers funds based on an AI recommendation; `aiRecommendedAmount` is passed through to
/// PolicyEngine and to the BorrowBlocked/Borrowed events purely as display data for the Security
/// Lab / Proof Explorer UI. The actual outcome is decided entirely by PolicyEngine.evaluateBorrow
/// reading real on-chain state. See test/malicious-ai.t.sol.
contract CreditLine {
    error NotAdmin();
    error InvalidAmount();
    error BorrowRejected(PolicyEngine.RejectionReason reason);

    event Borrowed(bytes32 indexed merchantId, address indexed borrower, uint256 amount, uint256 tenorSeconds);
    event Repaid(bytes32 indexed merchantId, address indexed borrower, uint256 amount);
    event BorrowBlocked(
        bytes32 indexed merchantId, uint256 requestedAmount, uint256 aiRecommendedAmount, PolicyEngine.RejectionReason reason
    );

    address public admin;
    CreditPassport public creditPassport;
    PolicyEngine public policyEngine;
    ILiquidityPool public liquidityPool;
    ICreditEngine public creditEngine;

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    constructor(
        address _admin,
        CreditPassport _creditPassport,
        PolicyEngine _policyEngine,
        ILiquidityPool _liquidityPool,
        ICreditEngine _creditEngine
    ) {
        admin = _admin;
        creditPassport = _creditPassport;
        policyEngine = _policyEngine;
        liquidityPool = _liquidityPool;
        creditEngine = _creditEngine;
    }

    /// @param aiRecommendedAmount Advisory-only. Never affects the outcome — see contract natspec.
    function borrow(bytes32 merchantId, uint256 amount, uint256 tenorSeconds, uint256 aiRecommendedAmount) external {
        uint256 availableCredit = creditPassport.getAvailableCredit(merchantId);
        uint256 currentExposure = creditPassport.getCurrentExposure(merchantId);
        uint256 capacity = creditPassport.getCreditCapacity(merchantId);
        uint8 tier = creditEngine.getCreditTier(capacity);
        uint256 availableLiquidity = liquidityPool.availableLiquidity();

        (bool allowed, PolicyEngine.RejectionReason reason) = policyEngine.evaluateBorrow(
            amount, tenorSeconds, availableCredit, currentExposure, tier, availableLiquidity, aiRecommendedAmount
        );

        if (!allowed) {
            emit BorrowBlocked(merchantId, amount, aiRecommendedAmount, reason);
            revert BorrowRejected(reason);
        }

        liquidityPool.fundCreditLine(msg.sender, amount);
        creditPassport.recordBorrow(merchantId, amount);

        emit Borrowed(merchantId, msg.sender, amount, tenorSeconds);
    }

    function repay(bytes32 merchantId, uint256 amount) external payable {
        if (msg.value != amount || amount == 0) revert InvalidAmount();
        liquidityPool.receiveRepayment{value: msg.value}(msg.sender, amount);
        creditPassport.recordRepayment(merchantId, amount);
        emit Repaid(merchantId, msg.sender, amount);
    }

    function getAvailableCredit(bytes32 merchantId) external view returns (uint256) {
        return creditPassport.getAvailableCredit(merchantId);
    }

    function getCurrentExposure(bytes32 merchantId) external view returns (uint256) {
        return creditPassport.getCurrentExposure(merchantId);
    }
}
