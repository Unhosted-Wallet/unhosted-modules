// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

/**
 * @title Mock Gas price feed
 */

contract MockAggregatorV3 is AggregatorV3Interface {
    int256 private _gasPrice;

    constructor(int256 gasPrice_) {
        _gasPrice = gasPrice_;
    }

    function updateRoundData(int256 gasPrice) external {
        _gasPrice = gasPrice;
    }

    // solhint-disable-next-line
    function decimals() external view returns (uint8) {}

    // solhint-disable-next-line
    function description() external view returns (string memory) {}

    // solhint-disable-next-line
    function version() external view returns (uint256) {}

    function getRoundData(
        uint80 _roundId
    )
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    // solhint-disable-next-line
    {

    }

    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        return (0, _gasPrice, 0, 0, 0);
    }
}
