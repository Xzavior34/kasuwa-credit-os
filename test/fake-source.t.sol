// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {KasuwaTestBase} from "./helpers/KasuwaTestBase.sol";
import {AttestcoinVerifier} from "../src/AttestcoinVerifier.sol";

/// INVARIANT: Unregistered source contracts cannot modify credit state.
contract FakeSourceTest is KasuwaTestBase {
    function setUp() public {
        setUpKasuwa();
    }

    function test_wrongSourceContract_isRejected_evenWithValidProof() public {
        bytes32 merchantId = bytes32("merchant-1");
        blockProver.setResult(true); // proof would otherwise verify fine

        AttestcoinVerifier.EvidenceInput memory ev =
            buildEvidence(merchantId, 0, 750, true, wrongSourceContract, wrongSourceContract);

        vm.prank(relayer);
        vm.expectRevert(AttestcoinVerifier.SourceContractMismatch.selector);
        verifier.submitEvidence(ev);

        assertEq(passport.getCreditCapacity(merchantId), 0);
    }

    function test_revokedSourceContract_isRejected() public {
        vm.prank(admin);
        verifier.revokeSourceContract(SOURCE_CHAIN_KEY, sourceContract);

        bytes32 merchantId = bytes32("merchant-1");
        AttestcoinVerifier.EvidenceInput memory ev =
            buildEvidence(merchantId, 0, 750, true, sourceContract, sourceContract);

        vm.prank(relayer);
        vm.expectRevert(AttestcoinVerifier.SourceContractMismatch.selector);
        verifier.submitEvidence(ev);
    }
}
