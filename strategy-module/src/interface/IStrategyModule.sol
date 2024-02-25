// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

contract ISignatureValidatorConstants {
    // bytes4(keccak256("isValidSignature(bytes32,bytes)")
    bytes4 internal constant EIP1271_MAGIC_VALUE = 0x1626ba7e;
}

interface IStrategyModule {
    struct StrategyTransaction {
        address strategy;

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
     * @dev Call and DelegateCall arbitrary logic from smart account with owner authorization
     * @dev Transfer a percentage of the fee based gas usage to strategy dev and unhosted
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

    /**
     * @dev Call and DelegateCall arbitrary logic from smart account with owner authorization and Trigger condition
     * specified by the owner
     * @dev Transfer a percentage of the fee based gas usage to strategy dev and unhosted
     * @param smartAccount, address of the smart account to execute strategy
     * @param _tx, StrategyTransaction structure including amount of value to call and the arbitrary data to call
     * with Trigger address and calldata as condition for execution
     * @param signatures, signature that should be signed by SA owner following EIP1271
     * @return executed whether the execution was successful or failed
     * @return gasUsed for execution
     * @return returnData the data returned from strategy called function
     */
    function executeTriggeredStrategy(
        address smartAccount,
        TriggeredStrategyTransaction memory _tx,
        bytes memory signatures
    )
        external
        returns (bool executed, uint256 gasUsed, bytes memory returnData);

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

    /**
     * @dev Allows strategy dev to add or remove their straegy from the module
     * @param strategy, address of the strategy
     * @param dev, address of the dev or beneficiary of fees
     */
    function updateStrategy(address strategy, address dev) external;

    /**
     * @dev Returns tx hash to be signed by owner.
     * @param _nonce Transaction nonce.
     * @return Transaction hash.
     */
    function getStrategyTxHash(
        StrategyTransaction calldata _tx,
        uint256 _nonce
    ) external view returns (bytes32);

    /**
     * @dev Returns tx hash with trigger to be signed by owner.
     * @param _nonce Transaction nonce.
     * @return Transaction hash.
     */
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

    /**
     * @dev Returns the bytes that are hashed to be signed by owner.
     * @param _tx The trigger strategy transaction data to be signed.
     * @param _nonce Transaction nonce.
     * @return strategyHash bytes that are hashed to be signed by the owner.
     */
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
