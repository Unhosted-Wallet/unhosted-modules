// // SPDX-License-Identifier: MIT
// pragma solidity 0.8.23;

// import {StrategyModule, IStrategyModule} from "src/StrategyModule.sol";
// import "forge-std/console.sol";

// /**
//  * @title Mock strategy
//  */

// contract MockStrategy {
//     StrategyModule public strategyModule;

//     constructor(address strategyModule_) {
//         strategyModule = StrategyModule(payable(strategyModule_));
//     }

//     function reEnter() external {
//         IStrategyModule.StrategyTransaction memory _tx = IStrategyModule
//             .StrategyTransaction(
//                 Enum.Operation.DelegateCall,
//                 msg.sender,
//                 0,
//                 "0x0"
//             );
//         strategyModule.executeStrategy(msg.sender, _tx, "0x0");
//     }

//     function reEnterTrigger() external {
//         IStrategyModule.TriggeredStrategyTransaction
//             memory _tx = IStrategyModule.TriggeredStrategyTransaction(
//                 Enum.Operation.DelegateCall,
//                 msg.sender,
//                 0,
//                 "0x0",
//                 address(this),
//                 "0x0"
//             );
//         strategyModule.executeTriggeredStrategy(msg.sender, _tx, "0x0");
//     }
// }
