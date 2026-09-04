// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title PolicyEngine
/// @notice Deterministically enforces hard protocol limits. AI/off-chain recommendations are
/// UNTRUSTED INPUT: `evaluateBorrow` accepts an `aiRecommendedAmount` purely so the caller can
/// emit it for display (see CreditLine.BorrowBlocked / the Security Lab UI). It has no effect on
/// the decision — there is no code path here that lets a recommendation bypass a limit. See
/// test/malicious-ai.t.sol.
contract PolicyEngine {
    error NotAdmin();

    event Paused(address indexed by);
    event Unpaused(address indexed by);
    event LimitsUpdated(uint256 maxLoanAmount, uint256 maxTenorSeconds, uint256 maxBorrowerExposure, uint8 minCreditTier);

    enum RejectionReason {
        NONE,
        PROTOCOL_PAUSED,
        POLICY_LIMIT_EXCEEDED,
        TENOR_LIMIT_EXCEEDED,
        EXPOSURE_LIMIT_EXCEEDED,
        BELOW_MIN_TIER,
        INSUFFICIENT_CREDIT_CAPACITY,
        INSUFFICIENT_LIQUIDITY
    }

    address public admin;
    bool public paused;

    uint256 public maxLoanAmount = 2_000;
    uint256 public maxTenorSeconds = 30 days;
    uint256 public maxBorrowerExposure = 2_000;
    uint8 public minCreditTier = 1;

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    constructor(address _admin) {
        admin = _admin;
    }

    function pause() external onlyAdmin {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyAdmin {
        paused = false;
        emit Unpaused(msg.sender);
    }

    function setLimits(uint256 _maxLoanAmount, uint256 _maxTenorSeconds, uint256 _maxBorrowerExposure, uint8 _minCreditTier)
        external
        onlyAdmin
    {
        maxLoanAmount = _maxLoanAmount;
        maxTenorSeconds = _maxTenorSeconds;
        maxBorrowerExposure = _maxBorrowerExposure;
        minCreditTier = _minCreditTier;
        emit LimitsUpdated(_maxLoanAmount, _maxTenorSeconds, _maxBorrowerExposure, _minCreditTier);
    }

    /// @notice `aiRecommendedAmount` is advisory display data ONLY and does not influence
    /// `allowed`/`reason` in any way — every branch below reads only the hard limits above and
    /// the actual on-chain state passed in by the caller.
    function evaluateBorrow(
        uint256 requestedAmount,
        uint256 tenorSeconds,
        uint256 availableCredit,
        uint256 currentExposure,
        uint8 creditTier,
        uint256 availableLiquidity,
        uint256 aiRecommendedAmount
    ) external view returns (bool allowed, RejectionReason reason) {
        aiRecommendedAmount; // explicitly unused in the decision — see natspec above
        if (paused) return (false, RejectionReason.PROTOCOL_PAUSED);
        if (requestedAmount > maxLoanAmount) return (false, RejectionReason.POLICY_LIMIT_EXCEEDED);
        if (tenorSeconds > maxTenorSeconds) return (false, RejectionReason.TENOR_LIMIT_EXCEEDED);
        if (creditTier < minCreditTier) return (false, RejectionReason.BELOW_MIN_TIER);
        if (requestedAmount > availableCredit) return (false, RejectionReason.INSUFFICIENT_CREDIT_CAPACITY);
        if (currentExposure + requestedAmount > maxBorrowerExposure) return (false, RejectionReason.EXPOSURE_LIMIT_EXCEEDED);
        if (requestedAmount > availableLiquidity) return (false, RejectionReason.INSUFFICIENT_LIQUIDITY);
        return (true, RejectionReason.NONE);
    }
}
