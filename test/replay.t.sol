// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {KasuwaTestBase} from "./helpers/KasuwaTestBase.sol";
import {AttestcoinVerifier} from "../src/AttestcoinVerifier.sol";

/// INVARIANT: Consumed evidence cannot execute twice.
contract ReplayTest is KasuwaTestBase {
    function setUp() public {
        setUpKasuwa();
    }

    function test_firstSubmission_succeeds_secondSubmission_isRejected() public {
        AttestcoinVerifier.EvidenceInput memory ev =
            buildEvidence(bytes32("merchant-1"), 0, 750, true, sourceContract, sourceContract);

        vm.prank(relayer);
        bytes32 evidenceId = verifier.submitEvidence(ev);
        assertTrue(verifier.evidenceConsumed(evidenceId));

        vm.prank(relayer);
        vm.expectRevert(AttestcoinVerifier.EvidenceAlreadyConsumed.selector);
        verifier.submitEvidence(ev);
    }
}
