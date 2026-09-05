// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {KasuwaTestBase} from "./helpers/KasuwaTestBase.sol";
import {AttestcoinVerifier} from "../src/AttestcoinVerifier.sol";
import {CreditLine} from "../src/CreditLine.sol";
import {LiquidityPool} from "../src/LiquidityPool.sol";
import {MaliciousReentrantBorrower} from "./mocks/MaliciousReentrantBorrower.sol";
import {MaliciousReentrantLP} from "./mocks/MaliciousReentrantLP.sol";
import {ReentrancyGuard} from "../src/lib/ReentrancyGuard.sol";

/// INVARIANT: no external native-value transfer made by this protocol can be used to re-enter
/// the call that triggered it. Closes the gap flagged in docs/THREAT_MODEL.md's "Honest gaps"
/// ("No dedicated reentrancy attack test", "no ReentrancyGuard yet").
///
/// Both attacks below are real, not hypothetical: before this fix, `CreditLine.borrow` called
/// `liquidityPool.fundCreditLine` (an external value transfer to the borrower) BEFORE
/// `creditPassport.recordBorrow` updated exposure — a malicious borrower's `receive()` could
/// call `borrow` again while `currentExposure` was still stale, borrowing twice against a
/// single-borrow exposure limit. `LiquidityPool.withdraw` already followed
/// checks-effects-interactions correctly, but had no guard against a same-function reentrant
/// call draining more than a single legitimate withdrawal.
contract ReentrancyTest is KasuwaTestBase {
    function setUp() public {
        setUpKasuwa();
    }

    function _giveMerchantCapacity(bytes32 merchantId, uint256 amount) internal {
        AttestcoinVerifier.EvidenceInput memory ev =
            buildEvidence(merchantId, 0, amount, true, sourceContract, sourceContract);
        vm.prank(relayer);
        verifier.submitEvidence(ev);
    }

    /// Attack: a malicious borrower contract re-enters `CreditLine.borrow` from `receive()`
    /// during the very transfer that funds its first borrow, attempting to draw a second loan
    /// before its exposure is recorded. Expected: the re-entrant call reverts with
    /// `ReentrancyGuard.ReentrantCall`, and only the first, legitimate borrow's exposure is ever
    /// recorded.
    function test_reentrantBorrow_isBlocked() public {
        bytes32 merchantId = bytes32("merchant-reentrant");
        // Plenty of verified capacity — if the reentrant borrow succeeded, capacity would not be
        // the limiting factor, isolating the assertion to the reentrancy guard itself.
        _giveMerchantCapacity(merchantId, 1_000_000);

        MaliciousReentrantBorrower attacker = new MaliciousReentrantBorrower(creditLine);

        uint256 loanAmount = 1_000; // well under the $2,000 maxLoanAmount / maxBorrowerExposure
        attacker.attack(merchantId, loanAmount, 7 days);

        // The re-entrant inner call must have reverted with the guard's own custom error, not
        // e.g. a policy rejection (which would prove nothing about reentrancy specifically).
        assertTrue(attacker.reentryReverted());
        assertEq(bytes4(attacker.reentryRevertData()), ReentrancyGuard.ReentrantCall.selector);
    }

    /// Same attack, asserting the *outcome* rather than just the revert selector: exposure ends
    /// up as exactly one loan's worth, never two, and the attacker only ever receives one
    /// loan's worth of native value.
    function test_reentrantBorrow_onlyRecordsExposureOnce() public {
        bytes32 merchantId = bytes32("merchant-reentrant-2");
        _giveMerchantCapacity(merchantId, 1_000_000);

        MaliciousReentrantBorrower attacker = new MaliciousReentrantBorrower(creditLine);
        uint256 loanAmount = 1_000;

        attacker.attack(merchantId, loanAmount, 7 days);

        assertEq(creditLine.getCurrentExposure(merchantId), loanAmount, "exposure must reflect exactly one borrow");
        assertEq(address(attacker).balance, loanAmount, "attacker must receive exactly one loan's worth of value");
    }

    /// Attack: a malicious LP re-enters `LiquidityPool.withdraw` from `receive()` during its own
    /// payout, attempting to withdraw twice against a single deposited balance. Expected: the
    /// re-entrant call reverts via the guard, and the LP's real balance is debited exactly once.
    function test_reentrantWithdraw_isBlocked() public {
        MaliciousReentrantLP maliciousLp = new MaliciousReentrantLP(pool);
        vm.deal(address(maliciousLp), 5 ether);
        vm.prank(address(maliciousLp));
        maliciousLp.deposit{value: 2 ether}();

        maliciousLp.attackWithdraw(1 ether, 1 ether);

        assertTrue(maliciousLp.reentryReverted(), "reentrant withdraw must revert");
        assertEq(pool.lpBalance(address(maliciousLp)), 1 ether, "only the first withdrawal should have been debited");
        assertEq(address(maliciousLp).balance, 5 ether - 2 ether + 1 ether, "attacker should only ever receive one withdrawal's worth");
    }
}
