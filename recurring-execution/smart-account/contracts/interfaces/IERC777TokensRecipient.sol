// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity 0.8.20;

interface IERC777TokensRecipient {
    function tokensReceived(
        address operator,
        address from,
        address to,
        uint256 amount,
        bytes calldata data,
        bytes calldata operatorData
    ) external;
}
