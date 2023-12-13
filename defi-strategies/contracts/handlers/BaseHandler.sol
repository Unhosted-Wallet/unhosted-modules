// SPDX-License-Identifier: MIT
/// This is developed and simplified based on HandlerBase.sol by Furucombo
pragma solidity 0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "contracts/handlers/interface/IERC20Usdt.sol";

abstract contract BaseHandler {
    using SafeERC20 for IERC20;

    address public constant NATIVE_TOKEN_ADDRESS =
        0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    ///@dev keccak-256 hash of "fallback_manager.handler.address" subtracted by 1 based on FallbackManager.sol
    bytes32 internal constant FALLBACK_HANDLER_STORAGE_SLOT =
        0x6c9a6c4a39284e37ed1cf53d337577d14212a4870fb976a4366c693b939918d4;

    error InvalidPathSize();
    error InvalidAddress();
    error NoArrayParity();
    error InvalidAmount();
    error InvalidComet();
    error NotAllowed();

    function getContractName() public pure virtual returns (string memory);

    function _getBalance(
        address token,
        uint256 amount
    ) internal view returns (uint256) {
        if (amount != type(uint256).max) {
            return amount;
        }

        // ETH case
        if (token == address(0) || token == NATIVE_TOKEN_ADDRESS) {
            return amount;
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
}
