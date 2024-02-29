// pragma solidity 0.8.20;

// import {BiconomyTest} from "test/BiconomyTest.t.sol";
// import {
//     BCNMY_IMPL,
//     BCNMY_IMPL_BYTECODE,
//     BCNMY_FACTORY,
//     BCNMY_FACTORY_BYTECODE,
//     SmartAccountFactory,
//     SmartAccount
// } from "test/artifacts/BcnmyArtifacts.sol";
// import {
//     USDC,
//     WRAPPED_NATIVE_TOKEN,
//     UNISWAPV3_ROUTER,
//     UNISWAPV3_FACTORY
// } from "test/utils/constant_eth.sol";

// import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
// import {UserOperation, IAccount} from "I4337/interfaces/IAccount.sol";
// import {IUniswapV3Factory} from "test/interfaces/IUniswapV3Factory.sol";
// import {StrategyModule, Enum, ReentrancyGuard} from "src/StrategyModule.sol";
// import {IStrategyModule} from "src/interface/IStrategyModule.sol";
// import {ISwapRouter} from "test/interfaces/ISwapRouter.sol";

// import "src/mocks/MockERC20.sol";
// import "src/mocks/MockStrategy.sol";
// import "src/mocks/MockTrigger.sol";
// import "forge-std/console.sol";

// contract StrategyModuleTest is BiconomyTest {
//     SmartAccountFactory factory;
//     IUniswapV3Factory uniV3Factory;
//     StrategyModule stratModule;
//     ISwapRouter uniStrat;
//     MockTrigger trigger;
//     MockStrategy mockStrat;
//     MockERC20 usdc;
//     MockERC20 WETH;

//     address public unhosted;
//     uint256 public unhostedKey;

//     uint256 mainnetFork;
//     string MAINNET_RPC_URL = vm.envString("MAINNET_RPC_URL");

//     function setUp() external {
//         mainnetFork = vm.createFork(MAINNET_RPC_URL);
//         vm.selectFork(mainnetFork);
//         initializeTest();
//         factory = SmartAccountFactory(BCNMY_FACTORY);
//         uniV3Factory = IUniswapV3Factory(UNISWAPV3_FACTORY);
//         vm.etch(BCNMY_FACTORY, BCNMY_FACTORY_BYTECODE);
//         vm.etch(BCNMY_IMPL, BCNMY_IMPL_BYTECODE);
//         setAccount();
//         (unhosted, unhostedKey) = makeAddrAndKey("Unhosted");

//         vm.prank(unhosted);
//         stratModule = new StrategyModule("StrategyModule", "0.2.0");
//         stratModule.domainSeparator();

//         usdc = MockERC20(USDC);
//         WETH = MockERC20(WRAPPED_NATIVE_TOKEN);

//         uniStrat = ISwapRouter(UNISWAPV3_ROUTER);
//         trigger = new MockTrigger();
//         mockStrat = new MockStrategy(address(stratModule));

//         createAccount(owner);
//         UserOperation memory op = fillUserOp(
//             fillData(
//                 address(account),
//                 0,
//                 abi.encodeWithSelector(SmartAccount.enableModule.selector, address(stratModule))
//             )
//         );
//         executeUserOp(op, "enableModule", 0);

//         vm.prank(owner);
//         stratModule.updateStrategy(address(uniStrat), owner);
//         vm.txGasPrice(3000);
//     }

//     function testEnableModule() external {
//         assertEq(SmartAccount(address(account)).isModuleEnabled(address(stratModule)), true);
//     }

//     function testSupportInterface() external {
//         assert(stratModule.supportsInterface(type(IStrategyModule).interfaceId));
//         assert(!stratModule.supportsInterface(type(IAccount).interfaceId));
//     }

//     function testUpdateStrategy() external {
//         vm.expectRevert(StrategyModule.NotAuthorized.selector);
//         stratModule.updateStrategy(address(uniStrat), owner);
//     }

//     function testUpdateFees() external {
//         vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, owner));
//         vm.prank(owner);
//         stratModule.updateDevFee(20000);
//         vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, owner));
//         vm.prank(owner);
//         stratModule.updateUnhostedFee(20000);

//         vm.prank(unhosted);
//         stratModule.updateDevFee(20000);
//         vm.prank(unhosted);
//         stratModule.updateUnhostedFee(20000);

//         assertEq(stratModule.devFee(), 20000);
//         assertEq(stratModule.unhostedFee(), 20000);
//     }

//     function testReentrancy() external {
//         stratModule.updateStrategy(address(mockStrat), owner);

//         bytes memory data = abi.encodeWithSelector(
//             mockStrat.reEnter.selector
//         );

//         IStrategyModule.StrategyTransaction memory _tx = IStrategyModule.StrategyTransaction(Enum.Operation.Call, address(mockStrat), 0, data);

//         bytes32 hash = stratModule.getStrategyTxHash(
//             _tx,
//             stratModule.getNonce(address(account))
//         );
//         (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, hash);
//         bytes memory signature = abi.encodePacked(r, s, v);

//         (bool executed, , bytes memory revertData) = stratModule.executeStrategy(address(account), _tx, signature);
//         assert(bytes4(revertData) == ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
//         assert(!executed);

//         data = abi.encodeWithSelector(
//             mockStrat.reEnterTrigger.selector
//         );

//         _tx = IStrategyModule.StrategyTransaction(Enum.Operation.Call, address(mockStrat), 0, data);

//         hash = stratModule.getStrategyTxHash(
//             _tx,
//             stratModule.getNonce(address(account))
//         );
//         (v, r, s) = vm.sign(key, hash);
//         signature = abi.encodePacked(r, s, v);

//         (executed, , revertData) = stratModule.executeStrategy(address(account), _tx, signature);
//         assert(bytes4(revertData) == ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
//         assert(!executed);
//     }

//     function testExecuteStrategy() external {
//         uint256 value = 1000e6;
//         address provider = uniV3Factory.getPool(USDC, WRAPPED_NATIVE_TOKEN, 500);
//         vm.startPrank(provider);
//         usdc.transfer(address(account), value);
//         vm.stopPrank();
        
//         UserOperation memory op = fillUserOp(
//             fillData(
//                 address(usdc),
//                 0,
//                 abi.encodeWithSelector(MockERC20.approve.selector, address(uniStrat), value)
//             )
//         );
//         executeUserOp(op, "approve usdc", 0);

//         ISwapRouter.ExactInputSingleParams memory params = ISwapRouter.ExactInputSingleParams(USDC, WRAPPED_NATIVE_TOKEN, 3000, address(account), block.timestamp, value, 0, 0);

//         bytes memory data = abi.encodeWithSelector(
//             uniStrat.exactInputSingle.selector, params
//         );

//         IStrategyModule.StrategyTransaction memory _tx = IStrategyModule.StrategyTransaction(Enum.Operation.Call, address(uniStrat), 0, data);

//         bytes32 hash = stratModule.getStrategyTxHash(
//             _tx,
//             stratModule.getNonce(address(account))
//         );
//         stratModule.encodeStrategyData(_tx, stratModule.getNonce(address(account)));
//         (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, hash);
//         bytes memory signature = abi.encodePacked(r, s, v);

//         vm.expectRevert();
//         stratModule.requiredTxGas(address(account), _tx);

//         vm.deal(address(account), 10000);
//         vm.expectRevert();
//         stratModule.executeStrategy(address(account), _tx, signature);
//         vm.deal(address(account), 1e18);

//         uint256 wethBefore = WETH.balanceOf(address(account));
//         uint256 usdcBefore = usdc.balanceOf(address(account));
//         uint256 ethBefore = address(account).balance;

//         (bool executed, uint256 gasUsed,) = stratModule.executeStrategy(address(account), _tx, signature);

//         uint256 ethAfter = address(account).balance;
//         uint256 wethAfter = WETH.balanceOf(address(account));
//         uint256 usdcAfter = usdc.balanceOf(address(account));

//         console.log("weth balance before :", wethBefore);
//         console.log("usdc balance before :", usdcBefore);
//         console.log("weth balance after  :", wethAfter);
//         console.log("usdc balance after  :", usdcAfter);

//         assertEq(gasUsed * (stratModule.devFee() + stratModule.unhostedFee()) * tx.gasprice / 1e4, ethBefore - ethAfter);
//         assert(executed);
//         assertEq(usdcBefore - usdcAfter, 1e9);
//         assertEq(wethBefore, 0);
//         assertGt(wethAfter, 0);
        
//         assert(address(stratModule).balance > 0);
//         vm.prank(owner);
//         stratModule.claim();
//         vm.prank(unhosted);
//         stratModule.claim();
//         assert(address(stratModule).balance == 0);
//     }

//     function testInvalidSignatureExecution() external {
//         uint256 value = 1000e6;
//         address provider = uniV3Factory.getPool(USDC, WRAPPED_NATIVE_TOKEN, 500);
//         vm.startPrank(provider);
//         usdc.transfer(address(account), value);
//         vm.stopPrank();
        
//         UserOperation memory op = fillUserOp(
//             fillData(
//                 address(usdc),
//                 0,
//                 abi.encodeWithSelector(MockERC20.approve.selector, address(uniStrat), value)
//             )
//         );
//         executeUserOp(op, "approve usdc", 0);

//         ISwapRouter.ExactInputSingleParams memory params = ISwapRouter.ExactInputSingleParams(USDC, WRAPPED_NATIVE_TOKEN, 3000, address(account), block.timestamp, value, 0, 0);

//         bytes memory data = abi.encodeWithSelector(
//             uniStrat.exactInputSingle.selector, params
//         );

//         IStrategyModule.StrategyTransaction memory _tx = IStrategyModule.StrategyTransaction(Enum.Operation.Call, address(uniStrat), 0, data);

//         bytes32 hash = stratModule.getStrategyTxHash(
//             _tx,
//             stratModule.getNonce(address(account))
//         );
//         (, key) = makeAddrAndKey("Owner2");
//         (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, hash);
//         bytes memory signature = abi.encodePacked(r, s, v);

//         vm.expectRevert(IStrategyModule.InvalidSignature.selector);
//         stratModule.executeStrategy(address(account), _tx, signature);

//         bytes memory triggerData = abi.encodeWithSelector(
//             MockTrigger.hasEnoughBalance.selector, USDC, address(account), value
//         );

//         IStrategyModule.TriggeredStrategyTransaction memory _tx2 = IStrategyModule.TriggeredStrategyTransaction(Enum.Operation.Call, address(uniStrat), 0, data, address(trigger), triggerData);

//         bytes32 hash2 = stratModule.getTriggeredStrategyTxHash(
//             _tx2,
//             stratModule.getNonce(address(account))
//         );
//         (uint8 v2, bytes32 r2, bytes32 s2) = vm.sign(key, hash2);
//         bytes memory signature2 = abi.encodePacked(r2, s2, v2);

//         vm.expectRevert(IStrategyModule.InvalidSignature.selector);
//         stratModule.executeTriggeredStrategy(address(account), _tx2, signature2);
//     }

//     function testInvalidStrategyExecution() external {
//         vm.prank(owner);
//         stratModule.updateStrategy(address(uniStrat), address(0));
//         uint256 value = 1000e6;
//         address provider = uniV3Factory.getPool(USDC, WRAPPED_NATIVE_TOKEN, 500);
//         vm.startPrank(provider);
//         usdc.transfer(address(account), value);
//         vm.stopPrank();
        
//         UserOperation memory op = fillUserOp(
//             fillData(
//                 address(usdc),
//                 0,
//                 abi.encodeWithSelector(MockERC20.approve.selector, address(uniStrat), value)
//             )
//         );
//         executeUserOp(op, "approve usdc", 0);

//         ISwapRouter.ExactInputSingleParams memory params = ISwapRouter.ExactInputSingleParams(USDC, WRAPPED_NATIVE_TOKEN, 3000, address(account), block.timestamp, value, 0, 0);

//         bytes memory data = abi.encodeWithSelector(
//             uniStrat.exactInputSingle.selector, params
//         );

//         IStrategyModule.StrategyTransaction memory _tx = IStrategyModule.StrategyTransaction(Enum.Operation.Call, address(uniStrat), 0, data);

//         bytes32 hash = stratModule.getStrategyTxHash(
//             _tx,
//             stratModule.getNonce(address(account))
//         );
//         (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, hash);
//         bytes memory signature = abi.encodePacked(r, s, v);

//         vm.expectRevert(StrategyModule.InvalidStrategy.selector);
//         stratModule.executeStrategy(address(account), _tx, signature);

//         bytes memory triggerData = abi.encodeWithSelector(
//             MockTrigger.hasEnoughBalance.selector, USDC, address(account), value
//         );

//         IStrategyModule.TriggeredStrategyTransaction memory _tx2 = IStrategyModule.TriggeredStrategyTransaction(Enum.Operation.Call, address(uniStrat), 0, data, address(trigger), triggerData);

//         bytes32 hash2 = stratModule.getTriggeredStrategyTxHash(
//             _tx2,
//             stratModule.getNonce(address(account))
//         );
//         (uint8 v2, bytes32 r2, bytes32 s2) = vm.sign(key, hash2);
//         bytes memory signature2 = abi.encodePacked(r2, s2, v2);

//         vm.expectRevert(StrategyModule.InvalidStrategy.selector);
//         stratModule.executeTriggeredStrategy(address(account), _tx2, signature2);
//     }

//     function testTriggeredExecuteStrategy() external {
//         uint256 value = 1000e6;
//         address provider = uniV3Factory.getPool(USDC, WRAPPED_NATIVE_TOKEN, 500);
//         vm.startPrank(provider);
//         usdc.transfer(address(account), value);
//         vm.stopPrank();
        
//         UserOperation memory op = fillUserOp(
//             fillData(
//                 address(usdc),
//                 0,
//                 abi.encodeWithSelector(MockERC20.approve.selector, address(uniStrat), value)
//             )
//         );
//         executeUserOp(op, "approve usdc", 0);
        
//         ISwapRouter.ExactInputSingleParams memory params = ISwapRouter.ExactInputSingleParams(USDC, WRAPPED_NATIVE_TOKEN, 3000, address(account), block.timestamp, value, 0, 0);

//         bytes memory data = abi.encodeWithSelector(
//             uniStrat.exactInputSingle.selector, params
//         );

//         bytes memory triggerData = abi.encodeWithSelector(
//             MockTrigger.hasEnoughBalance.selector, USDC, address(account), value
//         );

//         IStrategyModule.TriggeredStrategyTransaction memory _tx = IStrategyModule.TriggeredStrategyTransaction(Enum.Operation.Call, address(uniStrat), 0, data, address(trigger), triggerData);

//         bytes32 hash = stratModule.getTriggeredStrategyTxHash(
//             _tx,
//             stratModule.getNonce(address(account))
//         );
//         stratModule.encodeTriggeredStrategyData(_tx, stratModule.getNonce(address(account)));
//         (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, hash);
//         bytes memory signature = abi.encodePacked(r, s, v);

//         vm.deal(address(account), 10000);
//         vm.expectRevert();
//         stratModule.executeTriggeredStrategy(address(account), _tx, signature);

//         vm.deal(address(account), 1e18);

//         uint256 wethBefore = WETH.balanceOf(address(account));
//         uint256 usdcBefore = usdc.balanceOf(address(account));

//         stratModule.executeTriggeredStrategy(address(account), _tx, signature);

//         uint256 wethAfter = WETH.balanceOf(address(account));
//         uint256 usdcAfter = usdc.balanceOf(address(account));

//         console.log("weth balance before :", wethBefore);
//         console.log("usdc balance before :", usdcBefore);
//         console.log("weth balance after  :", wethAfter);
//         console.log("usdc balance after  :", usdcAfter);

//         assertEq(usdcBefore - usdcAfter, 1e9);
//         assertEq(wethBefore, 0);
//         assertGt(wethAfter, 0);
//     }

//     function testNotTriggeredExecuteStrategy() external {
//         uint256 value = 1000e6;
//         address provider = uniV3Factory.getPool(USDC, WRAPPED_NATIVE_TOKEN, 500);
//         vm.startPrank(provider);
//         usdc.transfer(address(account), value - 1);
//         vm.stopPrank();
        
//         UserOperation memory op = fillUserOp(
//             fillData(
//                 address(usdc),
//                 0,
//                 abi.encodeWithSelector(MockERC20.approve.selector, address(uniStrat), value)
//             )
//         );
//         executeUserOp(op, "approve usdc", 0);
        
//         ISwapRouter.ExactInputSingleParams memory params = ISwapRouter.ExactInputSingleParams(USDC, WRAPPED_NATIVE_TOKEN, 3000, address(account), block.timestamp, value, 0, 0);

//         bytes memory data = abi.encodeWithSelector(
//             uniStrat.exactInputSingle.selector, params
//         );

//         bytes memory triggerData = abi.encodeWithSelector(
//             MockTrigger.hasEnoughBalance.selector, USDC, address(account), value
//         );

//         IStrategyModule.TriggeredStrategyTransaction memory _tx = IStrategyModule.TriggeredStrategyTransaction(Enum.Operation.Call, address(uniStrat), 0, data, address(trigger), triggerData);

//         bytes32 hash = stratModule.getTriggeredStrategyTxHash(
//             _tx,
//             stratModule.getNonce(address(account))
//         );
//         (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, hash);
//         bytes memory signature = abi.encodePacked(r, s, v);

//         uint256 wethBefore = WETH.balanceOf(address(account));
//         uint256 usdcBefore = usdc.balanceOf(address(account));
        
//         vm.expectRevert();
//         stratModule.executeTriggeredStrategy(address(account), _tx, signature);
//     }


//     function createAccount(address _owner) internal override {
//         (bool success, bytes memory data) =
//             address(factory).call(abi.encodeWithSelector(factory.deployCounterFactualAccount.selector, _owner, 0));
//     }

//     function getSignature(UserOperation memory _op) internal view override returns (bytes memory) {
//         return signUserOpHash(key, _op);
//     }

//     function getDummySig(UserOperation memory _op) internal pure override returns (bytes memory) {
//         return
//         hex"fffffffffffffffffffffffffffffff0000000000000000000000000000000007aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1c";
//     }

//     function fillData(address _to, uint256 _value, bytes memory _data) internal view override returns (bytes memory) {
//         return abi.encodeWithSelector(SmartAccount.executeCall.selector, _to, _value, _data);
//     }

//     function getAccountAddr(address _owner) internal view override returns (IAccount) {
//         (bool success, bytes memory data) = address(factory).staticcall(
//             abi.encodeWithSelector(factory.getAddressForCounterFactualAccount.selector, _owner, 0)
//         );
//         require(success, "getAccountAddr failed");
//         return IAccount(abi.decode(data, (address)));
//     }

//     function getInitCode(address _owner) internal view override returns (bytes memory) {
//         return abi.encodePacked(
//             address(factory), abi.encodeWithSelector(factory.deployCounterFactualAccount.selector, _owner, 0)
//         );
//     }
// }
