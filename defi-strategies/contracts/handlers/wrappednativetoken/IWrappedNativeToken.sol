// SPDX-License-Identifier: MIT

pragma solidity 0.8.20;

interface IWrappedNativeToken {
    function deposit() external payable;

    function withdraw(uint256 wad) external;

    function balanceOf(address) external view returns (uint256);
}
