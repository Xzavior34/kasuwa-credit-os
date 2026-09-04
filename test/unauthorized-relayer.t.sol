// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {KasuwaTestBase} from "./helpers/KasuwaTestBase.sol";
import {CreditPassport} from "../src/CreditPassport.sol";

/// INVARIANT: The relayer only submits evidence — it has no privileged path to directly modify
/// credit state. Only the registered AttestcoinVerifier contract (itself gated by real proof
/// verification) may call CreditPassport.recordVerifiedEvent.
contract UnauthorizedRelayerTest is KasuwaTestBase {
    function setUp() public {
        setUpKasuwa();
    }

    function test_relayerCannotDirectlyRecordVerifiedEvent() public {
        vm.prank(relayer);
        vm.expectRevert(CreditPassport.NotAuthorized.selector);
        passport.recordVerifiedEvent(bytes32("merchant-1"), 0, 1_000_000, bytes32("fake-evidence"));
    }

    function test_relayerCannotDirectlyRecordBorrowOrRepayment() public {
        vm.prank(relayer);
        vm.expectRevert(CreditPassport.NotAuthorized.selector);
        passport.recordBorrow(bytes32("merchant-1"), 1_000_000);

        vm.prank(relayer);
        vm.expectRevert(CreditPassport.NotAuthorized.selector);
        passport.recordRepayment(bytes32("merchant-1"), 1_000_000);
    }

    function test_arbitraryAddressCannotRegisterSourceContracts() public {
        vm.prank(relayer);
        vm.expectRevert(); // AttestcoinVerifier.NotAdmin
        verifier.registerSourceContract(SOURCE_CHAIN_KEY, relayer);
    }
}
