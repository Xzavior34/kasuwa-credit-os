// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {KasuwaTestBase} from "./helpers/KasuwaTestBase.sol";
import {AttestcoinVerifier} from "../src/AttestcoinVerifier.sol";
import {TransactionEvidence} from "../src/lib/TransactionEvidence.sol";

/// @title RelayerHonestyTest
/// @notice The relayer is an UNTRUSTED DELIVERY MECHANISM, not an authority over economic facts.
/// This file proves that invariant directly: every one of these tests has a relayer try to
/// pair a real, verifiable proof with a false claim about what it means, and every one is
/// rejected — not because the relayer is caught lying about a flag, but because there is no
/// longer any flag to lie on. `merchantId`, `eventType`, `amount`, and "did it succeed" are all
/// derived by `TransactionEvidence.decode` from the same `encodedTransaction` bytes that
/// `blockProver.verify` cryptographically proves were really included — see
/// docs/SECURITY_MODEL.md "Relayer honesty" and src/AttestcoinVerifier.sol's contract natspec.
contract RelayerHonestyTest is KasuwaTestBase {
    address internal otherRegisteredContract = address(0x0ECEC);

    function setUp() public {
        setUpKasuwa();
        vm.prank(admin);
        verifier.registerSourceContract(SOURCE_CHAIN_KEY, otherRegisteredContract);
    }

    /// INVARIANT: a relayer cannot attribute a real event to a different registered contract
    /// than the one that actually emitted it — even though both are registered and the proof
    /// itself is completely genuine.
    function test_relayerCannotAttributeRealEventToADifferentRegisteredContract() public {
        bytes32 merchantId = bytes32("merchant-1");
        // The log is genuinely emitted by `sourceContract`...
        AttestcoinVerifier.EvidenceInput memory ev =
            buildEvidence(merchantId, 0, 750, true, sourceContract, sourceContract);
        // ...but the relayer claims it came from `otherRegisteredContract` instead — both are
        // registered, so the allowlist check alone would not catch this; only the on-chain
        // decode-and-compare-emitter check does.
        ev.sourceContract = otherRegisteredContract;

        vm.prank(relayer);
        vm.expectRevert(TransactionEvidence.SourceContractDidNotEmitThisLog.selector);
        verifier.submitEvidence(ev);
    }

    /// INVARIANT: there is no relayer-supplied field for merchantId/eventType/amount to lie on.
    /// Submitting a real, valid proof always records the REAL embedded values — demonstrated by
    /// submitting two genuinely different real transactions and confirming each merchant's
    /// state reflects exactly its own transaction's real content, never a value "suggested" by
    /// however the evidence was delivered.
    function test_recordedFactsAlwaysMatchWhatWasActuallyInTheTransaction() public {
        AttestcoinVerifier.EvidenceInput memory evA =
            buildEvidenceWithSalt(bytes32("merchant-A"), 0, 111, true, sourceContract, sourceContract, 1);
        AttestcoinVerifier.EvidenceInput memory evB =
            buildEvidenceWithSalt(bytes32("merchant-B"), 1, 222, true, sourceContract, sourceContract, 2);

        vm.prank(relayer);
        verifier.submitEvidence(evA);
        vm.prank(relayer);
        verifier.submitEvidence(evB);

        (, uint256 volumeA) = passport.getVerifiedEconomicActivity(bytes32("merchant-A"));
        (, uint256 volumeB) = passport.getVerifiedEconomicActivity(bytes32("merchant-B"));
        assertEq(volumeA, 111);
        assertEq(volumeB, 222);
    }

    /// INVARIANT: a log emitted by a registered contract, but not matching any of Kasuwa's four
    /// known economic-event signatures, is rejected outright rather than silently accepted or
    /// misinterpreted as some default event type.
    function test_unknownEventSignature_fromARegisteredContract_isRejected() public {
        TransactionEvidence.RawLog[] memory logs = new TransactionEvidence.RawLog[](1);
        bytes32[] memory topics = new bytes32[](2);
        topics[0] = keccak256("SomeUnrelatedEvent(uint256)"); // not one of the 4 known signatures
        topics[1] = bytes32("merchant-1");
        logs[0] = TransactionEvidence.RawLog({emitter: sourceContract, topics: topics, data: abi.encode(uint256(1))});

        bytes memory encodedTx = buildEncodedTransaction(sourceContract, true, logs);
        AttestcoinVerifier.EvidenceInput memory ev = AttestcoinVerifier.EvidenceInput({
            chainKey: SOURCE_CHAIN_KEY,
            height: 1,
            encodedTransaction: encodedTx,
            merkleProof: emptyMerkleProofStatic(),
            continuityProof: emptyContinuityProofStatic(),
            sourceContract: sourceContract,
            logIndex: 0
        });

        vm.prank(relayer);
        vm.expectRevert(TransactionEvidence.UnknownEventSignature.selector);
        verifier.submitEvidence(ev);
    }

    /// INVARIANT: requesting a log position that doesn't exist in the proven receipt is
    /// rejected, not treated as index 0 or silently ignored.
    function test_logIndexBeyondWhatExists_isRejected() public {
        bytes32 merchantId = bytes32("merchant-1");
        AttestcoinVerifier.EvidenceInput memory ev =
            buildEvidence(merchantId, 0, 750, true, sourceContract, sourceContract);
        ev.logIndex = 5; // only one log (index 0) actually exists in this fixture

        vm.prank(relayer);
        vm.expectRevert(TransactionEvidence.LogIndexOutOfRange.selector);
        verifier.submitEvidence(ev);
    }

    /// INVARIANT: empty chunks array reverts with MalformedEncodedTransaction
    function test_emptyChunksArray_isRejectedDeterministically() public {
        bytes[] memory emptyChunks = new bytes[](0);
        bytes memory malformedTx = abi.encode(uint8(2), emptyChunks);

        AttestcoinVerifier.EvidenceInput memory ev = AttestcoinVerifier.EvidenceInput({
            chainKey: SOURCE_CHAIN_KEY,
            height: 1,
            encodedTransaction: malformedTx,
            merkleProof: emptyMerkleProofStatic(),
            continuityProof: emptyContinuityProofStatic(),
            sourceContract: sourceContract,
            logIndex: 0
        });

        vm.prank(relayer);
        vm.expectRevert(TransactionEvidence.MalformedEncodedTransaction.selector);
        verifier.submitEvidence(ev);
    }

    /// INVARIANT: log with less than 2 topics is rejected with UnknownEventSignature
    function test_logWithInsufficientTopics_isRejected() public {
        TransactionEvidence.RawLog[] memory logs = new TransactionEvidence.RawLog[](1);
        bytes32[] memory topics = new bytes32[](1);
        topics[0] = TransactionEvidence.eventTypeSignature(0); // Only event signature, missing merchantId topic
        logs[0] = TransactionEvidence.RawLog({
            emitter: sourceContract,
            topics: topics,
            data: abi.encode(uint256(500), bytes32("ref"), uint64(1700000000))
        });

        bytes memory encodedTx = buildEncodedTransaction(sourceContract, true, logs);
        AttestcoinVerifier.EvidenceInput memory ev = AttestcoinVerifier.EvidenceInput({
            chainKey: SOURCE_CHAIN_KEY,
            height: 1,
            encodedTransaction: encodedTx,
            merkleProof: emptyMerkleProofStatic(),
            continuityProof: emptyContinuityProofStatic(),
            sourceContract: sourceContract,
            logIndex: 0
        });

        vm.prank(relayer);
        vm.expectRevert(TransactionEvidence.UnknownEventSignature.selector);
        verifier.submitEvidence(ev);
    }

    /// INVARIANT: all four economic event types decode into their exact respective CreditPassport categories
    function test_allFourEventTypes_decodeAndRecordAccurately() public {
        bytes32 merchantId = bytes32("merchant-4types");

        // EventType 0: PaymentSettled (increases payment volume)
        AttestcoinVerifier.EvidenceInput memory ev0 =
            buildEvidenceWithSalt(merchantId, 0, 1000, true, sourceContract, sourceContract, 10);
        vm.prank(relayer);
        verifier.submitEvidence(ev0);

        // EventType 1: RevenueRecorded (increases payment volume)
        AttestcoinVerifier.EvidenceInput memory ev1 =
            buildEvidenceWithSalt(merchantId, 1, 500, true, sourceContract, sourceContract, 11);
        vm.prank(relayer);
        verifier.submitEvidence(ev1);

        // EventType 2: LoanRepayment (increases repayment count, volume, streak)
        AttestcoinVerifier.EvidenceInput memory ev2 =
            buildEvidenceWithSalt(merchantId, 2, 300, true, sourceContract, sourceContract, 12);
        vm.prank(relayer);
        verifier.submitEvidence(ev2);

        // EventType 3: ObligationMissed (increases missed obligations, resets streak)
        AttestcoinVerifier.EvidenceInput memory ev3 =
            buildEvidenceWithSalt(merchantId, 3, 200, true, sourceContract, sourceContract, 13);
        vm.prank(relayer);
        verifier.submitEvidence(ev3);

        (uint256 eventCount, uint256 paymentVol) = passport.getVerifiedEconomicActivity(merchantId);
        (uint256 repCount, uint256 repVol, uint256 repStreak, uint256 missed) = passport.getRepaymentHistory(merchantId);

        assertEq(eventCount, 4);
        assertEq(paymentVol, 1500); // 1000 + 500
        assertEq(repCount, 1);
        assertEq(repVol, 300);
        assertEq(repStreak, 0); // reset by missed obligation
        assertEq(missed, 1);
    }

    /// INVARIANT: if verification or decode fails, CreditPassport state is completely untouched
    function test_failedSubmissionLeavesNoTraceInCreditPassport() public {
        bytes32 merchantId = bytes32("merchant-clean");

        // Attempt submission with invalid source contract
        AttestcoinVerifier.EvidenceInput memory evMismatch =
            buildEvidence(merchantId, 0, 9999, true, sourceContract, wrongSourceContract);
        vm.prank(relayer);
        vm.expectRevert(AttestcoinVerifier.SourceContractMismatch.selector);
        verifier.submitEvidence(evMismatch);

        // Verify CreditPassport has zero state for merchant
        assertEq(passport.getCreditCapacity(merchantId), 0);
        (uint256 count, uint256 vol) = passport.getVerifiedEconomicActivity(merchantId);
        assertEq(count, 0);
        assertEq(vol, 0);
    }
}
