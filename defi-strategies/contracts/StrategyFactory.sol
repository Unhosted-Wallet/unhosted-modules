// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {Proxy} from "contracts/Proxy.sol";
import {IStrategyModuleFactory} from "contracts/interfaces/IStrategyFactory.sol";
import {IStrategyModule} from "contracts/interfaces/IStrategyModule.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title Strategy Module Factory - factory responsible for deploying Strategy Modules using CREATE2
 * @dev It deploys Strategy Modules as proxies pointing to `basicImplementation` that is immutable.
 * This allows keeping the same address for the same Strategy Module owner on various chains via CREATE2
 * @author M. Zakeri Rad - <@zakrad>
 */
contract StrategyModuleFactory is Ownable, IStrategyModuleFactory {
    address public immutable basicImplementation;

    constructor(address _basicImplementation) {
        require(
            _basicImplementation != address(0),
            "implementation cannot be zero"
        );
        basicImplementation = _basicImplementation;
    }

    /**
     * @dev See {IStrategyModuleFactory-getAddressForStrategyModule}.
     */
    function getAddressForStrategyModule(
        address beneficiary,
        address handler,
        uint256 index
    ) external view returns (address _module) {
        // create initializer data based on init method, _owner and minimalHandler
        bytes memory initializer = _getInitializer(beneficiary, handler);
        bytes memory code = abi.encodePacked(
            type(Proxy).creationCode,
            uint256(uint160(basicImplementation))
        );
        bytes32 salt = keccak256(
            abi.encodePacked(keccak256(initializer), index)
        );
        bytes32 hash = keccak256(
            abi.encodePacked(bytes1(0xff), address(this), salt, keccak256(code))
        );
        _module = address(uint160(uint256(hash)));
    }

    /**
     * @dev See {IStrategyModuleFactory-deployStrategyModule}.
     */
    function deployStrategyModule(
        address beneficiary,
        address handler,
        uint256 index
    ) public returns (address proxy) {
        // create initializer data based on init method and parameters
        bytes memory initializer = _getInitializer(beneficiary, handler);
        bytes32 salt = keccak256(
            abi.encodePacked(keccak256(initializer), index)
        );

        bytes memory deploymentData = abi.encodePacked(
            type(Proxy).creationCode,
            uint256(uint160(basicImplementation))
        );

        assembly {
            proxy := create2(
                0x0,
                add(0x20, deploymentData),
                mload(deploymentData),
                salt
            )
        }
        require(address(proxy) != address(0), "Create2 call failed");

        assembly {
            let success := call(
                gas(),
                proxy,
                0,
                add(initializer, 0x20),
                mload(initializer),
                0,
                0
            )
            let ptr := mload(0x40)
            returndatacopy(ptr, 0, returndatasize())
            if iszero(success) {
                revert(ptr, returndatasize())
            }
        }
        emit StrategyCreation(proxy, beneficiary, handler, index);
    }

    /**
     * @dev See {IStrategyModuleFactory-moduleCreationCode}.
     */
    function moduleCreationCode() public pure returns (bytes memory) {
        return type(Proxy).creationCode;
    }

    /**
     * @dev Allows to retrieve the initializer data for the module.
     * @return initializer bytes for init method
     */
    function _getInitializer(
        address beneficiary,
        address handler
    ) internal pure returns (bytes memory) {
        return abi.encodeCall(IStrategyModule.init, (beneficiary, handler));
    }
}
