// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import {Enum} from "../Enum.sol";

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
}

interface IStrategyModule {
    struct StrategyTransaction {
        uint256 value;
        uint256 gas;
        bytes data;
    }

    /**
     * @notice Throws when the address that signed the data (restored from signature)
     * differs from the address we expected to sign the data (i.e. some authorized address)
     */
    error InvalidSignature();

    function init(
        address beneficiary_,
        address handler_
    ) external returns (bool);

    function execStrategy(
        address strategyModule,
        StrategyTransaction memory _tx,
        bytes memory signatures
    ) external payable returns (bool);

    function getTransactionHash(
        StrategyTransaction calldata _tx,
        uint256 _nonce,
        address strategyModule
    ) external view returns (bytes32);

    function encodeStrategyData(
        address strategyModule,
        StrategyTransaction memory _tx,
        uint256 _nonce
    ) external view returns (bytes memory);

    function getNonce(address strategyModule) external view returns (uint256);

    function domainSeparator(
        address strategyModule
    ) external view returns (bytes32);

    function getChainId() external view returns (uint256);
}
