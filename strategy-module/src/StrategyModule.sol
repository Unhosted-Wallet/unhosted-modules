// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {ERC7579ExecutorBase, SessionKeyBase} from "kit/Modules.sol";
import {IERC7579Account} from "kit/Accounts.sol";
// import {ModeLib} from "erc7579/external/ERC7579.sol";
// import {ExecutionLib} from "erc7579/lib/ExecutionLib.sol";

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import {IStrategyModule} from "./interface/IStrategyModule.sol";

/**
 * @title Strategy module for ERC7579 SAs.
 * @dev Compatible with ERC7579 session manager
 * @dev It allows to call, batchcall and delegate call to external strategy and trigger contracts
 * and execute or check arbitrary data.
 * @author zakrad.eth - <@zakrad>
 */
// contract StrategyModule is
//     ERC165,
//     EIP712,
//     Ownable,
//     ReentrancyGuard,
//     ERC7579ExecutorBase,
//     SessionKeyBase,
//     IStrategyModule
// {
//     using ExecutionLib for bytes;

//     struct ExecutorAccess {
//         address sessionKeySigner;
//         address strategy;
//     }

//     mapping(address => bool) internal _initialized;

//     function onInstall(bytes calldata data) external override {
//         if (isInitialized(msg.sender)) revert AlreadyInitialized(msg.sender);
//         _initialized[msg.sender] = true;
//     }

//     function onUninstall(bytes calldata data) external override {
//         if (!isInitialized(msg.sender)) revert NotInitialized(msg.sender);
//         _initialized[msg.sender] = false;
//     }

//     function isModuleType(uint256 typeID) external view override returns (bool) {
//         return typeID == TYPE_EXECUTOR;
//     }

//     // solhint-disable-next-line
//     uint256 public devFee = 1000; // 10%
//     uint256 public platformFee = 1000; // 10%

//     mapping(address => address) public strategyDevs; // strategy to dev mapping

//     mapping(address => uint256) public accumulatedFees; // dev to fee mapping

//     error InvalidStrategy();
//     error AddressCanNotBeZero();
//     error NotAuthorized();
//     error TransferFailed(uint256);
//     error RevertEstimation(uint256);
//     error NotTriggered(bytes);

//     constructor(string memory name, string memory version) EIP712(name, version) Ownable(msg.sender) {}

//     receive() external payable {}

//     /**
//      * @dev See {IStrategyModule-executeStrategy}.
//      */
//     function executeStrategy(address strategy, uint256 value, bytes calldata strategyData)
//         public
//         virtual
//         nonReentrant
//         returns (uint256 gasUsed, bytes[] memory returnData)
//     {
//         address dev = devs[strategy];
//         if (dev == address(0)) {
//             revert InvalidStrategy();
//         }

//         {
//             uint256 startGas = gasleft();
//             returnData = IERC7579Account(msg.sender).executeFromExecutor(
//                 ModeLib.encodeSimpleSingle(), ExecutionLib.encodeSingle(strategy, value, strategyData)
//             );
//             gasUsed = startGas - gasleft();

//             uint256 devAmount = (gasUsed * tx.gasprice * devFee) / 1e4;
//             uint256 platformAmount = (gasUsed * tx.gasprice * platformFee) / 1e4;

//             fees[dev] += devAmount;
//             fees[owner()] += platformAmount;

//             IERC7579Account(msg.sender).executeFromExecutor(
//                 ModeLib.encodeSimpleSingle(), ExecutionLib.encodeSingle(address(this), devAmount + platformAmount, "")
//             );
//         }
//     }

//     /**
//      * @dev See {IStrategyModule-executeStrategy}.
//      */
//     function executeStrategy(address strategy, bytes calldata strategyData)
//         public
//         virtual
//         nonReentrant
//         returns (uint256 gasUsed, bytes[] memory returnData)
//     {
//         address dev = devs[strategy];
//         if (dev == address(0)) {
//             revert InvalidStrategy();
//         }

//         {
//             uint256 startGas = gasleft();
//             returnData = IERC7579Account(msg.sender).executeFromExecutor(
//                 ModeLib.encode(CALLTYPE_DELEGATECALL, EXECTYPE_DEFAULT, MODE_DEFAULT, ModePayload.wrap(0x00)),
//                 abi.encodePacked(strategy, strategyData)
//             );
//             gasUsed = startGas - gasleft();

//             uint256 devAmount = (gasUsed * tx.gasprice * devFee) / 1e4;
//             uint256 platformAmount = (gasUsed * tx.gasprice * platformFee) / 1e4;

//             fees[dev] += devAmount;
//             fees[owner()] += platformAmount;

//             IERC7579Account(msg.sender).executeFromExecutor(
//                 ModeLib.encodeSimpleSingle(), ExecutionLib.encodeSingle(address(this), devAmount + platformAmount, "")
//             );
//         }
//     }

//     /**
//      * @dev See {IStrategyModule-executeStrategy}.
//      */
//     function executeStrategy(Execution[] calldata executions)
//         public
//         virtual
//         nonReentrant
//         returns (uint256 gasUsed, bytes[] memory returnData)
//     {
//         address dev = devs[executions[0].target];
//         if (dev == address(0)) {
//             revert InvalidStrategy();
//         }

//         {
//             uint256 startGas = gasleft();
//             returnData = IERC7579Account(msg.sender).executeFromExecutor(
//                 ModeLib.encodeSimpleBatch(), ExecutionLib.encodeBatch(executions)
//             );
//             gasUsed = startGas - gasleft();

//             uint256 devAmount = (gasUsed * tx.gasprice * devFee) / 1e4;
//             uint256 platformAmount = (gasUsed * tx.gasprice * platformFee) / 1e4;

//             fees[dev] += devAmount;
//             fees[owner()] += platformAmount;

//             IERC7579Account(msg.sender).executeFromExecutor(
//                 ModeLib.encodeSimpleSingle(), ExecutionLib.encodeSingle(address(this), devAmount + platformAmount, "")
//             );
//         }
//     }

//     /**
//      * @dev See {IStrategyModule-executeTriggeredStrategy}.
//      */
//     function executeTriggeredStrategy(
//         address strategy,
//         uint256 value,
//         bytes calldata strategyData,
//         address trigger,
//         bytes calldata triggerData
//     ) public virtual nonReentrant returns (uint256 gasUsed, bytes[] memory returnData) {
//         address dev = devs[strategy];
//         if (dev == address(0)) {
//             revert InvalidStrategy();
//         }

//         IERC7579Account(msg.sender).executeFromExecutor(
//             ModeLib.encodeSimpleSingle(), ExecutionLib.encodeSingle(trigger, 0, triggerData)
//         );

//         {
//             uint256 startGas = gasleft();
//             returnData = IERC7579Account(msg.sender).executeFromExecutor(
//                 ModeLib.encodeSimpleSingle(), ExecutionLib.encodeSingle(strategy, value, strategyData)
//             );
//             gasUsed = startGas - gasleft();

//             uint256 devAmount = (gasUsed * tx.gasprice * devFee) / 1e4;
//             uint256 platformAmount = (gasUsed * tx.gasprice * platformFee) / 1e4;

//             fees[dev] += devAmount;
//             fees[owner()] += platformAmount;

//             IERC7579Account(msg.sender).executeFromExecutor(
//                 ModeLib.encodeSimpleSingle(), ExecutionLib.encodeSingle(address(this), devAmount + platformAmount, "")
//             );
//         }
//     }

//     /**
//      * @dev See {IStrategyModule-executeTriggeredStrategy}.
//      */
//     function executeTriggeredStrategy(
//         address strategy,
//         bytes calldata strategyData,
//         address trigger,
//         bytes calldata triggerData
//     ) public virtual nonReentrant returns (uint256 gasUsed, bytes[] memory returnData) {
//         address dev = devs[strategy];
//         if (dev == address(0)) {
//             revert InvalidStrategy();
//         }

//         IERC7579Account(msg.sender).executeFromExecutor(
//             ModeLib.encodeSimpleSingle(), ExecutionLib.encodeSingle(trigger, 0, triggerData)
//         );

//         {
//             uint256 startGas = gasleft();
//             returnData = IERC7579Account(msg.sender).executeFromExecutor(
//                 ModeLib.encode(CALLTYPE_DELEGATECALL, EXECTYPE_DEFAULT, MODE_DEFAULT, ModePayload.wrap(0x00)),
//                 abi.encodePacked(strategy, strategyData)
//             );
//             gasUsed = startGas - gasleft();

//             uint256 devAmount = (gasUsed * tx.gasprice * devFee) / 1e4;
//             uint256 platformAmount = (gasUsed * tx.gasprice * platformFee) / 1e4;

//             fees[dev] += devAmount;
//             fees[owner()] += platformAmount;

//             IERC7579Account(msg.sender).executeFromExecutor(
//                 ModeLib.encodeSimpleSingle(), ExecutionLib.encodeSingle(address(this), devAmount + platformAmount, "")
//             );
//         }
//     }

//     /**
//      * @dev See {IStrategyModule-executeTriggeredStrategy}.
//      */
//     function executeTriggeredStrategy(Execution[] calldata executions, address trigger, bytes calldata triggerData)
//         public
//         virtual
//         nonReentrant
//         returns (uint256 gasUsed, bytes[] memory returnData)
//     {
//         address dev = devs[executions[0].target];
//         if (dev == address(0)) {
//             revert InvalidStrategy();
//         }

//         IERC7579Account(msg.sender).executeFromExecutor(
//             ModeLib.encodeSimpleSingle(), ExecutionLib.encodeSingle(trigger, 0, triggerData)
//         );

//         {
//             uint256 startGas = gasleft();
//             returnData = IERC7579Account(msg.sender).executeFromExecutor(
//                 ModeLib.encodeSimpleBatch(), ExecutionLib.encodeBatch(executions)
//             );
//             gasUsed = startGas - gasleft();

//             uint256 devAmount = (gasUsed * tx.gasprice * devFee) / 1e4;
//             uint256 platformAmount = (gasUsed * tx.gasprice * platformFee) / 1e4;

//             fees[dev] += devAmount;
//             fees[owner()] += platformAmount;

//             IERC7579Account(msg.sender).executeFromExecutor(
//                 ModeLib.encodeSimpleSingle(), ExecutionLib.encodeSingle(address(this), devAmount + platformAmount, "")
//             );
//         }
//     }

//     /**
//      * @dev See {IStrategyModule-requiredTxGas}.
//      */
//     function requiredTxGas(address smartAccount, address strategy, uint256 value, bytes calldata strategyData) public {
//         uint256 startGas = gasleft();

//         IERC7579Account(smartAccount).executeFromExecutor(
//             ModeLib.encodeSimpleSingle(), ExecutionLib.encodeSingle(strategy, value, strategyData)
//         );
//         uint256 gasUsed = (startGas - gasleft());

//         revert RevertEstimation(gasUsed);
//     }

//     /**
//      * @dev See {IStrategyModule-requiredTxGas}.
//      */
//     function requiredTxGas(address smartAccount, address strategy, bytes calldata strategyData) public {
//         uint256 startGas = gasleft();

//         IERC7579Account(smartAccount).executeFromExecutor(
//             ModeLib.encode(CALLTYPE_DELEGATECALL, EXECTYPE_DEFAULT, MODE_DEFAULT, ModePayload.wrap(0x00)),
//             abi.encodePacked(strategy, strategyData)
//         );
//         uint256 gasUsed = (startGas - gasleft());

//         revert RevertEstimation(gasUsed);
//     }

//     /**
//      * @dev See {IStrategyModule-requiredTxGas}.
//      */
//     function requiredTxGas(address smartAccount, Execution[] calldata executions) public {
//         uint256 startGas = gasleft();

//         IERC7579Account(smartAccount).executeFromExecutor(
//             ModeLib.encodeSimpleBatch(), ExecutionLib.encodeBatch(executions)
//         );
//         uint256 gasUsed = (startGas - gasleft());

//         revert RevertEstimation(gasUsed);
//     }

//     /**
//      * @dev See {IStrategyModule-claim}.
//      */
//     function claim() public {
//         uint256 amount = fees[msg.sender];
//         fees[msg.sender] = 0;
//         payable(msg.sender).call{value: amount}("");
//     }

//     /**
//      * @dev See {IStrategyModule-updateStrategy}.
//      */
//     function updateStrategy(address strategy, address dev) public {
//         if (devs[strategy] != msg.sender && devs[strategy] != address(0)) {
//             revert NotAuthorized();
//         }
//         devs[strategy] = dev;
//     }

//     /**
//      * @dev See {IStrategyModule-updateDevFee}.
//      */
//     function updateDevFee(uint256 devFee_) public onlyOwner {
//         devFee = devFee_;
//     }

//     /**
//      * @dev See {IStrategyModule-updatePlatformFee}.
//      */
//     function updatePlatformFee(uint256 platformFee_) public onlyOwner {
//         platformFee = platformFee_;
//     }

//     function validateSessionParams(
//         address destinationContract,
//         uint256 callValue,
//         bytes calldata callData,
//         bytes calldata _sessionKeyData,
//         bytes calldata /*_callSpecificData*/
//     ) external view virtual override returns (address) {
//         ExecutorAccess memory access = abi.decode(_sessionKeyData, (ExecutorAccess));

//         bytes4 targetSelector = bytes4(callData[:4]);

//         uint256 jobId = abi.decode(callData[4:], (uint256));
//         if (targetSelector != this.executeOrder.selector) {
//             revert InvalidMethod(targetSelector);
//         }

//         if (jobId != access.jobId) {
//             revert InvalidJob();
//         }

//         if (destinationContract != address(this)) {
//             revert InvalidRecipient();
//         }

//         if (callValue != 0) {
//             revert InvalidValue();
//         }

//         return access.sessionKeySigner;
//     }

//     /**
//      * @dev See {IERC165-supportsInterface}.
//      */
//     function supportsInterface(bytes4 interfaceId) public view virtual override(ERC165) returns (bool) {
//         return interfaceId == type(IStrategyModule).interfaceId || super.supportsInterface(interfaceId);
//     }
// }
