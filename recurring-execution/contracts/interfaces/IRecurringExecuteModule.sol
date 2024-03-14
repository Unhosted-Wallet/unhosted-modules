// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

abstract contract Enum {
    enum Operation {
        Call,
        DelegateCall
    }
}

interface IExecFromModule {
    function execTransactionFromModule(
        address to,
        uint256 value,
        bytes memory data,
        Enum.Operation operation,
        uint256 txGas
    ) external returns (bool success);

    function execTransactionFromModule(
        address to,
        uint256 value,
        bytes memory data,
        Enum.Operation operation
    ) external returns (bool success);

    function execTransactionFromModuleReturnData(
        address to,
        uint256 value,
        bytes memory data,
        Enum.Operation operation
    ) external returns (bool success, bytes memory returnData);
}

interface IRecurringExecuteModule {
    enum ExecutionBasis {
        Daily,
        Weekly,
        Monthly
    }

    struct RecurringExecution {
        ExecutionBasis basis;
        uint256 value;
        bytes data;
        uint8 executionDay;
        uint8 executionHourStart;
        uint8 executionHourEnd;
        uint32 lastExecutionTime;
    }

    event RecurringExecutionAdded(address account, address target);
    event RecurringExecutionRemoved(address account, address target);
    event RecurringExecutionExecuted(address account, address target);

    error InvalidExecutionDay();
    error InvalidExecutionHour();
    error InvalidAddress();
    error InvalidDailyExecution();
    error InvalidWeeklyExecution();
    error InvalidMonthlyExecution();
    error NoRecurringExecution();

    function addRecurringExecution(
        ExecutionBasis basis,
        address receiver,
        uint256 value,
        uint8 executionDay,
        uint8 executionHourStart,
        uint8 executionHourEnd,
        bytes calldata data
    ) external payable;

    function removeRecurringExecution(address receiver) external payable;

    function executeRecurringExecution(
        address smartAccount,
        address receiver
    ) external returns (bool success, bytes memory returnData);
}
