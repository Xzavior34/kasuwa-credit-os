// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ICreditPassportSink
/// @notice The narrow write interface AttestcoinVerifier uses to forward verified economic
/// events into CreditPassport. Deliberately minimal so the verifier cannot do anything to
/// passport state beyond recording an already-verified event.
interface ICreditPassportSink {
    function recordVerifiedEvent(bytes32 merchantId, uint8 eventType, uint256 amount, bytes32 evidenceId) external;
}
