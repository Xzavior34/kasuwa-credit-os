// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ILiquidityPool
interface ILiquidityPool {
    function availableLiquidity() external view returns (uint256);
    function fundCreditLine(address borrower, uint256 amount) external;
    function receiveRepayment(address payer, uint256 amount) external payable;
}
