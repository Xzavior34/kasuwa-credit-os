// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ILiquidityPool} from "./interfaces/ILiquidityPool.sol";
import {ReentrancyGuard} from "./lib/ReentrancyGuard.sol";

/// @title LiquidityPool
/// @notice A deliberately simple liquidity pool: LPs deposit native value, only the registered
/// CreditLine may draw against it to fund policy-approved borrows. No AMM, no yield curve, no
/// risk tranching beyond a single pool — see docs/ARCHITECTURE.md for why this is intentionally
/// minimal (P2 per the priority order; a functioning simple pool beats a sophisticated broken
/// one).
contract LiquidityPool is ILiquidityPool, ReentrancyGuard {
    error NotAdmin();
    error NotCreditLine();
    error InsufficientLiquidity();
    error TransferFailed();

    event Deposited(address indexed lp, uint256 amount);
    event Withdrawn(address indexed lp, uint256 amount);
    event FundedCreditLine(address indexed borrower, uint256 amount);
    event RepaymentReceived(address indexed payer, uint256 amount);

    address public admin;
    address public creditLine;
    mapping(address => uint256) public lpBalance;
    uint256 public totalDeposited;
    uint256 public totalOutstanding;

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    modifier onlyCreditLine() {
        if (msg.sender != creditLine) revert NotCreditLine();
        _;
    }

    constructor(address _admin) {
        admin = _admin;
    }

    function setCreditLine(address _creditLine) external onlyAdmin {
        creditLine = _creditLine;
    }

    function deposit() external payable {
        lpBalance[msg.sender] += msg.value;
        totalDeposited += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external nonReentrant {
        if (lpBalance[msg.sender] < amount) revert InsufficientLiquidity();
        if (address(this).balance < totalOutstanding + amount) revert InsufficientLiquidity();
        lpBalance[msg.sender] -= amount;
        totalDeposited -= amount;
        (bool ok,) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Withdrawn(msg.sender, amount);
    }

    function availableLiquidity() external view returns (uint256) {
        uint256 bal = address(this).balance;
        if (bal <= totalOutstanding) return 0;
        return bal - totalOutstanding;
    }

    function fundCreditLine(address borrower, uint256 amount) external onlyCreditLine nonReentrant {
        if (address(this).balance < totalOutstanding + amount) revert InsufficientLiquidity();
        totalOutstanding += amount;
        (bool ok,) = borrower.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit FundedCreditLine(borrower, amount);
    }

    function receiveRepayment(address payer, uint256 amount) external payable onlyCreditLine {
        totalOutstanding = totalOutstanding >= amount ? totalOutstanding - amount : 0;
        emit RepaymentReceived(payer, amount);
    }

    receive() external payable {}
}
