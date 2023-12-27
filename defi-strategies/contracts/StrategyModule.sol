// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {ISignatureValidator, ISignatureValidatorConstants} from "contracts/interfaces/ISignatureValidator.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import {IExecFromModule, IStrategyModule, Enum} from "contracts/interfaces/IStrategyModule.sol";

/**
 * @title Strategy module for Biconomy Smart Accounts.
 * @dev Compatible with Biconomy Modular Interface v 0.1
 * - It allows to delegate call to external handler contracts and execute arbitrary data.
 * - EIP-1271 compatible (checks if the signer is the owner).
 * @author M. Zakeri Rad - <@zakrad>
 */

contract StrategyModule is
    ERC165,
    ReentrancyGuard,
    ISignatureValidatorConstants,
    IStrategyModule
{
    // Domain Seperators keccak256("EIP712Domain(uint256 chainId,address verifyingContract,bytes32 salt)");
    bytes32 internal constant DOMAIN_SEPARATOR_TYPEHASH =
        0x71062c282d40422f744945d587dbf4ecfd4f9cfad1d35d62c944373009d96162;

    //ExecuteStrategy
    // solhint-disable-next-line
    // keccak256("ExecuteStrategy(address handler,uint256 value,bytes data,uint256 nonce)");
    bytes32 internal constant EXECUTE_STRATEGY_TYPEHASH =
        0x06d4deb91a5dc73a3ea344ed05631460315e2109778b250fdd941893ee92bec8;

    // solhint-disable-next-line
    uint16 internal constant _gasFactor = 1000; // 10%

    uint256 private immutable CHAIN_ID;

    mapping(address => uint256) public nonces;

    address public handler;
    address public beneficiary;

    string public constant NAME = "Strategy Module";
    string public constant VERSION = "0.1.0";

    error AlreadyInitialized();
    error AddressCanNotBeZero();
    error NotAuthorized();
    error TransferFailed(uint256);
    error RevertEstimation(uint256);

    constructor() {
        CHAIN_ID = block.chainid;
    }

    receive() external payable {}

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
        return true;
    }

    /**
     * @dev See {IStrategyModule-execStrategy}.
     */
    function execStrategy(
        address smartAccount,
        StrategyTransaction memory _tx,
        bytes memory signatures
    )
        public
        virtual
        nonReentrant
        returns (uint256 gasUsed, bool executed, bytes memory returnData)
    {
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
            uint256 startGas = gasleft();
            (executed, returnData) = IExecFromModule(smartAccount)
                .execTransactionFromModuleReturnData(
                    handler,
                    _tx.value,
                    _tx.data,
                    Enum.Operation.DelegateCall
                );
            gasUsed = ((startGas - gasleft()) * _gasFactor) / 1e4;

            bool success = IExecFromModule(smartAccount)
                .execTransactionFromModule(
                    address(this),
                    gasUsed * tx.gasprice,
                    "",
                    Enum.Operation.Call
                );
            if (!success) {
                revert TransferFailed(gasUsed);
            }
        }
    }

    /**
     * @dev See {IStrategyModule-requiredTxGas}.
     */
    function requiredTxGas(
        address smartAccount,
        StrategyTransaction memory _tx
    ) public {
        uint256 startGas = gasleft();

        IExecFromModule(smartAccount).execTransactionFromModuleReturnData(
            handler,
            _tx.value,
            _tx.data,
            Enum.Operation.DelegateCall
        );
        uint256 gasUsed = (startGas - gasleft());

        revert RevertEstimation((gasUsed * _gasFactor) / 1e4);
    }

    /**
     * @dev See {IStrategyModule-claim}.
     */
    function claim() public {
        if (msg.sender != beneficiary) {
            revert NotAuthorized();
        }
        beneficiary.call{value: address(this).balance}("");
    }

    /**
     * @dev See {IStrategyModule-getTransactionHash}.
     */
    function getTransactionHash(
        StrategyTransaction calldata _tx,
        uint256 _nonce,
        address smartAccount
    ) public view returns (bytes32) {
        return keccak256(encodeStrategyData(smartAccount, _tx, _nonce));
    }

    /**
     * @dev See {IStrategyModule-encodeStrategyData}.
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
     * @dev See {IStrategyModule-getNonce}.
     */
    function getNonce(
        address smartAccount
    ) public view virtual returns (uint256) {
        return nonces[smartAccount];
    }

    /**
     * @dev See {IStrategyModule-domainSeparator}.
     */
    function domainSeparator(
        address smartAccount
    ) public view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    DOMAIN_SEPARATOR_TYPEHASH,
                    CHAIN_ID,
                    address(this),
                    bytes32(uint256(uint160(smartAccount)))
                )
            );
    }

    /**
     * @dev See {IStrategyModule-getChainId}.
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
