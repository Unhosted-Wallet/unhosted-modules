// SPDX-License-Identifier: MIT
/// This is developed and simplified based on HCompoundV3.sol by Furucombo

pragma solidity 0.8.20;

import {BaseHandler, IERC20} from "contracts/handlers/BaseHandler.sol";
import {IWrappedNativeToken} from "contracts/handlers/wrappednativetoken/IWrappedNativeToken.sol";
import {IComet} from "contracts/handlers/compoundV3/IComet.sol";
import {ICompoundV3Handler} from "contracts/handlers/compoundV3/ICompoundV3H.sol";

contract CompoundV3Handler is BaseHandler, ICompoundV3Handler {
    IWrappedNativeToken public immutable wrappedNativeTokenCompV3;

    constructor(address wrappedNativeToken_) {
        wrappedNativeTokenCompV3 = IWrappedNativeToken(wrappedNativeToken_);
    }

    function supply(
        address comet,
        address asset,
        uint256 amount
    ) public payable {
        amount = _getBalance(asset, amount);
        if (amount == 0) {
            revert InvalidAmount();
        }
        _supply(
            comet,
            address(this), // Return to address(this)
            asset,
            amount
        );
    }

    function supplyETH(address comet, uint256 amount) public payable {
        if (amount == 0) {
            revert InvalidAmount();
        }
        amount = _getBalance(NATIVE_TOKEN_ADDRESS, amount);
        wrappedNativeTokenCompV3.deposit{value: amount}();

        _supply(
            comet,
            address(this), // Return to address(this)
            address(wrappedNativeTokenCompV3),
            amount
        );
    }

    function withdraw(
        address comet,
        address asset,
        uint256 amount
    ) public payable returns (uint256 withdrawAmount) {
        if (amount == 0) {
            revert InvalidAmount();
        }

        // No _getBalance: because we use comet.allow() to help users withdraw
        bool isBorrowed;
        (withdrawAmount, isBorrowed) = _withdraw(
            comet,
            address(this), // from
            asset,
            amount
        );

        // Borrow is not allowed
        if (isBorrowed) {
            revert NotAllowed();
        }
    }

    function withdrawETH(
        address comet,
        uint256 amount
    ) public payable returns (uint256 withdrawAmount) {
        if (amount == 0) {
            revert InvalidAmount();
        }

        // No _getBalance: because we use comet.allow() to help users withdraw
        bool isBorrowed;
        (withdrawAmount, isBorrowed) = _withdraw(
            comet,
            address(this), // from
            address(wrappedNativeTokenCompV3),
            amount
        );

        // Borrow is not allowed
        if (isBorrowed) {
            revert NotAllowed();
        }
        wrappedNativeTokenCompV3.withdraw(withdrawAmount);
    }

    function borrow(
        address comet,
        uint256 amount
    ) public payable returns (uint256 borrowAmount) {
        if (amount == 0) {
            revert InvalidAmount();
        }

        bool isBorrowed;
        address baseToken = IComet(comet).baseToken();
        (borrowAmount, isBorrowed) = _withdraw(
            comet,
            address(this), // from
            baseToken,
            amount
        );

        // Withdrawal is not allowed
        if (isBorrowed) {
            revert NotAllowed();
        }
    }

    function borrowETH(
        address comet,
        uint256 amount
    ) public payable returns (uint256 borrowAmount) {
        if (IComet(comet).baseToken() != address(wrappedNativeTokenCompV3)) {
            revert InvalidComet();
        }
        if (amount == 0) {
            revert InvalidAmount();
        }

        bool isBorrowed;
        (borrowAmount, isBorrowed) = _withdraw(
            comet,
            address(this), // from
            address(wrappedNativeTokenCompV3),
            amount
        );

        // Withdrawal is not allowed
        if (isBorrowed) {
            revert NotAllowed();
        }
        wrappedNativeTokenCompV3.withdraw(borrowAmount);
    }

    function repay(address comet, uint256 amount) public payable {
        if (amount == 0) {
            revert InvalidAmount();
        }

        address asset = IComet(comet).baseToken();
        amount = _getBalance(asset, amount);
        _supply(
            comet,
            address(this), // to
            asset,
            amount
        );
    }

    function repayETH(address comet, uint256 amount) public payable {
        if (IComet(comet).baseToken() != address(wrappedNativeTokenCompV3)) {
            revert InvalidComet();
        }
        if (amount == 0) {
            revert InvalidAmount();
        }

        amount = _getBalance(NATIVE_TOKEN_ADDRESS, amount);
        wrappedNativeTokenCompV3.deposit{value: amount}();
        _supply(
            comet,
            address(this), // to
            address(wrappedNativeTokenCompV3),
            amount
        );
    }

    function getContractName()
        public
        pure
        virtual
        override
        returns (string memory)
    {
        return "CompoundV3H";
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
