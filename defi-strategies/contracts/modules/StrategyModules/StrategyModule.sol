// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import {ISignatureValidator, ISignatureValidatorConstants} from "../../interfaces/ISignatureValidator.sol";
import {Enum} from "../../common/Enum.sol";
import {ReentrancyGuard} from "../../common/ReentrancyGuard.sol";

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

/**
 * @title Defi Base Strategy module for Biconomy Smart Accounts.
 * @dev Compatible with Biconomy Modular Interface v 0.1
 * - It allows to delegate call to external defi strategy contracts and execute arbitrary data.
 * - EIP-1271 compatible (checks if the signer is the owner).
 * @author M. Zakeri Rad - <@zakrad>
 */

contract StrategyModule is ReentrancyGuard, ISignatureValidatorConstants {
    // Domain Seperators keccak256("EIP712Domain(uint256 chainId,address verifyingContract)");
    bytes32 internal constant DOMAIN_SEPARATOR_TYPEHASH =
        0x47e79534a245952e8b16893a336b85a3d9ea9fa8c573f3d803afb92a79469218;

    // solhint-disable-next-line
    // keccak256("EXECUTE_STRATEGY(address handler,uint256 value,bytes data,uint256 nonce)");
    bytes32 internal constant EXECUTE_STRATEGY_TYPEHASH =
        0x067332dbff139b7d81512f407f309532ef06acd3d4e68b87479e56651a4c9a87;

    /* solhint-disable var-name-mixedcase */
    uint256 private immutable CHAIN_ID;

    mapping(address => uint256) public nonces;

    address public immutable handler;

    string public constant NAME = "Strategy Module";
    string public constant VERSION = "0.1.0";

    constructor(address handler_) {
        handler = handler_;
        CHAIN_ID = block.chainid;
    }

    /**
     * it can call any arbitrary logic from handler without any confirmation if the
     * module is enabled and SA owner signed the data
     */
    function execStrategy(
        address smartAccount,
        StrategyTransaction memory _tx,
        bytes memory signatures
    ) public payable virtual nonReentrant returns (bool success) {
        bytes32 txHash;

        {
            bytes memory txHashData = encodeStrategyData(
                smartAccount,
                _tx,
                nonces[smartAccount]++
            );

            txHash = keccak256(txHashData);
            if (
                ISignatureValidator(smartAccount).isValidSignature(
                    txHash,
                    signatures
                ) != EIP1271_MAGIC_VALUE
            ) {
                revert InvalidSignature();
            }
        }

        {
            success = IExecFromModule(smartAccount).execTransactionFromModule(
                handler,
                _tx.value,
                _tx.data,
                Enum.Operation.DelegateCall,
                _tx.gas
            );
        }
    }

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
    ) public view returns (bytes32) {
        return keccak256(encodeStrategyData(smartAccount, _tx, _nonce));
    }

    /**
     * @dev Returns the bytes that are hashed to be signed by owner.
     * @param _tx The strategy transaction data to be signed.
     * @param _nonce Transaction nonce.
     * @return strategyHash bytes that are hashed to be signed by the owner.
     */
    function encodeStrategyData(
        address smartAccount,
        StrategyTransaction memory _tx,
        uint256 _nonce
    ) public view returns (bytes memory) {
        bytes32 strategyHash = keccak256(
            abi.encode(
                EXECUTE_STRATEGY_TYPEHASH,
                handler,
                _tx.value,
                keccak256(_tx.data),
                _nonce
            )
        );
        return
            bytes.concat(
                bytes1(0x19),
                bytes1(0x01),
                domainSeparator(smartAccount),
                strategyHash
            );
    }

    /**
     * @dev returns a value from the nonces 2d mapping
     * @param smartAccount : address of smart account to get nonce
     * @return nonce : the number of transactions made by smart account
     */
    function getNonce(
        address smartAccount
    ) public view virtual returns (uint256) {
        return nonces[smartAccount];
    }

    /**
     * @dev Returns the domain separator for this contract, as defined in the EIP-712 standard.
     * @return bytes32 The domain separator hash.
     */
    function domainSeparator(
        address smartAccount
    ) public view returns (bytes32) {
        return
            keccak256(
                abi.encode(DOMAIN_SEPARATOR_TYPEHASH, CHAIN_ID, smartAccount)
            );
    }

    /**
     * @notice Returns the ID of the chain the contract is currently deployed on.
     * @return CHAIN_ID The ID of the current chain as a uint256.
     */
    function getChainId() public view returns (uint256) {
        return CHAIN_ID;
    }
}
