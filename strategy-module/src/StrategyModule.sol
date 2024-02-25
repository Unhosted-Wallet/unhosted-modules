// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "./interface/IERC7579Account.sol";
import "./interface/IExecutor.sol";
import "./lib/ModeLib.sol";
import "./lib/ExecutionLib.sol";

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import {
    IStrategyModule,
    ISignatureValidatorConstants,
    ISignatureValidator,
    IExecFromModule,
    Enum
} from "./interface/IStrategyModule.sol";

/**
 * @title Strategy module for Biconomy Smart Accounts.
 * @dev Compatible with Biconomy Modular Interface v 0.1
 * - It allows to call and delegate call to external strategy and trigger contracts and execute or check arbitrary data.
 * - EIP-1271 compatible (checks if the signer is the owner).
 * @author M. Zakeri Rad - <@zakrad>
 */
contract StrategyModule is ERC165, EIP712, Ownable, ReentrancyGuard, IExecutor, IStrategyModule {
    using ExecutionLib for bytes;

    mapping(address => bool) internal _initialized;

    function onInstall(bytes calldata data) external override {
        if (isInitialized(msg.sender)) revert AlreadyInitialized(msg.sender);
        _initialized[msg.sender] = true;
    }

    function onUninstall(bytes calldata data) external override {
        if (!isInitialized(msg.sender)) revert NotInitialized(msg.sender);
        _initialized[msg.sender] = false;
    }

    function isInitialized(address smartAccount) public view override returns (bool) {
        return _initialized[smartAccount];
    }

    function isModuleType(uint256 typeID) external view override returns (bool) {
        return typeID == 2;
    }

    //ExecuteStrategy
    // solhint-disable-next-line
    // keccak256("ExecuteStrategy(Operation operation,address strategy,uint256 value,bytes strategyData,uint256 nonce)");
    bytes32 internal constant EXECUTE_STRATEGY_TYPEHASH =
        0xa53118058e6e66d81ae80c0599df5769dde6ebd7ddad81f2d13ef7538d216a4f;

    //ExecuteTriggeredStrategy
    // solhint-disable-next-line
    // keccak256("ExecuteTriggeredStrategy(Operation operation,address strategy,uint256 value,bytes strategyData,address trigger,bytes triggerData,uint256 nonce)");
    bytes32 internal constant EXECUTE_TRIGGERED_STRATEGY_TYPEHASH =
        0x77870b0974f7c7fecf66fbaec7655d68d88633048a314ff9fc5de4c84e98d96b;

    // solhint-disable-next-line
    uint256 public devFee = 1000; // 10%
    uint256 public unhostedFee = 1000; // 10%

    mapping(address => uint256) public nonces;

    mapping(address => address) public devs; // strategy to dev mapping

    mapping(address => uint256) public fees; // dev to fees mapping

    error InvalidStrategy();
    error AddressCanNotBeZero();
    error NotAuthorized();
    error TransferFailed(uint256);
    error RevertEstimation(uint256);
    error NotTriggered(bytes);

    constructor(string memory name, string memory version) EIP712(name, version) Ownable(msg.sender) {}

    receive() external payable {}

    /**
     * @dev See {IStrategyModule-executeStrategy}.
     */
    function executeStrategy(address smartAccount, StrategyTransaction memory _tx, bytes memory signatures)
        public
        virtual
        nonReentrant
        returns (bool executed, uint256 gasUsed, bytes memory returnData)
    {
        address dev = devs[_tx.strategy];
        if (dev == address(0)) {
            revert InvalidStrategy();
        }
        bytes32 txHash;
        {
            bytes memory txHashData = encodeStrategyData(_tx, nonces[smartAccount]++);

            txHash = keccak256(txHashData);
            if (ISignatureValidator(smartAccount).isValidSignature(txHash, signatures) != EIP1271_MAGIC_VALUE) {
                revert InvalidSignature();
            }
        }

        {
            uint256 startGas = gasleft();
            (executed, returnData) = IExecFromModule(smartAccount).executeFromExecutor(
                _tx.strategy, _tx.value, _tx.strategyData, _tx.operation
            );
            gasUsed = startGas - gasleft();

            uint256 devAmount = (gasUsed * tx.gasprice * devFee) / 1e4;
            uint256 ownerAmount = (gasUsed * tx.gasprice * unhostedFee) / 1e4;

            fees[dev] += devAmount;
            fees[owner()] += ownerAmount;

            bool success = IExecFromModule(smartAccount).execTransactionFromModule(
                address(this), devAmount + ownerAmount, "", Enum.Operation.Call
            );
            if (!success) {
                revert TransferFailed(devAmount + ownerAmount);
            }
        }
    }

    /**
     * @dev See {IStrategyModule-executeTriggeredStrategy}.
     */
    function executeTriggeredStrategy(
        address smartAccount,
        TriggeredStrategyTransaction memory _tx,
        bytes memory signatures
    ) public virtual nonReentrant returns (bool executed, uint256 gasUsed, bytes memory returnData) {
        address dev = devs[_tx.strategy];
        if (dev == address(0)) {
            revert InvalidStrategy();
        }
        bytes32 txHash;
        {
            bytes memory txHashData = encodeTriggeredStrategyData(_tx, nonces[smartAccount]++);

            txHash = keccak256(txHashData);
            if (ISignatureValidator(smartAccount).isValidSignature(txHash, signatures) != EIP1271_MAGIC_VALUE) {
                revert InvalidSignature();
            }
            (bool success, bytes memory data) = IExecFromModule(smartAccount).execTransactionFromModuleReturnData(
                _tx.trigger, 0, _tx.triggerData, Enum.Operation.Call
            );
            if (!success) {
                revert NotTriggered(data);
            }
        }

        {
            uint256 startGas = gasleft();
            (executed, returnData) = IExecFromModule(smartAccount).execTransactionFromModuleReturnData(
                _tx.strategy, _tx.value, _tx.strategyData, _tx.operation
            );
            gasUsed = startGas - gasleft();

            uint256 devAmount = (gasUsed * tx.gasprice * devFee) / 1e4;
            uint256 ownerAmount = (gasUsed * tx.gasprice * unhostedFee) / 1e4;

            fees[dev] += devAmount;
            fees[owner()] += ownerAmount;

            bool success = IExecFromModule(smartAccount).execTransactionFromModule(
                address(this), devAmount + ownerAmount, "", Enum.Operation.Call
            );
            if (!success) {
                revert TransferFailed(devAmount + ownerAmount);
            }
        }
    }

    /**
     * @dev See {IStrategyModule-requiredTxGas}.
     */
    function requiredTxGas(address smartAccount, StrategyTransaction memory _tx) public {
        uint256 startGas = gasleft();

        IExecFromModule(smartAccount).execTransactionFromModuleReturnData(
            _tx.strategy, _tx.value, _tx.strategyData, _tx.operation
        );
        uint256 gasUsed = (startGas - gasleft());

        revert RevertEstimation(gasUsed);
    }

    /**
     * @dev See {IStrategyModule-claim}.
     */
    function claim() public {
        uint256 amount = fees[msg.sender];
        fees[msg.sender] = 0;
        payable(msg.sender).call{value: amount}("");
    }

    /**
     * @dev See {IStrategyModule-updateStrategy}.
     */
    function updateStrategy(address strategy, address dev) public {
        if (devs[strategy] != msg.sender && devs[strategy] != address(0)) {
            revert NotAuthorized();
        }
        devs[strategy] = dev;
    }

    /**
     * @dev See {IStrategyModule-updateDevFee}.
     */
    function updateDevFee(uint256 devFee_) public onlyOwner {
        devFee = devFee_;
    }

    /**
     * @dev See {IStrategyModule-updateUnhostedFee}.
     */
    function updateUnhostedFee(uint256 unhostedFee_) public onlyOwner {
        unhostedFee = unhostedFee_;
    }

    /**
     * @dev See {IStrategyModule-getTransactionHash}.
     */
    function getStrategyTxHash(StrategyTransaction calldata _tx, uint256 _nonce) public view returns (bytes32) {
        return keccak256(encodeStrategyData(_tx, _nonce));
    }

    /**
     * @dev See {IStrategyModule-getTriggeredStrategyTxHash}.
     */
    function getTriggeredStrategyTxHash(TriggeredStrategyTransaction calldata _tx, uint256 _nonce)
        public
        view
        returns (bytes32)
    {
        return keccak256(encodeTriggeredStrategyData(_tx, _nonce));
    }

    /**
     * @dev See {IStrategyModule-encodeStrategyData}.
     */
    function encodeStrategyData(StrategyTransaction memory _tx, uint256 _nonce) public view returns (bytes memory) {
        bytes32 strategyHash = keccak256(
            abi.encode(
                EXECUTE_STRATEGY_TYPEHASH, _tx.operation, _tx.strategy, _tx.value, keccak256(_tx.strategyData), _nonce
            )
        );
        return bytes.concat(bytes1(0x19), bytes1(0x01), _domainSeparatorV4(), strategyHash);
    }

    /**
     * @dev See {IStrategyModule-encodeTriggeredStrategyData}.
     */
    function encodeTriggeredStrategyData(TriggeredStrategyTransaction memory _tx, uint256 _nonce)
        public
        view
        returns (bytes memory)
    {
        bytes32 triggeredStrategyHash = keccak256(
            abi.encode(
                EXECUTE_TRIGGERED_STRATEGY_TYPEHASH,
                _tx.operation,
                _tx.strategy,
                _tx.value,
                keccak256(_tx.strategyData),
                _tx.trigger,
                keccak256(_tx.triggerData),
                _nonce
            )
        );
        return bytes.concat(bytes1(0x19), bytes1(0x01), _domainSeparatorV4(), triggeredStrategyHash);
    }

    /**
     * @dev See {IStrategyModule-getNonce}.
     */
    function getNonce(address smartAccount) public view virtual returns (uint256) {
        return nonces[smartAccount];
    }

    /**
     * @dev See {EIP712-domainSeparator}.
     */
    function domainSeparator() public view returns (bytes32) {
        return _domainSeparatorV4();
    }

    /**
     * @dev See {IERC165-supportsInterface}.
     */
    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC165) returns (bool) {
        return interfaceId == type(IStrategyModule).interfaceId || super.supportsInterface(interfaceId);
    }
}
