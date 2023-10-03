// SPDX-License-Identifier: MIT
/// This is developed and simplified based on HandlerBase.sol by Furucombo
pragma solidity 0.8.17;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interface/IERC20Usdt.sol";

abstract contract BaseHandler {
    using SafeERC20 for IERC20;

    address public constant NATIVE_TOKEN_ADDRESS =
        0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    bytes32 internal constant FALLBACK_HANDLER_STORAGE_SLOT =
        0x6c9a6c4a39284e37ed1cf53d337577d14212a4870fb976a4366c693b939918d4;

    function getContractName() public pure virtual returns (string memory);

    function _tokenApprove(
        address token,
        address spender,
        uint256 amount
    ) internal {
        solhint-disable
        try IERC20Usdt(token).approve(spender, amount) {} catch {
            IERC20(token).safeApprove(spender, 0);
            IERC20(token).safeApprove(spender, amount);
        }
    }

    function _tokenApproveZero(address token, address spender) internal {
        if (IERC20Usdt(token).allowance(address(this), spender) > 0) {
            try IERC20Usdt(token).approve(spender, 0) {} catch {
                IERC20Usdt(token).approve(spender, 1);
            }
        }
    }

    function _getBalance(
        address token,
        uint256 amount
    ) internal view returns (uint256) {
        if (amount != type(uint256).max) {
            return amount;
        }

        // ETH case
        if (token == address(0) || token == NATIVE_TOKEN_ADDRESS) {
            return address(this).balance;
        }
        // ERC20 token case
        return IERC20(token).balanceOf(address(this));
    }

    function _revertMsg(
        string memory functionName,
        string memory reason
    ) internal pure {
        revert(
            string(
                abi.encodePacked(
                    getContractName(),
                    "_",
                    functionName,
                    ": ",
                    reason
                )
            )
        );
    }

    function _revertMsg(string memory functionName) internal pure {
        _revertMsg(functionName, "Unspecified");
    }

    function _requireMsg(
        bool condition,
        string memory functionName,
        string memory reason
    ) internal pure {
        if (!condition) _revertMsg(functionName, reason);
    }
}
