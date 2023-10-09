// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import {BaseHandler, IERC20} from "../BaseHandler.sol";
import {IWrappedNativeToken} from "../wrappednativetoken/IWrappedNativeToken.sol";
import {IComet} from "./IComet.sol";

contract CompoundV3Handler is BaseHandler {
    address public immutable wrappedNativeToken;

    constructor(address wrappedNativeToken_) {
        wrappedNativeToken = wrappedNativeToken_;
    }

    function supply(
        address comet,
        address asset,
        uint256 amount
    ) external payable {
        _requireMsg(amount != 0, "supply", "zero amount");
        amount = _getBalance(asset, amount);
        _supply(
            comet,
            address(this), // Return to address(this)
            asset,
            amount
        );
    }

    function supplyETH(address comet, uint256 amount) external payable {
        _requireMsg(amount != 0, "supplyETH", "zero amount");
        amount = _getBalance(NATIVE_TOKEN_ADDRESS, amount);
        IWrappedNativeToken(wrappedNativeToken).deposit{value: amount}();

        _supply(
            comet,
            address(this), // Return to address(this)
            wrappedNativeToken,
            amount
        );
    }

    function withdraw(
        address comet,
        address asset,
        uint256 amount
    ) external payable returns (uint256 withdrawAmount) {
        _requireMsg(amount != 0, "withdraw", "zero amount");

        // No _getBalance: because we use comet.allow() to help users withdraw
        bool isBorrowed;
        (withdrawAmount, isBorrowed) = _withdraw(
            comet,
            address(this), // from
            asset,
            amount
        );

        // Borrow is not allowed
        _requireMsg(!isBorrowed, "withdraw", "borrow");
    }

    function withdrawETH(
        address comet,
        uint256 amount
    ) external payable returns (uint256 withdrawAmount) {
        _requireMsg(amount != 0, "withdrawETH", "zero amount");

        // No _getBalance: because we use comet.allow() to help users withdraw
        bool isBorrowed;
        (withdrawAmount, isBorrowed) = _withdraw(
            comet,
            address(this), // from
            wrappedNativeToken,
            amount
        );

        // Borrow is not allowed
        _requireMsg(!isBorrowed, "withdrawETH", "borrow");
        IWrappedNativeToken(wrappedNativeToken).withdraw(withdrawAmount);
    }

    function borrow(
        address comet,
        uint256 amount
    ) external payable returns (uint256 borrowAmount) {
        _requireMsg(amount != 0, "borrow", "zero amount");

        bool isBorrowed;
        address baseToken = IComet(comet).baseToken();
        (borrowAmount, isBorrowed) = _withdraw(
            comet,
            address(this), // from
            baseToken,
            amount
        );

        // Withdrawal is not allowed
        _requireMsg(isBorrowed, "borrow", "withdraw");
    }

    function borrowETH(
        address comet,
        uint256 amount
    ) external payable returns (uint256 borrowAmount) {
        _requireMsg(
            IComet(comet).baseToken() == wrappedNativeToken,
            "borrowETH",
            "wrong comet"
        );
        _requireMsg(amount != 0, "borrowETH", "zero amount");

        bool isBorrowed;
        (borrowAmount, isBorrowed) = _withdraw(
            comet,
            address(this), // from
            wrappedNativeToken,
            amount
        );

        // Withdrawal is not allowed
        _requireMsg(isBorrowed, "borrowETH", "withdraw");
        IWrappedNativeToken(wrappedNativeToken).withdraw(borrowAmount);
    }

    function repay(address comet, uint256 amount) external payable {
        _requireMsg(amount != 0, "repay", "zero amount");

        address asset = IComet(comet).baseToken();
        amount = _getBalance(asset, amount);
        _supply(
            comet,
            address(this), // to
            asset,
            amount
        );
    }

    function repayETH(address comet, uint256 amount) external payable {
        _requireMsg(
            IComet(comet).baseToken() == wrappedNativeToken,
            "repayETH",
            "wrong comet"
        );
        _requireMsg(amount != 0, "repayETH", "zero amount");

        amount = _getBalance(NATIVE_TOKEN_ADDRESS, amount);
        IWrappedNativeToken(wrappedNativeToken).deposit{value: amount}();
        _supply(
            comet,
            address(this), // to
            wrappedNativeToken,
            amount
        );
    }

    function getContractName() public pure override returns (string memory) {
        return "HCompoundV3";
    }

    /* ========== INTERNAL FUNCTIONS ========== */

    function _supply(
        address comet,
        address dst,
        address asset,
        uint256 amount
    ) internal {
        _tokenApprove(asset, comet, amount);
        /* solhint-disable no-empty-blocks */
        try IComet(comet).supplyTo(dst, asset, amount) {} catch Error(
            string memory reason
        ) {
            _revertMsg("supply", reason);
        } catch {
            _revertMsg("supply");
        }
        _tokenApproveZero(asset, comet);
    }

    function _withdraw(
        address comet,
        address from,
        address asset,
        uint256 amount
    ) internal returns (uint256 withdrawAmount, bool isBorrowed) {
        uint256 beforeBalance = IERC20(asset).balanceOf(address(this));
        uint256 borrowBalanceBefore = IComet(comet).borrowBalanceOf(from);

        try
            IComet(comet).withdrawFrom(
                from,
                address(this), // to
                asset,
                amount
            )
        {
            withdrawAmount =
                IERC20(asset).balanceOf(address(this)) -
                beforeBalance;
            isBorrowed =
                IComet(comet).borrowBalanceOf(from) > borrowBalanceBefore;
        } catch Error(string memory reason) {
            _revertMsg("withdraw", reason);
        } catch {
            _revertMsg("withdraw");
        }
    }
}