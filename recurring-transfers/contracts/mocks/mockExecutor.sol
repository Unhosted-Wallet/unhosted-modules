// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import {IRecurringExecuteModule} from "contracts/interfaces/IRecurringExecuteModule.sol";
import {ERC165Checker} from "@openzeppelin/contracts/utils/introspection/ERC165Checker.sol";

/**
 * @title Mock executor
 */

contract MockExecutor {
    using ERC165Checker for address;

    IRecurringExecuteModule public recurringModule;

    bytes4 private constant _EXECUTION_INTERFACE_ID =
        type(IRecurringExecuteModule).interfaceId;

    function reEnter(
        address recurringModule,
        address userSA,
        address receiver
    ) external {
        IRecurringExecuteModule(recurringModule).executeRecurringExecution(
            userSA,
            receiver
        );
    }

    function checkInterface(
        address recurringModule
    ) external view returns (bool) {
        return recurringModule.supportsInterface(_EXECUTION_INTERFACE_ID);
    }
}
