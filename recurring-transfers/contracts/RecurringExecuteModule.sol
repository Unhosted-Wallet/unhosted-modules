pragma solidity ^0.8.20;

import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import {IExecFromModule, IRecurringExecuteModule, Enum} from "contracts/interfaces/IRecurringExecuteModule.sol";
import {BokkyPooBahsDateTimeLibrary} from "contracts/libs/BokkyPooBahsDateTimeLibrary.sol";

/**
 * @title Recurring Execute Module - Allows an owner to create arbitrary execution that can be executed by anyone on a recurring basis
 * @dev Compatible with Biconomy Modular Interface v 0.1
 * @author M. Zakeri Rad - <@zakrad>
 */

contract RecurringExecuteModule is
    ERC165,
    ReentrancyGuard,
    IRecurringExecuteModule
{
    using BokkyPooBahsDateTimeLibrary for *;

    string public constant NAME = "Recurring Execute Module";
    string public constant VERSION = "0.1.0";

    /// recurringExecution maps account address to receiver to a recurring execution struct.
    mapping(address => mapping(address => RecurringExecution))
        public recurringExecution;

    /**
     * @dev Creates a recurring execution.
     * @param basis Which is Daily, Weekly or Monthly.
     * @param receiver The address receiving the recurring execution.
     * @param value The value to send with tx.
     * @param data Arbitrary data to execute on receiver address
     * @param executionDay Day of the month or week when the recurring execution can be executed (1-28 Monthly)(1-7 Weekly).
     * @param executionHourStart Time of the day when execution can be executed (0-22).
     * @param executionHourEnd Time of the day when execution can no longer be executed (1-23).
     */
    function addRecurringExecution(
        ExecutionBasis basis,
        address receiver,
        uint256 value,
        uint8 executionDay,
        uint8 executionHourStart,
        uint8 executionHourEnd,
        bytes calldata data
    ) public payable {
        if (executionDay == 0) {
            revert InvalidExecutionDay();
        } else if (basis == ExecutionBasis.Monthly && executionDay >= 29) {
            revert InvalidExecutionDay();
        } else if (basis == ExecutionBasis.Weekly && executionDay >= 8) {
            revert InvalidExecutionDay();
        }

        if (
            executionHourStart == 0 ||
            executionHourEnd >= 23 ||
            executionHourStart >= executionHourEnd
        ) {
            revert InvalidExecutionHour();
        }
        recurringExecution[msg.sender][receiver] = RecurringExecution(
            basis,
            value,
            data,
            executionDay,
            executionHourStart,
            executionHourEnd,
            0
        );
    }

    /**
     * @dev Removes a recurring execution.
     * @param receiver address of receiver of execution call.
     */
    function removeRecurringExecution(address receiver) public payable {
        delete recurringExecution[msg.sender][receiver];
    }

    /**
     * @dev Executes a recurring execution.
     * @param smartAccount The address of account that execute the tx.
     * @param receiver The address that will call by account.
     */
    function executeRecurringExecution(
        address smartAccount,
        address receiver
    ) public nonReentrant returns (bool success, bytes memory returnData) {
        if (smartAccount == address(0) || receiver == address(0)) {
            revert InvalidAddress();
        }
        RecurringExecution memory executionData = recurringExecution[
            smartAccount
        ][receiver];
        if (executionData.executionHourStart == 0) {
            revert NoRecurringExecution();
        }
        if (
            executionData.basis == ExecutionBasis.Daily &&
            !isValidDaily(executionData)
        ) {
            revert InvalidDailyExecution();
        } else if (
            executionData.basis == ExecutionBasis.Weekly &&
            !isValidWeekly(executionData)
        ) {
            revert InvalidWeeklyExecution();
        } else if (
            executionData.basis == ExecutionBasis.Monthly &&
            !isValidMonthly(executionData)
        ) {
            revert InvalidMonthlyExecution();
        }

        recurringExecution[smartAccount][receiver].lastExecutionTime = uint32(
            block.timestamp
        );

        (success, returnData) = IExecFromModule(smartAccount)
            .execTransactionFromModuleReturnData(
                receiver,
                executionData.value,
                executionData.data,
                Enum.Operation.Call
            );
    }

    /**
     * @dev See {IERC165-supportsInterface}.
     */
    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(ERC165) returns (bool) {
        return
            interfaceId == type(IRecurringExecuteModule).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    function isValidDaily(
        RecurringExecution memory executionData
    ) internal view returns (bool) {
        return
            isPastDay(executionData.lastExecutionTime) &&
            isBetweenHours(
                executionData.executionHourStart,
                executionData.executionHourEnd
            );
    }

    function isValidWeekly(
        RecurringExecution memory executionData
    ) internal view returns (bool) {
        return
            isPastWeek(executionData.lastExecutionTime) &&
            isOnDayOfWeekAndBetweenHours(
                executionData.executionDay,
                executionData.executionHourStart,
                executionData.executionHourEnd
            );
    }

    function isValidMonthly(
        RecurringExecution memory executionData
    ) internal view returns (bool) {
        return
            isPastMonth(executionData.lastExecutionTime) &&
            isOnDayAndBetweenHours(
                executionData.executionDay,
                executionData.executionHourStart,
                executionData.executionHourEnd
            );
    }

    function isOnDayAndBetweenHours(
        uint8 day,
        uint8 hourStart,
        uint8 hourEnd
    ) internal view returns (bool) {
        return
            block.timestamp.getDay() == day &&
            block.timestamp.getHour() >= hourStart &&
            block.timestamp.getHour() < hourEnd;
    }

    function isOnDayOfWeekAndBetweenHours(
        uint8 day,
        uint8 hourStart,
        uint8 hourEnd
    ) internal view returns (bool) {
        return
            block.timestamp.getDayOfWeek() == day &&
            block.timestamp.getHour() >= hourStart &&
            block.timestamp.getHour() < hourEnd;
    }

    function isBetweenHours(
        uint8 hourStart,
        uint8 hourEnd
    ) internal view returns (bool) {
        return
            block.timestamp.getHour() >= hourStart &&
            block.timestamp.getHour() < hourEnd;
    }

    function isPastMonth(uint256 previousTime) internal view returns (bool) {
        return
            block.timestamp.getYear() > previousTime.getYear() ||
            block.timestamp.getMonth() > previousTime.getMonth();
    }

    function isPastDay(uint256 previousTime) internal view returns (bool) {
        return
            block.timestamp.getYear() > previousTime.getYear() ||
            block.timestamp.getMonth() > previousTime.getMonth() ||
            block.timestamp.getDay() > previousTime.getDay();
    }

    function isPastWeek(uint256 previousTime) internal view returns (bool) {
        return
            block.timestamp.getYear() > previousTime.getYear() ||
            block.timestamp.getMonth() > previousTime.getMonth() ||
            (block.timestamp.getDay() - 1) / 7 >
            (previousTime.getDay() - 1) / 7;
    }
}
