// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title INativeQueryVerifier
/// @notice Mirrors the ABI of Creditcoin's native BlockProver precompile exactly as published in
/// gluwa usc-sdk v0.18.0 (dist/block-prover/block_prover.json). Verified by downloading the real
/// npm package (`npm pack` on the scoped package, version 0.18.0) and inspecting its shipped ABI/types on
/// 2026-09-05 — see docs/NETWORKS.md for the verification trail. Nothing in this interface is
/// invented; method names, struct shapes and the event signature are copied from that ABI.
interface INativeQueryVerifier {
    struct MerkleProofEntry {
        bytes32 hash;
        bool isLeft;
    }

    struct MerkleProof {
        bytes32 root;
        MerkleProofEntry[] siblings;
    }

    struct ContinuityProof {
        bytes32 lowerEndpointDigest;
        bytes32[] roots;
    }

    /// @dev Emitted by the precompile itself on `verifyAndEmit`/`verifyAndEmitSingle`. We do not
    /// emit this — it is documented here so callers know it exists as a corroborating on-chain
    /// signal distinct from our own `EvidenceVerified` event.
    event TransactionVerified(uint64 indexed chainKey, uint64 indexed height, uint64 transactionIndex);

    function calculateTxIndex(MerkleProof calldata merkleProof) external view returns (uint64);

    function verify(
        uint64 chainKey,
        uint64 height,
        bytes calldata encodedTransaction,
        MerkleProof calldata merkleProof,
        ContinuityProof calldata continuityProof
    ) external view returns (bool);

    function verifyAndEmit(
        uint64 chainKey,
        uint64 height,
        bytes calldata encodedTransaction,
        MerkleProof calldata merkleProof,
        ContinuityProof calldata continuityProof
    ) external returns (bool);
}

/// @dev Real, verified precompile address for Creditcoin's BlockProver (source: gluwa usc-sdk
/// v0.18.0 `BLOCK_PROVER_PRECOMPILE_ADDRESS` export). Production deployments should point
/// AttestcoinVerifier at this address.
address constant BLOCK_PROVER_PRECOMPILE_ADDRESS = 0x0000000000000000000000000000000000000FD2;

/// @dev Real, verified precompile address for Creditcoin's ChainInfo precompile (source:
/// gluwa usc-sdk v0.18.0 `CHAIN_INFO_PRECOMPILE_ADDRESS` export). Not yet wired into
/// AttestcoinVerifier in this MVP — see docs/SECURITY_MODEL.md "Known limitations".
address constant CHAIN_INFO_PRECOMPILE_ADDRESS = 0x0000000000000000000000000000000000000fD3;
