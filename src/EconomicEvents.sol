// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title EconomicEvents
/// @notice Demo/test SOURCE-CHAIN contract emitting economic activity events for Kasuwa Credit
/// OS. This contract is deployed on a source chain distinct from Creditcoin (e.g. an EVM
/// testnet). Its events are later proven into Creditcoin via Attestcoin (see
/// AttestcoinVerifier.sol). This is explicitly a DEMO/TEST harness — see docs/DEMO.md. A real
/// integration would either use a merchant's existing payment-rail contract directly, or an
/// off-chain adapter translating its native events into this shape before proof generation.
contract EconomicEvents {
    event PaymentSettled(
        bytes32 indexed merchantId, address indexed merchant, uint256 amount, bytes32 paymentReference, uint64 timestamp
    );
    event RevenueRecorded(
        bytes32 indexed merchantId, address indexed merchant, uint256 amount, bytes32 revenueReference, uint64 timestamp
    );
    event LoanRepayment(
        bytes32 indexed merchantId, address indexed merchant, uint256 amount, bytes32 loanReference, uint64 timestamp
    );
    event ObligationMissed(
        bytes32 indexed merchantId, address indexed merchant, uint256 amount, bytes32 obligationReference, uint64 timestamp
    );

    function emitPaymentSettled(bytes32 merchantId, uint256 amount, bytes32 paymentReference) external {
        emit PaymentSettled(merchantId, msg.sender, amount, paymentReference, uint64(block.timestamp));
    }

    function emitRevenueRecorded(bytes32 merchantId, uint256 amount, bytes32 revenueReference) external {
        emit RevenueRecorded(merchantId, msg.sender, amount, revenueReference, uint64(block.timestamp));
    }

    function emitLoanRepayment(bytes32 merchantId, uint256 amount, bytes32 loanReference) external {
        emit LoanRepayment(merchantId, msg.sender, amount, loanReference, uint64(block.timestamp));
    }

    function emitObligationMissed(bytes32 merchantId, uint256 amount, bytes32 obligationReference) external {
        emit ObligationMissed(merchantId, msg.sender, amount, obligationReference, uint64(block.timestamp));
    }

    /// @notice Deliberately reverts. Used to produce a source transaction that is INCLUDED in a
    /// block but did NOT succeed, exercising the security path in
    /// test/failed-source-transaction.t.sol and docs/SECURITY_MODEL.md.
    function emitPaymentThatReverts(bytes32, uint256, bytes32) external pure {
        revert("EconomicEvents: demo forced revert");
    }
}
