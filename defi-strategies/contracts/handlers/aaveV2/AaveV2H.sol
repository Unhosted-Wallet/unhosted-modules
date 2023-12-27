// SPDX-License-Identifier: MIT
/// This is developed based on HAaveProtocolV2.sol by Furucombo
pragma solidity 0.8.20;

import {ILendingPoolV2} from "contracts/handlers/aaveV2/ILendingPoolV2.sol";
import {ILendingPoolAddressesProviderV2} from "./ILendingPoolAddressesProviderV2.sol";
import {DataTypes} from "contracts/handlers/aaveV2/libraries/DataTypes.sol";
import {IWrappedNativeToken} from "contracts/handlers/wrappednativetoken/IWrappedNativeToken.sol";
import {BaseHandler, IERC20, SafeERC20} from "contracts/handlers/BaseHandler.sol";
import {IAaveV2Handler} from "contracts/handlers/aaveV2/IAaveV2H.sol";

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
        address[] memory assets,
        uint256[] memory amounts,
        uint256[] memory modes,
        bytes memory params
    ) public payable {
        {
            uint256 length = assets.length;
            if (length != amounts.length || length != modes.length) {
                revert NoArrayParity();
            }
        }
        address handler;
        address flashloanHandler = fallbackHandler;
        address onBehalfOf = address(this);
        address pool = ILendingPoolAddressesProviderV2(provider)
            .getLendingPool();

        for (uint256 i; i < assets.length; ) {
            IERC20(assets[i]).forceApprove(pool, type(uint256).max);
            unchecked {
                ++i;
            }
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
        for (uint256 i; i < assets.length; ) {
            IERC20(assets[i]).forceApprove(pool, 0);
            unchecked {
                ++i;
            }
        }
    }

    function getContractName()
        public
        pure
        virtual
        override
        returns (string memory)
    {
        return "AaveV2H";
    }

    function _deposit(
        address asset,
        uint256 amount
    ) internal returns (uint256 depositAmount) {
        (address pool, address aToken) = _getLendingPoolAndAToken(asset);
        IERC20(asset).forceApprove(pool, amount);
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

        IERC20(asset).forceApprove(pool, 0);
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
        IERC20(asset).forceApprove(pool, amount);

        /* solhint-disable no-empty-blocks */
        try
            ILendingPoolV2(pool).repay(asset, amount, rateMode, onBehalfOf)
        {} catch Error(string memory reason) {
            _revertMsg("repay", reason);
        } catch {
            _revertMsg("repay");
        }
        IERC20(asset).forceApprove(pool, 0);

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
            if (aToken == address(0)) {
                revert InvalidAddress();
            }
        } catch Error(string memory reason) {
            _revertMsg("General", reason);
        } catch {
            _revertMsg("General");
        }
    }
}
