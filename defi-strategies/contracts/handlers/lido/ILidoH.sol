// SPDX-License-Identifier: MIT
/// This is developed and simplified based on HLido.sol by Furucombo

pragma solidity 0.8.20;

interface ILidoHandler {
    function submit(
        uint256 value
    ) external payable returns (uint256 stTokenAmount);
}
