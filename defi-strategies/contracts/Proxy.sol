// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

/**
 * @title Proxy // This is the Strategy Module
 * @notice Basic proxy that delegates all calls to a fixed implementation contract.
 * @dev Implementation address is stored in the slot defined by the Proxy's address
 */
contract Proxy {
    error InvalidAddress();

    constructor(address _implementation) {
        if (_implementation == address(0)) {
            revert InvalidAddress();
        }
        assembly {
            sstore(address(), _implementation)
        }
    }

    fallback() external payable {
        address target;
        assembly {
            target := sload(address())
            calldatacopy(0, 0, calldatasize())
            let result := delegatecall(gas(), target, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch result
            case 0 {
                revert(0, returndatasize())
            }
            default {
                return(0, returndatasize())
            }
        }
    }
}
