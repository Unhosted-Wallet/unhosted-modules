// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity 0.8.20;

/* solhint-disable no-empty-blocks */
import {IFlashLoanReceiver} from "./IFlashLoanReceiver.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title Default Callback Handler - returns true for known token callbacks
 *   @dev Handles EIP-1271 compliant isValidSignature requests.
 *  @notice inspired by Richard Meissner's <richard@gnosis.pm> implementation
 */
contract FlashloanCallbackHandler is IFlashLoanReceiver {
    function executeOperation(
        address[] calldata,
        uint256[] calldata,
        uint256[] calldata,
        address,
        bytes calldata
    ) external virtual returns (bool) {
        // execute logic on flashloan receive
        return true;
    }
}
