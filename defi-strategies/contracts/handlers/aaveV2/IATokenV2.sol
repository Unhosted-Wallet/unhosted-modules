// SPDX-License-Identifier: MIT

pragma solidity 0.8.20;

interface IATokenV2 {
    function transfer(
        address _to,
        uint256 _value
    ) external returns (bool success);

    function transferFrom(
        address _from,
        address _to,
        uint256 _value
    ) external returns (bool success);

    function approve(
        address _spender,
        uint256 _value
    ) external returns (bool success);

    function totalSupply() external view returns (uint256 supply);

    function balanceOf(address _owner) external view returns (uint256 balance);

    function allowance(
        address _owner,
        address _spender
    ) external view returns (uint256 remaining);

    function name() external view returns (string memory);

    function symbol() external view returns (string memory);

    function decimals() external view returns (uint8);
}
