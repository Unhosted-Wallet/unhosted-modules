// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import {IStrategyModule} from "contracts/interfaces/IStrategyModule.sol";
import {ERC165Checker} from "@openzeppelin/contracts/utils/introspection/ERC165Checker.sol";

/**
 * @title Mock handler
 */

contract MockHandler {
    using ERC165Checker for address;

    IStrategyModule public strategyModule;

    bytes4 private constant _STRATEGY_INTERFACE_ID =
        type(IStrategyModule).interfaceId;

    function reEnter(address strategyModule) external {
        IStrategyModule.StrategyTransaction memory _tx = IStrategyModule
            .StrategyTransaction(0, 0, "0x0");
        IStrategyModule(strategyModule).execStrategy(
            strategyModule,
            _tx,
            "0x0"
        );
    }

    function emptyWallet() external {
        address(strategyModule).call{value: address(this).balance}("");
    }

    function checkInterface(
        address strategyModule
    ) external view returns (bool) {
        return strategyModule.supportsInterface(_STRATEGY_INTERFACE_ID);
    }
}
