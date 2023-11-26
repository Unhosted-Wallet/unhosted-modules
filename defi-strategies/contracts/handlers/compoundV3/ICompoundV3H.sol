// SPDX-License-Identifier: MIT

pragma solidity 0.8.20;

interface ICompoundV3Handler {
    error InvalidAmount();
    error InvalidComet();
    error NotAllowed();

    function supply(
        address comet,
        address asset,
        uint256 amount
    ) external payable;

    function supplyETH(address comet, uint256 amount) external payable;

    function withdraw(
        address comet,
        address asset,
        uint256 amount
    ) external payable returns (uint256 withdrawAmount);

    function withdrawETH(
        address comet,
        uint256 amount
    ) external payable returns (uint256 withdrawAmount);

    function borrow(
        address comet,
        uint256 amount
    ) external payable returns (uint256 borrowAmount);

    function borrowETH(
        address comet,
        uint256 amount
    ) external payable returns (uint256 borrowAmount);

    function repay(address comet, uint256 amount) external payable;

    function repayETH(address comet, uint256 amount) external payable;
}
