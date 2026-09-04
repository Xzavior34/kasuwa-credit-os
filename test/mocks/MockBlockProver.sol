// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {INativeQueryVerifier} from "../../src/interfaces/INativeQueryVerifier.sol";

/// @title MockBlockProver
/// @notice TEST-ONLY double for Creditcoin's real BlockProver precompile. Lives exclusively
/// under test/ and is never imported by anything under src/ or deployments/. Its `verify`
/// result is set by the test itself (`setResult`), so tests can exercise both the "real proof
/// verifies" and "real proof fails" paths deterministically without a live Creditcoin RPC. See
/// docs/SECURITY_MODEL.md for why this substitution is safe and clearly labeled.
contract MockBlockProver is INativeQueryVerifier {
    bool public nextResult = true;

    function setResult(bool result) external {
        nextResult = result;
    }

    function calculateTxIndex(MerkleProof calldata) external pure returns (uint64) {
        return 0;
    }

    function verify(uint64, uint64, bytes calldata, MerkleProof calldata, ContinuityProof calldata)
        external
        view
        returns (bool)
    {
        return nextResult;
    }

    function verifyAndEmit(uint64 chainKey, uint64 height, bytes calldata, MerkleProof calldata, ContinuityProof calldata)
        external
        returns (bool)
    {
        if (nextResult) {
            emit TransactionVerified(chainKey, height, 0);
        }
        return nextResult;
    }
}
