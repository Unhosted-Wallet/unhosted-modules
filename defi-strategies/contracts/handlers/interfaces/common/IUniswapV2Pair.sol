// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

interface IUniswapV2Pair {
    function burn(
        address to
    ) external returns (uint256 amount0, uint256 amount1);

    function factory() external view returns (address);

    function token0() external view returns (address);

    function token1() external view returns (address);

    function getReserves()
        external
        view
        returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);

    function totalSupply() external view returns (uint256);

    function kLast() external view returns (uint256);
}
