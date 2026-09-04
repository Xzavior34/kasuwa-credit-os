// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockBlockProver} from "../mocks/MockBlockProver.sol";
import {AttestcoinVerifier} from "../../src/AttestcoinVerifier.sol";
import {CreditPassport} from "../../src/CreditPassport.sol";
import {CreditEngine} from "../../src/CreditEngine.sol";
import {PolicyEngine} from "../../src/PolicyEngine.sol";
import {CreditLine} from "../../src/CreditLine.sol";
import {LiquidityPool} from "../../src/LiquidityPool.sol";
import {INativeQueryVerifier} from "../../src/interfaces/INativeQueryVerifier.sol";
import {TransactionEvidence} from "../../src/lib/TransactionEvidence.sol";

/// @notice Deploys the full Kasuwa stack against a MockBlockProver (see docs/SECURITY_MODEL.md
/// for why a mock is used in this sandbox instead of the real Creditcoin precompile) and wires
/// admin permissions between contracts exactly as production deployment scripts would.
///
/// Also provides fixture builders for REAL-SHAPED `encodedTransaction` bytes — matching the
/// actual gluwa usc-sdk v0.18.0 encoding format exercised by TransactionEvidence.sol — so tests
/// exercise the real on-chain decode path, not a stub.
contract KasuwaTestBase is Test {
    MockBlockProver internal blockProver;
    AttestcoinVerifier internal verifier;
    CreditPassport internal passport;
    CreditEngine internal engine;
    PolicyEngine internal policy;
    CreditLine internal creditLine;
    LiquidityPool internal pool;

    address internal admin = address(0xA11CE);
    address internal relayer = address(0xBEEF);
    address internal merchantEOA = address(0xCAFE);
    address internal lp = address(0xD00D);

    uint64 internal constant SOURCE_CHAIN_KEY = 2; // arbitrary demo source chain
    address internal sourceContract = address(0x5111CE);
    address internal wrongSourceContract = address(0xBAD5111CE);

    function setUpKasuwa() internal {
        blockProver = new MockBlockProver();

        vm.startPrank(admin);
        verifier = new AttestcoinVerifier(address(blockProver), admin);
        engine = new CreditEngine();
        passport = new CreditPassport(admin, engine);
        policy = new PolicyEngine(admin);
        pool = new LiquidityPool(admin);
        creditLine = new CreditLine(admin, passport, policy, pool, engine);

        passport.setAttestcoinVerifier(address(verifier));
        passport.setCreditLine(address(creditLine));
        pool.setCreditLine(address(creditLine));
        verifier.setCreditPassport(address(passport));
        verifier.registerSourceContract(SOURCE_CHAIN_KEY, sourceContract);
        vm.stopPrank();

        // Fund the liquidity pool so borrows have somewhere to draw from.
        vm.deal(lp, 100 ether);
        vm.prank(lp);
        pool.deposit{value: 10 ether}();
    }

    // ---------------------------------------------------------------------
    // Real-shaped encodedTransaction fixture builders
    // ---------------------------------------------------------------------

    /// @notice Builds one raw log exactly as the real SDK's receipt-log tuple encodes it:
    /// (emitter, topics, data), with topics = [eventSig, merchantId, merchantAddressAsBytes32]
    /// and data = abi.encode(amount, reference, timestamp) — matching EconomicEvents.sol's real
    /// event shape (bytes32 indexed merchantId, address indexed merchant, uint256 amount,
    /// bytes32 reference, uint64 timestamp).
    function buildLog(address emitter, uint8 eventType, bytes32 merchantId, uint256 amount)
        internal
        pure
        returns (TransactionEvidence.RawLog memory)
    {
        bytes32[] memory topics = new bytes32[](3);
        topics[0] = TransactionEvidence.eventTypeSignature(eventType);
        topics[1] = merchantId;
        topics[2] = bytes32(uint256(uint160(address(0xDEAD))));
        bytes memory data = abi.encode(amount, bytes32("ref"), uint64(1700000000));
        return TransactionEvidence.RawLog({emitter: emitter, topics: topics, data: data});
    }

    /// @notice Assembles a full `encodedTransaction` blob in the real (uint8 txType, bytes[]
    /// chunks) format TransactionEvidence.sol decodes, with a single dummy type-specific middle
    /// chunk (its content is never read) and a real receipt chunk carrying `logs`. `nonceSalt`
    /// perturbs the (unused-by-decode, but real-shaped) nonce field so two fixtures with
    /// identical semantic content can still represent genuinely distinct underlying
    /// transactions when a test needs that — exactly as two real transactions would naturally
    /// differ even if their claimed amounts happened to match.
    function buildEncodedTransaction(
        address to,
        bool sourceTxSuccess,
        TransactionEvidence.RawLog[] memory logs,
        uint64 nonceSalt
    ) internal pure returns (bytes memory) {
        bytes memory chunk1 =
            abi.encode(nonceSalt, uint64(21000), address(0x1111), false, to, uint256(0), bytes(""));
        bytes memory chunk2 = abi.encode(uint64(1), uint128(0), uint128(0)); // dummy — never decoded
        bytes memory chunk3 = abi.encode(uint8(sourceTxSuccess ? 1 : 0), uint64(21000), logs, bytes(""));

        bytes[] memory chunks = new bytes[](3);
        chunks[0] = chunk1;
        chunks[1] = chunk2;
        chunks[2] = chunk3;
        return abi.encode(uint8(2), chunks); // txType 2 (EIP-1559) — arbitrary, decode() doesn't branch on it
    }

    function buildEncodedTransaction(address to, bool sourceTxSuccess, TransactionEvidence.RawLog[] memory logs)
        internal
        pure
        returns (bytes memory)
    {
        return buildEncodedTransaction(to, sourceTxSuccess, logs, 0);
    }

    /// @notice One-shot convenience: builds a single-log encodedTransaction and the full
    /// EvidenceInput for it. `emitter` is who actually emitted the log (baked into the encoded
    /// bytes); `claimedSourceContract` is what the caller puts in `ev.sourceContract` — normally
    /// the same address, but tests can pass them differently to exercise the mismatch path.
    /// `nonceSalt` lets a test represent "a genuinely different underlying transaction" even
    /// when the semantic content (merchantId/eventType/amount) is identical to another fixture.
    function buildEvidenceWithSalt(
        bytes32 merchantId,
        uint8 eventType,
        uint256 amount,
        bool sourceTxSuccess,
        address emitter,
        address claimedSourceContract,
        uint64 nonceSalt
    ) internal pure returns (AttestcoinVerifier.EvidenceInput memory) {
        TransactionEvidence.RawLog[] memory logs = new TransactionEvidence.RawLog[](1);
        logs[0] = buildLog(emitter, eventType, merchantId, amount);
        bytes memory encodedTx = buildEncodedTransaction(emitter, sourceTxSuccess, logs, nonceSalt);

        return AttestcoinVerifier.EvidenceInput({
            chainKey: SOURCE_CHAIN_KEY,
            height: 12345,
            encodedTransaction: encodedTx,
            merkleProof: emptyMerkleProofStatic(),
            continuityProof: emptyContinuityProofStatic(),
            sourceContract: claimedSourceContract,
            logIndex: 0
        });
    }

    function buildEvidence(
        bytes32 merchantId,
        uint8 eventType,
        uint256 amount,
        bool sourceTxSuccess,
        address emitter,
        address claimedSourceContract
    ) internal pure returns (AttestcoinVerifier.EvidenceInput memory) {
        return buildEvidenceWithSalt(merchantId, eventType, amount, sourceTxSuccess, emitter, claimedSourceContract, 0);
    }

    /// @notice Builds a single encodedTransaction carrying TWO logs (e.g. one tx that emitted
    /// both a PaymentSettled and a RevenueRecorded event) and returns EvidenceInput for
    /// whichever `logIndex` the test wants to submit — exercising that logIndex genuinely
    /// selects within a real multi-log receipt, not just a label.
    function buildEvidenceForLogAt(
        bytes32 merchantId1,
        uint8 eventType1,
        uint256 amount1,
        bytes32 merchantId2,
        uint8 eventType2,
        uint256 amount2,
        address emitter,
        uint32 logIndexToSubmit
    ) internal pure returns (AttestcoinVerifier.EvidenceInput memory) {
        TransactionEvidence.RawLog[] memory logs = new TransactionEvidence.RawLog[](2);
        logs[0] = buildLog(emitter, eventType1, merchantId1, amount1);
        logs[1] = buildLog(emitter, eventType2, merchantId2, amount2);
        bytes memory encodedTx = buildEncodedTransaction(emitter, true, logs, 0);

        return AttestcoinVerifier.EvidenceInput({
            chainKey: SOURCE_CHAIN_KEY,
            height: 12345,
            encodedTransaction: encodedTx,
            merkleProof: emptyMerkleProofStatic(),
            continuityProof: emptyContinuityProofStatic(),
            sourceContract: emitter,
            logIndex: logIndexToSubmit
        });
    }

    function emptyMerkleProofStatic() internal pure returns (INativeQueryVerifier.MerkleProof memory) {
        INativeQueryVerifier.MerkleProofEntry[] memory siblings = new INativeQueryVerifier.MerkleProofEntry[](0);
        return INativeQueryVerifier.MerkleProof({root: bytes32(0), siblings: siblings});
    }

    function emptyContinuityProofStatic() internal pure returns (INativeQueryVerifier.ContinuityProof memory) {
        bytes32[] memory roots = new bytes32[](0);
        return INativeQueryVerifier.ContinuityProof({lowerEndpointDigest: bytes32(0), roots: roots});
    }
}
