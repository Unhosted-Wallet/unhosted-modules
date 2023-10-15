// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import {Proxy} from "./Proxy.sol";
import {IStrategyModule} from "./interfaces/IStrategyModule.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC165Checker} from "@openzeppelin/contracts/utils/introspection/ERC165Checker.sol";

/**
 * @title Strategy Module Factory - factory responsible for deploying Strategy Modules using CREATE2
 * @dev It deploys Strategy Modules as proxies pointing to `basicImplementation` that is immutable.
 * This allows keeping the same address for the same Strategy Module owner on various chains via CREATE2
 * @author M. Zakeri Rad - <@zakrad>
 */
contract StrategyModuleFactory is Ownable {
    using ERC165Checker for address;

    address public immutable basicImplementation;

    event StrategyCreation(
        address indexed module,
        address indexed beneficiary,
        address indexed handler,
        uint256 index
    );

    error UnsupportedInterface();

    constructor(address _basicImplementation) {
        require(
            _basicImplementation != address(0),
            "implementation cannot be zero"
        );
        basicImplementation = _basicImplementation;
    }

    /**
     * @notice Allows to find out strategy module address prior to deployment
     * @param index extra salt that allows to deploy more module if needed for same EOA (default 0)
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
     * @notice Deploys module using create2 and points it to basicImplementation
     *
     * @param index extra salt that allows to deploy more module if needed for same EOA (default 0)
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

        if (initializer.length > 0) {
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
        }
        emit StrategyCreation(proxy, beneficiary, handler, index);
    }

    /**
     * @dev Allows to retrieve the creation code used for the Proxy deployment.
     * @return The creation code for the Proxy.
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
