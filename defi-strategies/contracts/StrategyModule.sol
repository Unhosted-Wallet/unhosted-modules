// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {ISignatureValidator, ISignatureValidatorConstants} from "contracts/interfaces/ISignatureValidator.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import {IExecFromModule, IStrategyModule, Enum} from "contracts/interfaces/IStrategyModule.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

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
    // Domain Seperators keccak256("EIP712Domain(uint256 chainId,address verifyingContract)");
    bytes32 internal constant DOMAIN_SEPARATOR_TYPEHASH =
        0x47e79534a245952e8b16893a336b85a3d9ea9fa8c573f3d803afb92a79469218;

    //ExecuteStrategy
    // solhint-disable-next-line
    // keccak256("ExecuteStrategy(address handler,uint256 value,bytes data,uint256 nonce)");
    bytes32 internal constant EXECUTE_STRATEGY_TYPEHASH =
        0x06d4deb91a5dc73a3ea344ed05631460315e2109778b250fdd941893ee92bec8;

    // solhint-disable-next-line
    uint16 internal constant _feeFactor = 5000; // 50%

    uint256 private immutable CHAIN_ID;
    // solhint-disable-next-line
    address internal immutable _gasFeed;

    mapping(address => uint256) public nonces;

    address public handler;
    address public beneficiary;

    string public constant NAME = "Strategy Module";
    string public constant VERSION = "0.1.0";

    error AlreadyInitialized();
    error AddressCanNotBeZero();
    error RevertEstimation(uint256);

    constructor(address gasFeed_) {
        CHAIN_ID = block.chainid;
        _gasFeed = gasFeed_;
    }

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
        payable
        virtual
        nonReentrant
        returns (bool success, bytes memory returnData)
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
            (success, returnData) = IExecFromModule(smartAccount)
                .execTransactionFromModuleReturnData(
                    handler,
                    _tx.value,
                    _tx.data,
                    Enum.Operation.DelegateCall
                );
            uint256 used = (startGas - gasleft());

            (, int256 answer, , , ) = AggregatorV3Interface(_gasFeed)
                .latestRoundData();
            used = (used * uint256(answer) * _feeFactor) / 1e4;

            payable(beneficiary).transfer(used);
            payable(msg.sender).transfer(msg.value - used);
        }
    }

    /**
     * @dev See {IStrategyModule-requiredTxFee}.
     */
    function requiredTxFee(
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
        uint256 used = (startGas - gasleft());

        (, int256 answer, , , ) = AggregatorV3Interface(_gasFeed)
            .latestRoundData();

        used = (used * uint256(answer) * _feeFactor) / 1e4;
        revert RevertEstimation(used);
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
                abi.encode(DOMAIN_SEPARATOR_TYPEHASH, CHAIN_ID, smartAccount)
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
