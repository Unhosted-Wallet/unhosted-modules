// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

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
        uint256 value;
        uint256 gas;
        bytes data;
    }

    enum Operation {
        Call,
        DelegateCall
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

    /**
     * @dev Calls any arbitrary logic from handler without any confirmation if the
     * module is enabled and SA owner signed the data
     * @dev Transfer a percentage of the fee based gas usage to beneficiary of this strategy module
     * @param smartAccount, address of biconomy smart account to execute strategy for
     * @param _tx, StrategyTransaction structure including amount if value to send to handler, gas and the arbitrary data to call on handler
     * @param signatures, signature that should be signed by SA owner following EIP1271
     * @return fee paid fee to beneficiary
     * @return executed whether the execution is success or fail
     * @return returnData the data returned from handler called function
     */
    function execStrategy(
        address smartAccount,
        StrategyTransaction memory _tx,
        bytes memory signatures
    ) external returns (uint256 fee, bool executed, bytes memory returnData);

    /**
     * @dev Allows to estimate a transaction.
     * @dev This method is for estimation only, it will always revert and encode the result in the revert data.
     * @dev Call this method to get an estimate of the execTransactionFromModule gas usage that are deducted with `execStrategy`
     * @param smartAccount, address of biconomy smart account that execute tx
     * @param _tx, StrategyTransaction structure including amount if value to send to handler, gas and the arbitrary data to call on handler
     */
    function requiredTxGas(
        address smartAccount,
        StrategyTransaction memory _tx
    ) external;

    /**
     * @dev Allows beneficiary to claim the accumulated fees in module contract
     */
    function claim() external;

    /**
     * @dev Returns hash to be signed by owner.
     * @param _nonce Transaction nonce.
     * @param smartAccount Address of the Smart Account to execute the txn.
     * @return Transaction hash.
     */
    function getTransactionHash(
        StrategyTransaction calldata _tx,
        uint256 _nonce,
        address smartAccount
    ) external view returns (bytes32);

    /**
     * @dev Returns the bytes that are hashed to be signed by owner.
     * @param smartAccount Address of the Smart Account to execute the txn.
     * @param _tx The strategy transaction data to be signed.
     * @param _nonce Transaction nonce.
     * @return strategyHash bytes that are hashed to be signed by the owner.
     */
    function encodeStrategyData(
        address smartAccount,
        StrategyTransaction memory _tx,
        uint256 _nonce
    ) external view returns (bytes memory);

    /**
     * @dev returns a value from the nonces 2d mapping
     * @param smartAccount address of smart account to get nonce
     * @return nonce : the number of transactions made by smart account
     */
    function getNonce(address smartAccount) external view returns (uint256);

    /**
     * @dev Returns the domain separator for this contract, as defined in the EIP-712 standard.
     * @param smartAccount Address of the Smart Account as verifying contract address
     * @return bytes32 The domain separator hash.
     */
    function domainSeparator(
        address smartAccount
    ) external view returns (bytes32);

    /**
     * @notice Returns the ID of the chain the contract is currently deployed on.
     * @return CHAIN_ID The ID of the current chain as a uint256.
     */
    function getChainId() external view returns (uint256);
}
