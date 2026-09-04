// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {INativeQueryVerifier} from "./interfaces/INativeQueryVerifier.sol";
import {ICreditPassportSink} from "./interfaces/ICreditPassportSink.sol";
import {TransactionEvidence} from "./lib/TransactionEvidence.sol";

/// @title AttestcoinVerifier
/// @notice Verifies cross-chain economic evidence using Creditcoin's native Attestcoin/USC
/// BlockProver precompile, enforces source-contract allowlisting, and replay protection, then
/// forwards CANONICAL, ON-CHAIN-DERIVED events to CreditPassport.
///
/// TRUST BOUNDARY — this is the important part, stated precisely:
///   The relayer supplies only structural proof data: which chain/height/log to look at, and
///   the encodedTransaction + Merkle/continuity proof for it. The relayer supplies NO semantic
///   claims about what happened — no merchantId, no eventType, no amount, no
///   "did it succeed" flag. Every one of those facts is derived HERE, on-chain, by
///   TransactionEvidence.decode() from the same encodedTransaction bytes that
///   `blockProver.verify()` cryptographically proves were really included at that height. A
///   relayer that lies about which log to look at, or supplies a real proof for the wrong
///   content, simply gets a revert (LogIndexOutOfRange / SourceContractDidNotEmitThisLog /
///   UnknownEventSignature) — there is no path for a relayer's claim to become a recorded
///   economic fact without the chain itself having actually contained that fact.
///
///   Earlier versions of this contract took merchantId/eventType/amount/sourceTxSuccess as
///   relayer-supplied EvidenceInput fields and trusted them outright — flagged in
///   docs/SECURITY_MODEL.md as "the biggest remaining technical weakness". This version closes
///   that gap. See test/relayer-honesty.t.sol for tests proving a malicious relayer cannot
///   manufacture an economic event that didn't really happen.
///
/// REAL vs TEST-ONLY, stated plainly:
///   - In production this contract is constructed with `blockProver ==
///     0x0000000000000000000000000000000000000fD2` — Creditcoin's real BlockProver precompile,
///     verified against the published gluwa usc-sdk v0.18.0 package (see docs/NETWORKS.md).
///     `verify()` therefore performs a real on-chain Merkle-inclusion + continuity-proof check;
///     there is no branch in this contract that can return "verified" without that call
///     succeeding.
///   - This sandbox has no network route to a live Creditcoin RPC, so local Foundry tests
///     construct this contract with a MockBlockProver (test/mocks/MockBlockProver.sol) instead
///     of the real precompile address. The mock is a plain test double that returns a
///     caller-set true/false for the inclusion check ONLY — it has no influence over the
///     on-chain-decoded event content, which is exercised for real by every test. This
///     substitution is documented, not hidden.
///   - The `encodedTransaction` decode format itself (TransactionEvidence.sol) was verified
///     against the real, published gluwa usc-sdk v0.18.0 source (`src/encoding/abi/v1.ts`) —
///     not guessed. It has NOT been validated against a real BlockProver precompile's actual
///     output, since this sandbox cannot reach one. See docs/NETWORKS.md and the handoff
///     directive in docs/ANTIGRAVITY_HANDOFF.md for what real-network validation is still owed.
contract AttestcoinVerifier {
    error NotAdmin();
    error SourceContractMismatch();
    error EvidenceAlreadyConsumed();
    error VerificationFailed();
    error SourceTransactionFailed();

    event SourceContractRegistered(uint64 indexed chainKey, address indexed sourceContract);
    event SourceContractRevoked(uint64 indexed chainKey, address indexed sourceContract);
    event EvidenceVerified(
        bytes32 indexed evidenceId,
        uint64 indexed chainKey,
        address indexed sourceContract,
        uint64 height,
        bool sourceTxSuccess
    );

    address public admin;
    INativeQueryVerifier public blockProver;
    ICreditPassportSink public creditPassport;

    /// chainKey => sourceContract => allowed
    mapping(uint64 => mapping(address => bool)) public registeredSourceContracts;
    /// evidenceId = keccak256(chainKey, keccak256(encodedTransaction), logIndex) => consumed.
    /// Note this is NOT keyed on a relayer-supplied "sourceTxHash" field (there isn't one
    /// anymore) — it's keyed on the hash of the actual proven bytes, so it cannot be bypassed by
    /// a relayer choosing a convenient identity unrelated to what was really verified.
    mapping(bytes32 => bool) public evidenceConsumed;

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    constructor(address _blockProver, address _admin) {
        blockProver = INativeQueryVerifier(_blockProver);
        admin = _admin;
    }

    function setCreditPassport(address _creditPassport) external onlyAdmin {
        creditPassport = ICreditPassportSink(_creditPassport);
    }

    function registerSourceContract(uint64 chainKey, address sourceContract) external onlyAdmin {
        registeredSourceContracts[chainKey][sourceContract] = true;
        emit SourceContractRegistered(chainKey, sourceContract);
    }

    function revokeSourceContract(uint64 chainKey, address sourceContract) external onlyAdmin {
        registeredSourceContracts[chainKey][sourceContract] = false;
        emit SourceContractRevoked(chainKey, sourceContract);
    }

    /// @notice Everything the relayer supplies is STRUCTURAL (which chain/height/log to check
    /// and the proof for it) — never semantic. `sourceContract` is the relayer's claim about
    /// which registered contract to check; it's verified against the actual log emitter inside
    /// `TransactionEvidence.decode`, so a false claim just fails to find a matching log rather
    /// than being trusted.
    struct EvidenceInput {
        uint64 chainKey;
        uint64 height;
        bytes encodedTransaction;
        INativeQueryVerifier.MerkleProof merkleProof;
        INativeQueryVerifier.ContinuityProof continuityProof;
        address sourceContract;
        uint32 logIndex;
    }

    /// @notice Verifies one piece of cross-chain evidence, derives the canonical economic event
    /// from the proven transaction bytes (never from relayer input), and forwards it to
    /// CreditPassport. Reverts with a specific error identifying exactly which check failed, so
    /// the UI's Security Lab can show a deterministic rejection reason (see docs/DEMO.md).
    function submitEvidence(EvidenceInput calldata ev) external returns (bytes32 evidenceId) {
        if (!registeredSourceContracts[ev.chainKey][ev.sourceContract]) {
            revert SourceContractMismatch();
        }

        evidenceId = keccak256(abi.encodePacked(ev.chainKey, keccak256(ev.encodedTransaction), ev.logIndex));
        if (evidenceConsumed[evidenceId]) revert EvidenceAlreadyConsumed();

        bool included = blockProver.verify(ev.chainKey, ev.height, ev.encodedTransaction, ev.merkleProof, ev.continuityProof);
        if (!included) revert VerificationFailed();

        // Everything below is derived from `ev.encodedTransaction` itself — the same bytes
        // `blockProver.verify` just cryptographically proved were really included — never from
        // a relayer-supplied claim. `TransactionEvidence.decode` reverts on its own
        // (SourceContractDidNotEmitThisLog / UnknownEventSignature / LogIndexOutOfRange) if the
        // requested log doesn't genuinely exist, wasn't emitted by `ev.sourceContract`, or
        // doesn't match a known event signature. `sourceTxSuccess` is likewise derived from the
        // real receipt status inside the proven bytes, not trusted as relayer input — a
        // reverted-but-included source transaction is rejected here exactly the same as before,
        // just with no way for a relayer to lie about which outcome occurred.
        TransactionEvidence.DecodedEvidence memory decoded =
            TransactionEvidence.decode(ev.encodedTransaction, ev.sourceContract, ev.logIndex);

        // Inclusion in a block is NOT the same as successful execution — a reverted source
        // transaction can still be included and produce a receipt. This is derived from the
        // real receipt status inside the proven bytes (see TransactionEvidence.sol), not from a
        // relayer-supplied flag. Checked BEFORE marking evidence consumed or emitting, so a
        // failed submission leaves no trace and could in principle be retried (though a
        // genuinely failed source transaction cannot un-fail, so this is moot in practice).
        if (!decoded.sourceTxSuccess) revert SourceTransactionFailed();

        evidenceConsumed[evidenceId] = true;

        emit EvidenceVerified(evidenceId, ev.chainKey, ev.sourceContract, ev.height, decoded.sourceTxSuccess);

        if (address(creditPassport) != address(0)) {
            creditPassport.recordVerifiedEvent(decoded.merchantId, decoded.eventType, decoded.amount, evidenceId);
        }
    }
}
