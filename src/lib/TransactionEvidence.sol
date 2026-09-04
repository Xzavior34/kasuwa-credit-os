// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title TransactionEvidence
/// @notice On-chain decoder for transaction and receipt bytes verified by Creditcoin's
/// BlockProver precompile (or MockBlockProver in local tests). Decodes canonical economic facts
/// (merchantId, eventType, amount, sourceTxSuccess) directly from the cryptographically proven
/// `encodedTransaction` bytes, eliminating relayer honesty as a trust assumption.
///
/// Encoding format matches gluwa usc-sdk v0.18.0 (abi.encode(uint8 txType, bytes[] chunks)).
library TransactionEvidence {
    error LogIndexOutOfRange();
    error SourceContractDidNotEmitThisLog();
    error UnknownEventSignature();
    error MalformedEncodedTransaction();

    bytes32 internal constant PAYMENT_SETTLED_SIG =
        keccak256("PaymentSettled(bytes32,address,uint256,bytes32,uint64)");
    bytes32 internal constant REVENUE_RECORDED_SIG =
        keccak256("RevenueRecorded(bytes32,address,uint256,bytes32,uint64)");
    bytes32 internal constant LOAN_REPAYMENT_SIG =
        keccak256("LoanRepayment(bytes32,address,uint256,bytes32,uint64)");
    bytes32 internal constant OBLIGATION_MISSED_SIG =
        keccak256("ObligationMissed(bytes32,address,uint256,bytes32,uint64)");

    struct RawLog {
        address emitter;
        bytes32[] topics;
        bytes data;
    }

    struct DecodedEvidence {
        bytes32 merchantId;
        uint8 eventType;
        uint256 amount;
        bool sourceTxSuccess;
    }

    function eventTypeSignature(uint8 eventType) internal pure returns (bytes32) {
        if (eventType == 0) return PAYMENT_SETTLED_SIG;
        if (eventType == 1) return REVENUE_RECORDED_SIG;
        if (eventType == 2) return LOAN_REPAYMENT_SIG;
        if (eventType == 3) return OBLIGATION_MISSED_SIG;
        revert UnknownEventSignature();
    }

    /// @notice Decodes the proven transaction bytes and extracts the canonical economic event
    /// from the specified log index.
    /// @param encodedTransaction ABI-encoded (uint8 txType, bytes[] chunks)
    /// @param expectedSourceContract Expected emitter address of the log
    /// @param logIndex 0-indexed log within the receipt's log list
    function decode(
        bytes memory encodedTransaction,
        address expectedSourceContract,
        uint32 logIndex
    ) internal pure returns (DecodedEvidence memory decoded) {
        (, bytes[] memory chunks) = abi.decode(encodedTransaction, (uint8, bytes[]));
        if (chunks.length == 0) revert MalformedEncodedTransaction();

        // The receipt is always in the last chunk
        bytes memory receiptChunk = chunks[chunks.length - 1];
        (uint8 status, , RawLog[] memory logs, ) = abi.decode(
            receiptChunk,
            (uint8, uint64, RawLog[], bytes)
        );

        decoded.sourceTxSuccess = (status == 1);

        if (logIndex >= logs.length) revert LogIndexOutOfRange();

        RawLog memory log = logs[logIndex];
        if (log.emitter != expectedSourceContract) revert SourceContractDidNotEmitThisLog();
        if (log.topics.length < 2) revert UnknownEventSignature();

        bytes32 topic0 = log.topics[0];
        if (topic0 == PAYMENT_SETTLED_SIG) {
            decoded.eventType = 0;
        } else if (topic0 == REVENUE_RECORDED_SIG) {
            decoded.eventType = 1;
        } else if (topic0 == LOAN_REPAYMENT_SIG) {
            decoded.eventType = 2;
        } else if (topic0 == OBLIGATION_MISSED_SIG) {
            decoded.eventType = 3;
        } else {
            revert UnknownEventSignature();
        }

        decoded.merchantId = log.topics[1];

        (uint256 amount, , ) = abi.decode(log.data, (uint256, bytes32, uint64));
        decoded.amount = amount;
    }
}
