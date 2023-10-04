// SPDX-License-Identifier: MIT
/// This is developed based on HAaveProtocolV2.sol by Furucombo
pragma solidity 0.8.17;

import {IERC20, SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {BaseHandler} from "../../../handlers/BaseHandler.sol";
import {IUniswapRouterV3} from "./IUniswapRouterV3.sol";
import {IUniswapRouterETH} from "./IUniswapRouterETH.sol";

contract UniV3Handler is BaseHandler, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IUniswapRouterV3 public immutable swapRouter;
    IUniswapRouterETH public immutable sushiRouter;

    address public constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    address public constant WETH9 = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    uint24 public constant FEE_TIER = 3000; // 0.3% fee tier pool

    constructor(
        IUniswapRouterV3 swapRouter_,
        IUniswapRouterETH sushiRouter_
    ) {
        swapRouter = swapRouter_;
        sushiRouter = sushiRouter_;
    }

    function deposit(
        uint256 amount
    ) external nonReentrant returns (uint256[] memory){
        _tokenApprove(USDC, address(swapRouter), amount);
        IUniswapRouterV3.ExactInputSingleParams memory params = IUniswapRouterV3
            .ExactInputSingleParams({
                tokenIn: USDC,
                tokenOut: WETH9,
                fee: FEE_TIER,
                recipient: address(this),
                deadline: block.timestamp,
                amountIn: amount,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            });
        uint256 amountOut = swapRouter.exactInputSingle(params);

        _tokenApprove(WETH9, address(sushiRouter), amount);

        address[] memory swapPath = new address[](2);
        swapPath[0] = WETH9;
        swapPath[1] = USDC;
        uint256[] memory amountsOut = sushiRouter.swapExactTokensForTokens(
            amountOut,
            amount,
            swapPath,
            address(this),
            block.timestamp + 100
        );
        return amountsOut;
    }

    function getContractName() public pure override returns (string memory) {
        return "UniswapV3 Example Handler";
    }
}
