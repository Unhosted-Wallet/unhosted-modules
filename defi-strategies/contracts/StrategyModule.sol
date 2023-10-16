// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import {ISignatureValidator, ISignatureValidatorConstants} from "./interfaces/ISignatureValidator.sol";
import {Enum} from "./common/Enum.sol";
import {ReentrancyGuard} from "./common/ReentrancyGuard.sol";
import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import {IExecFromModule, IStrategyModule} from "./interfaces/IStrategyModule.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

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

    // solhint-disable-next-line
    address internal constant _gasFeed =
        0x169E633A2D1E6c10dD91238Ba11c4A708dfEF37C;

    // solhint-disable-next-line
    uint8 internal constant _feeFactor = 10; //0.1 %

    uint256 private immutable CHAIN_ID;

    mapping(address => uint256) public nonces;

    address public handler;
    address public beneficiary;

    string public constant NAME = "Strategy Module";
    string public constant VERSION = "0.1.0";

    error AlreadyInitialized();
    error AddressCanNotBeZero();
    error RevertEstimation(uint256);

    constructor() {
        CHAIN_ID = block.chainid;
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
            uint256 startGas = gasleft();
            success = IExecFromModule(smartAccount).execTransactionFromModule(
                handler,
                _tx.value,
                _tx.data,
                Enum.Operation.DelegateCall,
                _tx.gas
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
     * @dev Allows to estimate a transaction.
     * This method is for estimation only, it will always revert and encode the result in the revert data.
     * Call this method to get an estimate of the execTransactionFromModule costs that are deducted with `execStrategy`
     */
    function requiredTxFee(
        address strategyModule,
        StrategyTransaction memory _tx
    ) public {
        uint256 startGas = gasleft();

        IExecFromModule(strategyModule).execTransactionFromModule(
            handler,
            _tx.value,
            _tx.data,
            Enum.Operation.DelegateCall,
            _tx.gas
        );
        uint256 used = (startGas - gasleft());

        (, int256 answer, , , ) = AggregatorV3Interface(_gasFeed)
            .latestRoundData();

        used = (used * uint256(answer) * _feeFactor) / 1e4;
        revert RevertEstimation(used);
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
     * @param smartAccount Address of the Smart Account to execute the txn.
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
     * @param smartAccount address of smart account to get nonce
     * @return nonce : the number of transactions made by smart account
     */
    function getNonce(
        address smartAccount
    ) public view virtual returns (uint256) {
        return nonces[smartAccount];
    }

    /**
     * @dev Returns the domain separator for this contract, as defined in the EIP-712 standard.
     * @param smartAccount Address of the Smart Account as verifying contract address
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
