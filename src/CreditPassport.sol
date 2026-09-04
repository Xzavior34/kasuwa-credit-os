// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ICreditEngine} from "./interfaces/ICreditEngine.sol";

/// @title CreditPassport
/// @notice The core product: an inspectable, verifiable economic history per merchant and the
/// deterministic credit capacity computed from it (see CreditEngine). Exposes a read-only
/// developer API (docs/API.md) so other Creditcoin applications can consume this credit state.
///
/// Security design note: verified economic events (recordVerifiedEvent, called only by
/// AttestcoinVerifier) NEVER directly reduce exposure — including verified "LoanRepayment"
/// events, which may describe repayment behavior on some other counterparty's rail entirely.
/// Only an actual on-chain repay() against THIS protocol's CreditLine (recordRepayment, funds
/// real value into LiquidityPool) reduces exposure. Conflating the two would let an attacker
/// submit repayment-shaped source events to zero out real Kasuwa debt without repaying it.
contract CreditPassport {
    error NotAuthorized();

    event VerifiedEventRecorded(bytes32 indexed merchantId, uint8 eventType, uint256 amount, bytes32 evidenceId);
    event CapacityUpdated(bytes32 indexed merchantId, uint256 previousCapacity, uint256 newCapacity);
    event ExposureUpdated(bytes32 indexed merchantId, uint256 previousExposure, uint256 newExposure);

    struct MerchantState {
        uint256 verifiedEventCount;
        uint256 verifiedPaymentVolume;
        uint256 successfulRepaymentCount; // count of verified LoanRepayment economic events (history signal)
        uint256 repaymentVolume;
        uint256 repaymentStreak;
        uint256 missedObligations;
        uint64 lastVerifiedActivity;
        uint256 currentExposure; // only ever changed by borrow()/recordRepayment() via CreditLine
        uint256 currentCapacity;
    }

    address public admin;
    address public attestcoinVerifier;
    address public creditLine;
    ICreditEngine public creditEngine;

    mapping(bytes32 => MerchantState) internal _merchants;

    modifier onlyVerifier() {
        if (msg.sender != attestcoinVerifier) revert NotAuthorized();
        _;
    }

    modifier onlyCreditLine() {
        if (msg.sender != creditLine) revert NotAuthorized();
        _;
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAuthorized();
        _;
    }

    constructor(address _admin, ICreditEngine _creditEngine) {
        admin = _admin;
        creditEngine = _creditEngine;
    }

    function setAttestcoinVerifier(address _v) external onlyAdmin {
        attestcoinVerifier = _v;
    }

    function setCreditLine(address _c) external onlyAdmin {
        creditLine = _c;
    }

    /// @dev eventType: 0=PaymentSettled 1=RevenueRecorded 2=LoanRepayment 3=ObligationMissed
    function recordVerifiedEvent(bytes32 merchantId, uint8 eventType, uint256 amount, bytes32 evidenceId) external onlyVerifier {
        MerchantState storage m = _merchants[merchantId];
        m.verifiedEventCount += 1;
        m.lastVerifiedActivity = uint64(block.timestamp);

        if (eventType == 0 || eventType == 1) {
            m.verifiedPaymentVolume += amount;
        } else if (eventType == 2) {
            m.successfulRepaymentCount += 1;
            m.repaymentVolume += amount;
            m.repaymentStreak += 1;
        } else if (eventType == 3) {
            m.missedObligations += 1;
            m.repaymentStreak = 0;
        }

        emit VerifiedEventRecorded(merchantId, eventType, amount, evidenceId);
        _recomputeCapacity(merchantId, m);
    }

    function recordBorrow(bytes32 merchantId, uint256 amount) external onlyCreditLine {
        MerchantState storage m = _merchants[merchantId];
        uint256 prevExposure = m.currentExposure;
        m.currentExposure += amount;
        emit ExposureUpdated(merchantId, prevExposure, m.currentExposure);
        _recomputeCapacity(merchantId, m);
    }

    function recordRepayment(bytes32 merchantId, uint256 amount) external onlyCreditLine {
        MerchantState storage m = _merchants[merchantId];
        uint256 prevExposure = m.currentExposure;
        m.currentExposure = amount >= m.currentExposure ? 0 : m.currentExposure - amount;
        emit ExposureUpdated(merchantId, prevExposure, m.currentExposure);
        _recomputeCapacity(merchantId, m);
    }

    function _recomputeCapacity(bytes32 merchantId, MerchantState storage m) internal {
        uint256 previousCapacity = m.currentCapacity;
        uint256 newCapacity = creditEngine.computeCapacity(
            m.verifiedPaymentVolume, m.successfulRepaymentCount, m.repaymentStreak, m.missedObligations, m.currentExposure
        );
        m.currentCapacity = newCapacity;
        if (newCapacity != previousCapacity) {
            emit CapacityUpdated(merchantId, previousCapacity, newCapacity);
        }
    }

    // ---- Developer API (read layer) — see docs/API.md ----

    function getCreditCapacity(bytes32 merchantId) external view returns (uint256) {
        return _merchants[merchantId].currentCapacity;
    }

    function getCreditTier(bytes32 merchantId) external view returns (uint8) {
        return creditEngine.getCreditTier(_merchants[merchantId].currentCapacity);
    }

    function getCurrentExposure(bytes32 merchantId) external view returns (uint256) {
        return _merchants[merchantId].currentExposure;
    }

    function getAvailableCredit(bytes32 merchantId) external view returns (uint256) {
        MerchantState storage m = _merchants[merchantId];
        if (m.currentExposure >= m.currentCapacity) return 0;
        return m.currentCapacity - m.currentExposure;
    }

    function getVerifiedEconomicActivity(bytes32 merchantId) external view returns (uint256 eventCount, uint256 paymentVolume) {
        MerchantState storage m = _merchants[merchantId];
        return (m.verifiedEventCount, m.verifiedPaymentVolume);
    }

    function getRepaymentHistory(bytes32 merchantId)
        external
        view
        returns (uint256 count, uint256 volume, uint256 streak, uint256 missed)
    {
        MerchantState storage m = _merchants[merchantId];
        return (m.successfulRepaymentCount, m.repaymentVolume, m.repaymentStreak, m.missedObligations);
    }

    function getMerchantState(bytes32 merchantId) external view returns (MerchantState memory) {
        return _merchants[merchantId];
    }
}
