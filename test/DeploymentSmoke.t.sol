// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AttestcoinVerifier} from "../src/AttestcoinVerifier.sol";
import {CreditPassport} from "../src/CreditPassport.sol";
import {CreditEngine} from "../src/CreditEngine.sol";
import {PolicyEngine} from "../src/PolicyEngine.sol";
import {CreditLine} from "../src/CreditLine.sol";
import {LiquidityPool} from "../src/LiquidityPool.sol";
import {EconomicEvents} from "../src/EconomicEvents.sol";
import {MockBlockProver} from "./mocks/MockBlockProver.sol";
import {INativeQueryVerifier} from "../src/interfaces/INativeQueryVerifier.sol";
import {TransactionEvidence} from "../src/lib/TransactionEvidence.sol";

/// @title DeploymentSmoke
/// @notice Runs the exact same deployment + wiring steps as `script/Deploy.s.sol`, but inside
/// Foundry's fast in-process test EVM rather than a real RPC round-trip. This is the quick,
/// CI-friendly check that the deployment *logic* is correct; `demo/run_local_vertical_slice.sh`
/// is the slower, real-RPC-round-trip proof that the actual script and real transactions work
/// end to end. Both exist because they catch different classes of bug — this one is cheap
/// enough to run on every `forge test` invocation; that one is closer to what a judge or
/// real deployer actually experiences.
contract DeploymentSmokeTest is Test {
    function test_fullStackDeploysAndWiresCorrectly() public {
        address admin = address(0xA11CE);

        MockBlockProver blockProver = new MockBlockProver();
        EconomicEvents economicEvents = new EconomicEvents();

        vm.startPrank(admin);
        AttestcoinVerifier verifier = new AttestcoinVerifier(address(blockProver), admin);
        CreditEngine engine = new CreditEngine();
        CreditPassport passport = new CreditPassport(admin, engine);
        PolicyEngine policy = new PolicyEngine(admin);
        LiquidityPool pool = new LiquidityPool(admin);
        CreditLine creditLine = new CreditLine(admin, passport, policy, pool, engine);

        passport.setAttestcoinVerifier(address(verifier));
        passport.setCreditLine(address(creditLine));
        pool.setCreditLine(address(creditLine));
        verifier.setCreditPassport(address(passport));
        verifier.registerSourceContract(2, address(economicEvents));
        vm.stopPrank();

        assertEq(passport.attestcoinVerifier(), address(verifier), "CreditPassport not wired to AttestcoinVerifier");
        assertEq(passport.creditLine(), address(creditLine), "CreditPassport not wired to CreditLine");
        assertEq(pool.creditLine(), address(creditLine), "LiquidityPool not wired to CreditLine");
        assertEq(address(verifier.creditPassport()), address(passport), "AttestcoinVerifier not wired to CreditPassport");
        assertTrue(
            verifier.registeredSourceContracts(2, address(economicEvents)), "EconomicEvents not registered as source contract"
        );
        assertEq(passport.admin(), admin, "CreditPassport admin not set correctly");
        assertEq(policy.admin(), admin, "PolicyEngine admin not set correctly");

        // A smoke test should also prove the wiring actually WORKS end to end, not just that the
        // pointers are set — submit one real (mocked-precompile, but genuinely on-chain-decoded)
        // piece of evidence and confirm it lands with the canonical, derived (not claimed) facts.
        blockProver.setResult(true);
        bytes32 merchantId = bytes32("smoke-merchant");
        AttestcoinVerifier.EvidenceInput memory ev = _evidence(merchantId, economicEvents);
        vm.prank(address(0xBEEF));
        verifier.submitEvidence(ev);
        assertEq(passport.getCreditCapacity(merchantId), 75, "deployment smoke: capacity did not update as expected");
    }

    function _evidence(bytes32 merchantId, EconomicEvents economicEvents)
        internal
        pure
        returns (AttestcoinVerifier.EvidenceInput memory)
    {
        TransactionEvidence.RawLog[] memory logs = new TransactionEvidence.RawLog[](1);
        bytes32[] memory topics = new bytes32[](3);
        topics[0] = TransactionEvidence.eventTypeSignature(0); // PaymentSettled
        topics[1] = merchantId;
        topics[2] = bytes32(uint256(uint160(address(0xDEAD))));
        logs[0] = TransactionEvidence.RawLog({
            emitter: address(economicEvents),
            topics: topics,
            data: abi.encode(uint256(750), bytes32("ref"), uint64(1700000000))
        });

        bytes memory chunk1 =
            abi.encode(uint64(0), uint64(21000), address(0x1111), false, address(economicEvents), uint256(0), bytes(""));
        bytes memory chunk2 = abi.encode(uint64(1), uint128(0), uint128(0));
        bytes memory chunk3 = abi.encode(uint8(1), uint64(21000), logs, bytes(""));
        bytes[] memory chunks = new bytes[](3);
        chunks[0] = chunk1;
        chunks[1] = chunk2;
        chunks[2] = chunk3;
        bytes memory encodedTx = abi.encode(uint8(2), chunks);

        return AttestcoinVerifier.EvidenceInput({
            chainKey: 2,
            height: 1,
            encodedTransaction: encodedTx,
            merkleProof: _emptyMerkleProof(),
            continuityProof: _emptyContinuityProof(),
            sourceContract: address(economicEvents),
            logIndex: 0
        });
    }

    function _emptyMerkleProof() internal pure returns (INativeQueryVerifier.MerkleProof memory) {
        INativeQueryVerifier.MerkleProofEntry[] memory siblings = new INativeQueryVerifier.MerkleProofEntry[](0);
        return INativeQueryVerifier.MerkleProof({root: bytes32(0), siblings: siblings});
    }

    function _emptyContinuityProof() internal pure returns (INativeQueryVerifier.ContinuityProof memory) {
        bytes32[] memory roots = new bytes32[](0);
        return INativeQueryVerifier.ContinuityProof({lowerEndpointDigest: bytes32(0), roots: roots});
    }
}
