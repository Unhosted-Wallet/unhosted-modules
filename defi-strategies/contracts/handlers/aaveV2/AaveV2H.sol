// SPDX-License-Identifier: MIT
/// This is developed based on HAaveProtocolV2.sol by Furucombo
pragma solidity 0.8.20;

import {IERC20, SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ILendingPoolV2} from "./ILendingPoolV2.sol";
import {ILendingPoolAddressesProviderV2} from "./ILendingPoolAddressesProviderV2.sol";
import {DataTypes} from "./libraries/DataTypes.sol";
import {IWrappedNativeToken} from "../wrappednativetoken/IWrappedNativeToken.sol";
import {BaseHandler} from "../BaseHandler.sol";
import {IAaveV2Handler} from "./IAaveV2H.sol";

contract AaveV2Handler is BaseHandler, IAaveV2Handler {
    using SafeERC20 for IERC20;

    address public immutable provider;
    address public immutable fallbackHandler;
    IWrappedNativeToken public immutable wrappedNativeTokenAaveV2;

    constructor(
        address wrappedNativeToken_,
        address provider_,
        address fallbackHandler_
    ) {
        wrappedNativeTokenAaveV2 = IWrappedNativeToken(wrappedNativeToken_);
        provider = provider_;
        fallbackHandler = fallbackHandler_;
    }

    function deposit(
        address asset,
        uint256 amount
    ) public payable returns (uint256 depositAmount) {
        amount = _getBalance(asset, amount);
        depositAmount = _deposit(asset, amount);
    }

    function depositETH(
        uint256 amount
    ) public payable returns (uint256 depositAmount) {
        amount = _getBalance(NATIVE_TOKEN_ADDRESS, amount);
        wrappedNativeTokenAaveV2.deposit{value: amount}();
        depositAmount = _deposit(address(wrappedNativeTokenAaveV2), amount);
    }

    function withdraw(
        address asset,
        uint256 amount
    ) public payable returns (uint256 withdrawAmount) {
        withdrawAmount = _withdraw(asset, amount);
    }

    function withdrawETH(
        uint256 amount
    ) public payable returns (uint256 withdrawAmount) {
        withdrawAmount = _withdraw(address(wrappedNativeTokenAaveV2), amount);
        wrappedNativeTokenAaveV2.withdraw(withdrawAmount);
    }

    function repay(
        address asset,
        uint256 amount,
        uint256 rateMode,
        address onBehalfOf
    ) public payable returns (uint256 remainDebt) {
        remainDebt = _repay(asset, amount, rateMode, onBehalfOf);
    }

    function repayETH(
        uint256 amount,
        uint256 rateMode,
        address onBehalfOf
    ) public payable returns (uint256 remainDebt) {
        wrappedNativeTokenAaveV2.deposit{value: amount}();
        remainDebt = _repay(
            address(wrappedNativeTokenAaveV2),
            amount,
            rateMode,
            onBehalfOf
        );
    }

    function borrow(
        address asset,
        uint256 amount,
        uint256 rateMode
    ) public payable {
        address onBehalfOf = address(this);
        _borrow(asset, amount, rateMode, onBehalfOf);
    }

    function borrowETH(uint256 amount, uint256 rateMode) public payable {
        address onBehalfOf = address(this);
        _borrow(
            address(wrappedNativeTokenAaveV2),
            amount,
            rateMode,
            onBehalfOf
        );
        wrappedNativeTokenAaveV2.withdraw(amount);
    }

    function flashLoan(
        address[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata modes,
        bytes calldata params
    ) public payable {
        _requireMsg(
            assets.length == amounts.length,
            "flashLoan",
            "assets and amounts do not match"
        );

        _requireMsg(
            assets.length == modes.length,
            "flashLoan",
            "assets and modes do not match"
        );

        address handler;
        address flashloanHandler = fallbackHandler;
        address onBehalfOf = address(this);
        address pool = ILendingPoolAddressesProviderV2(provider)
            .getLendingPool();

        for (uint256 i = 0; i < assets.length; i++) {
            _tokenApprove(assets[i], pool, type(uint256).max);
        }

        assembly {
            handler := sload(FALLBACK_HANDLER_STORAGE_SLOT)

            sstore(FALLBACK_HANDLER_STORAGE_SLOT, flashloanHandler)
        }

        /* solhint-disable no-empty-blocks */
        try
            ILendingPoolV2(pool).flashLoan(
                address(this),
                assets,
                amounts,
                modes,
                onBehalfOf,
                params,
                0
            )
        {} catch Error(string memory reason) {
            _revertMsg("flashLoan", reason);
        } catch {
            _revertMsg("flashLoan");
        }

        assembly {
            sstore(FALLBACK_HANDLER_STORAGE_SLOT, handler)
        }

        // approve lending pool zero
        for (uint256 i = 0; i < assets.length; i++) {
            _tokenApproveZero(assets[i], pool);
        }
    }

    function getContractName()
        public
        pure
        virtual
        override
        returns (string memory)
    {
        return "HAaveProtocolV2";
    }

    function _deposit(
        address asset,
        uint256 amount
    ) internal returns (uint256 depositAmount) {
        (address pool, address aToken) = _getLendingPoolAndAToken(asset);
        _tokenApprove(asset, pool, amount);
        uint256 beforeATokenAmount = IERC20(aToken).balanceOf(address(this));

        /* solhint-disable no-empty-blocks */
        try
            ILendingPoolV2(pool).deposit(asset, amount, address(this), 0)
        {} catch Error(string memory reason) {
            _revertMsg("deposit", reason);
        } catch {
            _revertMsg("deposit");
        }

        unchecked {
            depositAmount =
                IERC20(aToken).balanceOf(address(this)) -
                beforeATokenAmount;
        }

        _tokenApproveZero(asset, pool);
    }

    function _withdraw(
        address asset,
        uint256 amount
    ) internal returns (uint256 withdrawAmount) {
        (address pool, address aToken) = _getLendingPoolAndAToken(asset);
        amount = _getBalance(aToken, amount);

        try
            ILendingPoolV2(pool).withdraw(asset, amount, address(this))
        returns (uint256 ret) {
            withdrawAmount = ret;
        } catch Error(string memory reason) {
            _revertMsg("withdraw", reason);
        } catch {
            _revertMsg("withdraw");
        }
    }

    function _repay(
        address asset,
        uint256 amount,
        uint256 rateMode,
        address onBehalfOf
    ) internal returns (uint256 remainDebt) {
        address pool = ILendingPoolAddressesProviderV2(provider)
            .getLendingPool();
        _tokenApprove(asset, pool, amount);

        /* solhint-disable no-empty-blocks */
        try
            ILendingPoolV2(pool).repay(asset, amount, rateMode, onBehalfOf)
        {} catch Error(string memory reason) {
            _revertMsg("repay", reason);
        } catch {
            _revertMsg("repay");
        }
        _tokenApproveZero(asset, pool);

        DataTypes.ReserveData memory reserve = ILendingPoolV2(pool)
            .getReserveData(asset);
        remainDebt = DataTypes.InterestRateMode(rateMode) ==
            DataTypes.InterestRateMode.STABLE
            ? IERC20(reserve.stableDebtTokenAddress).balanceOf(onBehalfOf)
            : IERC20(reserve.variableDebtTokenAddress).balanceOf(onBehalfOf);
    }

    function _borrow(
        address asset,
        uint256 amount,
        uint256 rateMode,
        address onBehalfOf
    ) internal {
        address pool = ILendingPoolAddressesProviderV2(provider)
            .getLendingPool();

        /* solhint-disable no-empty-blocks */
        try
            ILendingPoolV2(pool).borrow(asset, amount, rateMode, 0, onBehalfOf)
        {} catch Error(string memory reason) {
            _revertMsg("borrow", reason);
        } catch {
            _revertMsg("borrow");
        }
    }

    function _getLendingPoolAndAToken(
        address underlying
    ) internal view returns (address pool, address aToken) {
        pool = ILendingPoolAddressesProviderV2(provider).getLendingPool();
        try ILendingPoolV2(pool).getReserveData(underlying) returns (
            DataTypes.ReserveData memory data
        ) {
            aToken = data.aTokenAddress;
            _requireMsg(
                aToken != address(0),
                "General",
                "aToken should not be zero address"
            );
        } catch Error(string memory reason) {
            _revertMsg("General", reason);
        } catch {
            _revertMsg("General");
        }
    }
}
