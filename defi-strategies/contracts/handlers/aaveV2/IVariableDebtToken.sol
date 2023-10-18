// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

interface IVariableDebtToken {
    function transfer(
        address recipient,
        uint256 amount
    ) external returns (bool);

    function mint(
        address user,
        address onBehalfOf,
        uint256 amount,
        uint256 index
    ) external returns (bool);

    function burn(address user, uint256 amount, uint256 index) external;

    function approveDelegation(address delegatee, uint256 amount) external;

    function approve(address spender, uint256 amount) external returns (bool);

    function balanceOf(address user) external view returns (uint256);

    function scaledBalanceOf(address user) external view returns (uint256);

    function scaledTotalSupply() external view returns (uint256);

    function getScaledUserBalanceAndSupply(
        address user
    ) external view returns (uint256, uint256);

    function borrowAllowance(
        address fromUser,
        address toUser
    ) external view returns (uint256);

    function allowance(
        address owner,
        address spender
    ) external view returns (uint256);

    function totalSupply() external view returns (uint256);
}
