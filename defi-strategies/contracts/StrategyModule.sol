// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import {ISignatureValidator, ISignatureValidatorConstants} from "./interfaces/ISignatureValidator.sol";
import {Enum} from "./Enum.sol";
import {ReentrancyGuard} from "./ReentrancyGuard.sol";
import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import {IExecFromModule, IStrategyModule} from "./interfaces/IStrategyModule.sol";

/**
 * @title Defi Base Strategy module for Biconomy Smart Accounts.
 * @dev Compatible with Biconomy Modular Interface v 0.1
 * - It allows to delegate call to external defi strategy contracts and execute arbitrary data.
 * - EIP-1271 compatible (checks if the signer is the owner).
 * @author M. Zakeri Rad - <@zakrad>
 */

contract StrategyModule is
    ERC165,
    ReentrancyGuard,
    ISignatureValidatorConstants,
    IStrategyModule
{
    // Domain Seperators keccak256("EIP712Domain(uint256 chainId,address verifyingContract)");
    bytes32 internal constant DOMAIN_SEPARATOR_TYPEHASH =
        0x47e79534a245952e8b16893a336b85a3d9ea9fa8c573f3d803afb92a79469218;
    //ExecuteStrategy
    // solhint-disable-next-line
    // keccak256("ExecuteStrategy(address handler,uint256 value,bytes data,uint256 nonce)");
    bytes32 internal constant EXECUTE_STRATEGY_TYPEHASH =
        0x06d4deb91a5dc73a3ea344ed05631460315e2109778b250fdd941893ee92bec8;

    /* solhint-disable var-name-mixedcase */
    uint256 private CHAIN_ID;

    mapping(address => uint256) public nonces;

    address public handler;
    address public beneficiary;

    string public constant NAME = "Strategy Module";
    string public constant VERSION = "0.1.0";

    error AlreadyInitialized();
    error AddressCanNotBeZero();

    function init(
        address beneficiary_,
        address handler_
    ) external returns (bool) {
        if (handler != address(0)) revert AlreadyInitialized();
        if (handler_ == address(0) || beneficiary_ == address(0)) {
            revert AddressCanNotBeZero();
        }
        handler = handler_;
        beneficiary = beneficiary_;
        CHAIN_ID = block.chainid;
        return true;
    }

    /**
     * it can call any arbitrary logic from handler without any confirmation if the
     * module is enabled and SA owner signed the data
     */
    function execStrategy(
        address strategyModule,
        StrategyTransaction memory _tx,
        bytes memory signatures
    ) public payable virtual nonReentrant returns (bool success) {
        bytes32 txHash;

        {
            bytes memory txHashData = encodeStrategyData(
                strategyModule,
                _tx,
                nonces[strategyModule]++
            );

            txHash = keccak256(txHashData);
            if (
                ISignatureValidator(strategyModule).isValidSignature(
                    txHash,
                    signatures
                ) != EIP1271_MAGIC_VALUE
            ) {
                revert InvalidSignature();
            }
        }

        {
            success = IExecFromModule(strategyModule).execTransactionFromModule(
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
     * @param strategyModule Address of the Smart Account to execute the txn.
     * @return Transaction hash.
     */
    function getTransactionHash(
        StrategyTransaction calldata _tx,
        uint256 _nonce,
        address strategyModule
    ) public view returns (bytes32) {
        return keccak256(encodeStrategyData(strategyModule, _tx, _nonce));
    }

    /**
     * @dev Returns the bytes that are hashed to be signed by owner.
     * @param _tx The strategy transaction data to be signed.
     * @param _nonce Transaction nonce.
     * @return strategyHash bytes that are hashed to be signed by the owner.
     */
    function encodeStrategyData(
        address strategyModule,
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
                domainSeparator(strategyModule),
                strategyHash
            );
    }

    /**
     * @dev returns a value from the nonces 2d mapping
     * @param strategyModule : address of smart account to get nonce
     * @return nonce : the number of transactions made by smart account
     */
    function getNonce(
        address strategyModule
    ) public view virtual returns (uint256) {
        return nonces[strategyModule];
    }

    /**
     * @dev Returns the domain separator for this contract, as defined in the EIP-712 standard.
     * @return bytes32 The domain separator hash.
     */
    function domainSeparator(
        address strategyModule
    ) public view returns (bytes32) {
        return
            keccak256(
                abi.encode(DOMAIN_SEPARATOR_TYPEHASH, CHAIN_ID, strategyModule)
            );
    }

    /**
     * @notice Returns the ID of the chain the contract is currently deployed on.
     * @return CHAIN_ID The ID of the current chain as a uint256.
     */
    function getChainId() public view returns (uint256) {
        return CHAIN_ID;
    }

    /**
     * @dev See {IERC165-supportsInterface}.
     */
    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(ERC165) returns (bool) {
        return
            interfaceId == type(IStrategyModule).interfaceId ||
            super.supportsInterface(interfaceId);
    }
}
