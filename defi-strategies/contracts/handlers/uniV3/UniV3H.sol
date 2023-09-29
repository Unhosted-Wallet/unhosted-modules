// SPDX-License-Identifier: MIT
/// This is developed based on HAaveProtocolV2.sol by Furucombo
pragma solidity 0.8.17;

import {IERC20, SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {IWrappedNativeToken} from "../wrappednativetoken/IWrappedNativeToken.sol";
import {BaseHandler} from "../BaseHandler.sol";
import {IUniswapRouterV3} from "../interfaces/common/IUniswapRouterV3.sol";
import {IUniswapRouterETH} from "../interfaces/common/IUniswapRouterETH.sol";
import {console} from "hardhat/console.sol";

contract UniV3Handler is BaseHandler, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IUniswapRouterV3 public immutable swapRouter;
    IUniswapRouterETH public immutable sushiRouter;
    
    address public constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    address public constant WETH9 = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    uint24 public constant FEE_TIER = 3000; // 0.3% fee tier pool

    mapping(address => uint256) public depositInfo;
    mapping(address => bool) public isDepositUser;

    address public immutable devAddress;
    uint256 public immutable devFee; // 1% = 100

    uint256 public totalDepositedUser;
    uint256 public totalDepositedAmount;
    uint256 public totalProfitAmount;
    uint256 public devFeeAmount;

    constructor(
        IUniswapRouterV3 swapRouter_,
        IUniswapRouterETH sushiRouter_,
        uint256 devFee_,
        address devAddress_
    ) {
        swapRouter = swapRouter_;
        sushiRouter = sushiRouter_;
        devFee = devFee_;
        devAddress = devAddress_;
    }

    function deposit(uint256 amount) external nonReentrant {
        console.log("Sender", msg.sender);
        IERC20(USDC).safeTransferFrom(msg.sender, address(this), amount);
        IERC20(USDC).safeApprove(address(swapRouter), amount);
        uint256 balance = IERC20(USDC).balanceOf(address(this));

        console.log("Balance", balance);
        depositInfo[msg.sender] += amount;
        totalDepositedAmount += amount;
        if (!isDepositUser[msg.sender]) {
            ++totalDepositedUser;
        }
        isDepositUser[msg.sender] = true;
    }

    function withdraw(uint256 amount) external nonReentrant {
        _requireMsg(
            depositInfo[msg.sender] >= amount,
            "withdraw",
            "You don't have amount to withdraw"
        );

        depositInfo[msg.sender] -= amount;
        IERC20(USDC).safeTransfer(msg.sender, depositInfo[msg.sender]);
    }

    function compound() external {
        IUniswapRouterV3.ExactInputSingleParams memory params = IUniswapRouterV3
            .ExactInputSingleParams({
                tokenIn: USDC,
                tokenOut: WETH9,
                fee: FEE_TIER,
                recipient: address(this),
                deadline: block.timestamp,
                amountIn: depositInfo[msg.sender],
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            });
        uint256 amountOut = swapRouter.exactInputSingle(params);
        IERC20(WETH9).safeApprove(address(sushiRouter), amountOut);

        address[] memory swapPath = new address[](2);
        swapPath[0] = WETH9;
        swapPath[1] = USDC;
        uint256[] memory amountsOut = sushiRouter.swapExactTokensForTokens(
            amountOut,
            depositInfo[msg.sender],
            swapPath,
            address(this),
            block.timestamp + 100
        );
        uint256 profit = amountsOut[amountsOut.length - 1] -
            depositInfo[msg.sender];
        totalProfitAmount += profit;
        devFeeAmount += (profit * devFee) / 10000;
        depositInfo[msg.sender] =
            amountsOut[amountsOut.length - 1] -
            ((profit * devFee) / 10000);
    }

    /* solhint-disable no-empty-blocks */
    function execStrategy(bytes memory data) public payable {}

    function getAPY() public view returns (uint256) {
        return (totalProfitAmount * 10000) / totalDepositedAmount;
    }

    function getContractName() public pure override returns (string memory) {
        return "UniswapV3 Handler";
    }
}
