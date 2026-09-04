// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {KasuwaTestBase} from "./helpers/KasuwaTestBase.sol";
import {AttestcoinVerifier} from "../src/AttestcoinVerifier.sol";

/// INVARIANT: Failed source transactions cannot increase credit capacity.
/// A reverted source-chain transaction can still be INCLUDED in a block and produce a receipt.
/// Inclusion must never be treated as equivalent to successful execution.
contract FailedSourceTransactionTest is KasuwaTestBase {
    function setUp() public {
        setUpKasuwa();
    }

    function test_includedButFailedTransaction_isRejected_noCapacityChange() public {
        bytes32 merchantId = bytes32("merchant-1");

        // The mock's `verify()` returns true — inclusion IS proven — but sourceTxSuccess=false,
        // modeling a transaction that reverted on the source chain yet still landed in a block.
        AttestcoinVerifier.EvidenceInput memory ev =
            buildEvidence(merchantId, 0, 750, false, sourceContract, sourceContract);

        blockProver.setResult(true); // INCLUDED = true

        vm.prank(relayer);
        vm.expectRevert(AttestcoinVerifier.SourceTransactionFailed.selector);
        verifier.submitEvidence(ev); // SUCCESS = false -> CREDIT UPDATE = rejected

        assertEq(passport.getCreditCapacity(merchantId), 0);
    }

    function test_verificationItself_failing_isRejectedSeparately() public {
        bytes32 merchantId = bytes32("merchant-2");
        blockProver.setResult(false); // precompile says NOT included

        AttestcoinVerifier.EvidenceInput memory ev =
            buildEvidence(merchantId, 0, 100, true, sourceContract, sourceContract);

        vm.prank(relayer);
        vm.expectRevert(AttestcoinVerifier.VerificationFailed.selector);
        verifier.submitEvidence(ev);
    }
}
