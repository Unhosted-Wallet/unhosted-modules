// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

// solhint-disable-next-line
import {ISignatureValidator, ISignatureValidatorConstants} from "src/interfaces/ISignatureValidator.sol";

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

interface IStrategyModule {
    struct StrategyTransaction {
        Enum.Operation operation;
        address strategy;
        uint256 value;
        bytes strategyData;
    }

    struct TriggeredStrategyTransaction {
        Enum.Operation operation;
        address strategy;
        uint256 value;
        bytes strategyData;
        address trigger;
        bytes triggerData;
    }

    /**
     * @notice Throws when the address that signed the Transaction (restored from signature)
     * differs from the address we expected to sign the Transaction (i.e. some authorized address)
     */
    error InvalidSignature();

    /**
     * @dev Calls any arbitrary logic from strategy without any confirmation if the
     * module is enabled and SA owner signed the data
     * @dev Transfer a percentage of the fee based gas usage to beneficiary of the strategy
     * @param smartAccount, address of the smart account to execute strategy
     * @param _tx, StrategyTransaction structure including amount of value to call and the arbitrary data to call on strategy
     * @param signatures, signature that should be signed by SA owner following EIP1271
     * @return executed whether the execution was successful or failed
     * @return gasUsed for execution
     * @return returnData the data returned from strategy called function
     */
    function executeStrategy(
        address smartAccount,
        StrategyTransaction memory _tx,
        bytes memory signatures
    )
        external
        returns (bool executed, uint256 gasUsed, bytes memory returnData);

    function executeTriggeredStrategy(
        address smartAccount,
        TriggeredStrategyTransaction memory _tx,
        bytes memory signatures
    ) external returns (bool executed, uint256 fee, bytes memory returnData);

    /**
     * @dev Allows to estimate a transaction.
     * @dev This method is for estimation only, it will always revert and encode the result in the revert data.
     * @dev Call this method to get an estimate of the execTransactionFromModule gas usage that are deducted with `executeStrategy`
     * @param smartAccount, address of the smart account to execute tx
     * @param _tx, StrategyTransaction structure including amount of value to call and the arbitrary data to call on strategy
     */
    function requiredTxGas(
        address smartAccount,
        StrategyTransaction memory _tx
    ) external;

    /**
     * @dev Allows beneficiary of a strategy to claim the accumulated fees
     */
    function claim() external;

    function updateStrategy(address strategy, address dev) external;

    /**
     * @dev Returns hash to be signed by owner.
     * @param _nonce Transaction nonce.
     * @return Transaction hash.
     */
    function getStrategyTxHash(
        StrategyTransaction calldata _tx,
        uint256 _nonce
    ) external view returns (bytes32);

    function getTriggeredStrategyTxHash(
        TriggeredStrategyTransaction calldata _tx,
        uint256 _nonce
    ) external view returns (bytes32);

    /**
     * @dev Returns the bytes that are hashed to be signed by owner.
     * @param _tx The strategy transaction data to be signed.
     * @param _nonce Transaction nonce.
     * @return strategyHash bytes that are hashed to be signed by the owner.
     */
    function encodeStrategyData(
        StrategyTransaction memory _tx,
        uint256 _nonce
    ) external view returns (bytes memory);

    function encodeTriggeredStrategyData(
        TriggeredStrategyTransaction memory _tx,
        uint256 _nonce
    ) external view returns (bytes memory);

    /**
     * @dev returns a value from the nonces mapping
     * @param smartAccount address of smart account to get nonce
     * @return nonce : the number of transactions made by smart account
     */
    function getNonce(address smartAccount) external view returns (uint256);

    /**
     * @dev Returns the domain separator for this contract, as defined in the EIP-712 standard.
     * @return bytes32 The domain separator hash.
     */
    function domainSeparator() external view returns (bytes32);
}
