// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity 0.8.20;

/* solhint-disable no-empty-blocks */
import {IFlashLoanReceiver} from "contracts/handlers/aaveV2/IFlashLoanReceiver.sol";

/**
 * @title Default Callback Handler - returns true for known token callbacks
 *   @dev Handles EIP-1271 compliant isValidSignature requests.
 *  @notice inspired by Richard Meissner's <richard@gnosis.pm> implementation
 */
contract FlashloanCallbackHandler is IFlashLoanReceiver {
    address public immutable provider;

    error InvalidInitiator();

    constructor(address provider_) {
        provider = provider_;
    }

    function executeOperation(
        address[] calldata,
        uint256[] calldata,
        uint256[] calldata,
        address initiator,
        bytes calldata
    ) external virtual returns (bool) {
        if (initiator != msg.sender) {
            revert InvalidInitiator();
        }
        // execute logic on flashloan receive
        return true;
    }
}
