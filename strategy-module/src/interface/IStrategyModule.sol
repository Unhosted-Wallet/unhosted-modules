// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Execution} from "kit/external/ERC7579.sol";

interface IStrategyModule {
    function executeStrategy(address strategy, uint256 value, bytes calldata strategyData)
        external
        returns (uint256 gasUsed, bytes[] memory returnData);

    function executeStrategy(address strategy, bytes calldata strategyData)
        external
        returns (uint256 gasUsed, bytes[] memory returnData);

    function executeStrategy(Execution[] calldata executions)
        external
        returns (uint256 gasUsed, bytes[] memory returnData);

    function executeTriggeredStrategy(
        address strategy,
        uint256 value,
        bytes calldata strategyData,
        address trigger,
        bytes calldata triggerData
    ) external returns (uint256 gasUsed, bytes[] memory returnData);

    function executeTriggeredStrategy(
        address strategy,
        bytes calldata strategyData,
        address trigger,
        bytes calldata triggerData
    ) external returns (uint256 gasUsed, bytes[] memory returnData);

    function executeTriggeredStrategy(Execution[] calldata executions, address trigger, bytes calldata triggerData)
        external
        returns (uint256 gasUsed, bytes[] memory returnData);

    function requiredTxGas(address smartAccount, address strategy, uint256 value, bytes calldata strategyData) external;

    function requiredTxGas(address smartAccount, address strategy, bytes calldata strategyData) external;

    function requiredTxGas(address smartAccount, Execution[] calldata executions) external;

    /**
     * @dev Allows beneficiary of a strategy to claim the accumulated fees
     */
    function claim() external;

    /**
     * @dev Allows strategy dev to add or remove their straegy from the module
     * @param strategy, address of the strategy
     * @param dev, address of the dev or beneficiary of fees
     */
    function updateStrategy(address strategy, address dev) external;
}
