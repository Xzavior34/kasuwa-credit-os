// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CreditPassport} from "../CreditPassport.sol";

/// @title SupplierB2BMarketplace
/// @notice Demonstrates that Kasuwa is a composable "Credit State Layer / Credit OS",
/// not a closed lending app. Any B2B supplier, invoice factorer, or hardware provider on
/// Creditcoin can query CreditPassport to grant 30-day net terms or uncollateralized inventory.
contract SupplierB2BMarketplace {
    CreditPassport public immutable passport;

    event InventoryDispatched(
        bytes32 indexed merchantId,
        uint256 orderValue,
        uint256 remainingCredit
    );

    constructor(address _passport) {
        passport = CreditPassport(_passport);
    }

    /// @notice Allows a merchant to take physical inventory on 30-day net terms based on their Kasuwa Credit Passport
    function checkoutInventory(bytes32 merchantId, uint256 invoiceAmount) external {
        uint256 available = passport.getAvailableCredit(merchantId);
        uint8 tier = passport.getCreditTier(merchantId);

        require(tier >= 2, "SupplierB2B: Merchant must be at least Tier 2");
        require(invoiceAmount <= available, "SupplierB2B: Order exceeds available credit capacity");

        // Release inventory order to merchant...
        emit InventoryDispatched(merchantId, invoiceAmount, available - invoiceAmount);
    }
}
