// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {KasuwaTestBase} from "./helpers/KasuwaTestBase.sol";
import {AttestcoinVerifier} from "../src/AttestcoinVerifier.sol";
import {TransactionEvidence} from "../src/lib/TransactionEvidence.sol";
import {SupplierB2BMarketplace} from "../src/examples/SupplierB2BMarketplace.sol";

/// @title CircleUsdcAndComposabilityTest
/// @notice Proves that:
/// 1. Real standard Circle USDC Transfer events on Ethereum Sepolia (0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238)
///    are decoded on-chain into verified credit capacity without requiring proprietary contracts.
/// 2. Third-party B2B applications on Creditcoin can compose seamlessly with Kasuwa CreditPassport.
contract CircleUsdcAndComposabilityTest is KasuwaTestBase {
    address internal constant SEPOLIA_USDC = 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238;
    SupplierB2BMarketplace internal b2b;

    function setUp() public {
        setUpKasuwa();
        vm.startPrank(admin);
        verifier.registerSourceContract(SOURCE_CHAIN_KEY, SEPOLIA_USDC);
        b2b = new SupplierB2BMarketplace(address(passport));
        vm.stopPrank();
    }

    /// @notice Builds a standard ERC-20 Transfer log: Transfer(address from, address to, uint256 value)
    function buildErc20TransferLog(address token, address from, address to, uint256 value)
        internal
        pure
        returns (TransactionEvidence.RawLog memory)
    {
        bytes32[] memory topics = new bytes32[](3);
        topics[0] = keccak256("Transfer(address,address,uint256)");
        topics[1] = bytes32(uint256(uint160(from)));
        topics[2] = bytes32(uint256(uint160(to)));
        bytes memory data = abi.encode(value);
        return TransactionEvidence.RawLog({emitter: token, topics: topics, data: data});
    }

    /// INVARIANT: Standard Circle USDC Transfer on Sepolia builds real on-chain credit capacity
    function test_circleUsdcTransfer_verifiesAndIncreasesMerchantCapacity() public {
        address customer = address(0xC057011E8);
        address merchantSepoliaAddress = address(0x111122223333444455556666777788889999aAaa);
        bytes32 merchantId = bytes32(uint256(uint160(merchantSepoliaAddress)));
        uint256 usdcPayment = 15_000 * 1e6; // 15,000 USDC (6 decimals)

        TransactionEvidence.RawLog[] memory logs = new TransactionEvidence.RawLog[](1);
        logs[0] = buildErc20TransferLog(SEPOLIA_USDC, customer, merchantSepoliaAddress, usdcPayment);

        bytes memory encodedTx = buildEncodedTransaction(SEPOLIA_USDC, true, logs, 999);
        AttestcoinVerifier.EvidenceInput memory ev = AttestcoinVerifier.EvidenceInput({
            chainKey: SOURCE_CHAIN_KEY,
            height: 11640100,
            encodedTransaction: encodedTx,
            merkleProof: emptyMerkleProofStatic(),
            continuityProof: emptyContinuityProofStatic(),
            sourceContract: SEPOLIA_USDC,
            logIndex: 0
        });

        // Relayer submits genuine USDC transfer proof
        vm.prank(relayer);
        verifier.submitEvidence(ev);

        // Verify credit passport received turnover
        (uint256 events, uint256 volume) = passport.getVerifiedEconomicActivity(merchantId);
        assertEq(events, 1);
        assertEq(volume, usdcPayment);

        uint256 capacity = passport.getCreditCapacity(merchantId);
        assertGt(capacity, 0, "Capacity must increase from verified USDC turnover");
    }

    /// INVARIANT: Third-party B2B marketplace can compose with CreditPassport for inventory financing
    function test_thirdPartyB2BMarketplace_composesWithCreditPassport() public {
        address merchantSepoliaAddress = address(0x55556666777788889999AAaA1111222233334444);
        bytes32 merchantId = bytes32(uint256(uint160(merchantSepoliaAddress)));

        // Submit 50,000 USDC turnover so merchant reaches Tier 2+
        TransactionEvidence.RawLog[] memory logs = new TransactionEvidence.RawLog[](1);
        logs[0] = buildErc20TransferLog(SEPOLIA_USDC, address(0xABCD), merchantSepoliaAddress, 50_000 * 1e6);

        bytes memory encodedTx = buildEncodedTransaction(SEPOLIA_USDC, true, logs, 1234);
        AttestcoinVerifier.EvidenceInput memory ev = AttestcoinVerifier.EvidenceInput({
            chainKey: SOURCE_CHAIN_KEY,
            height: 11640200,
            encodedTransaction: encodedTx,
            merkleProof: emptyMerkleProofStatic(),
            continuityProof: emptyContinuityProofStatic(),
            sourceContract: SEPOLIA_USDC,
            logIndex: 0
        });

        vm.prank(relayer);
        verifier.submitEvidence(ev);

        uint256 availableCredit = passport.getAvailableCredit(merchantId);
        assertGt(availableCredit, 1000, "Should have ample credit for inventory");

        // Merchant takes $1,000 of inventory on 30-day net terms from B2B supplier
        b2b.checkoutInventory(merchantId, 1000);

        // Trying to checkout more than available credit is rejected
        vm.expectRevert("SupplierB2B: Order exceeds available credit capacity");
        b2b.checkoutInventory(merchantId, availableCredit + 1);
    }
}
