// SPDX-License-Identifier: MIT
/// This is developed based on HAaveProtocolV2.sol by Furucombo
pragma solidity 0.8.20;

interface IAaveV2Handler {
    function deposit(
        address asset,
        uint256 amount
    ) external payable returns (uint256 depositAmount);

    function depositETH(
        uint256 amount
    ) external payable returns (uint256 depositAmount);

    function withdraw(
        address asset,
        uint256 amount
    ) external payable returns (uint256 withdrawAmount);

    function withdrawETH(
        uint256 amount
    ) external payable returns (uint256 withdrawAmount);

    function repay(
        address asset,
        uint256 amount,
        uint256 rateMode,
        address onBehalfOf
    ) external payable returns (uint256 remainDebt);

    function repayETH(
        uint256 amount,
        uint256 rateMode,
        address onBehalfOf
    ) external payable returns (uint256 remainDebt);

    function borrow(
        address asset,
        uint256 amount,
        uint256 rateMode
    ) external payable;

    function borrowETH(uint256 amount, uint256 rateMode) external payable;

    function flashLoan(
        address[] memory assets,
        uint256[] memory amounts,
        uint256[] memory modes,
        bytes memory params
    ) external payable;
}
