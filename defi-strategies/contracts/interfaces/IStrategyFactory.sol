// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

/**
 * @title Strategy Module Factory - factory responsible for deploying Strategy Modules using CREATE2
 * @dev It deploys Strategy Modules as proxies pointing to `basicImplementation` that is immutable.
 * This allows keeping the same address for the same Strategy Module owner on various chains via CREATE2
 * @author M. Zakeri Rad - <@zakrad>
 */
interface IStrategyModuleFactory {
    event StrategyCreation(
        address indexed module,
        address indexed beneficiary,
        address indexed handler,
        uint256 index
    );

    error InvalidAddress();
    error Create2Failed();

    /**
     * @notice Change the address of implementation
     * @dev needs admjin access
     * @param newImplementation, address of new strategy module implementation to deploy
     */
    function updateImplementation(address newImplementation) external;

    /**
     * @notice Deploys module using create2 and points it to basicImplementation
     * @param beneficiary, address of beneficiary of this strategy module that receives fee factor of gas usage of each execStrategy call
     * @param handler, address of implementation of the strategy module
     * @param index extra salt that allows to deploy more module if needed for same beneficiary (default 0)
     * @return proxy address of deployed strategy module
     */
    function deployStrategyModule(
        address beneficiary,
        address handler,
        uint256 index
    ) external returns (address proxy);

    /**
     * @notice Allows to find out strategy module address prior to deployment
     * @param beneficiary, address of beneficiary of this strategy module that receives fee factor of gas usage of each execStrategy call
     * @param handler, address of implementation of the strategy module
     * @param index extra salt that allows to deploy more module if needed for same beneficiary (default 0)
     * @return _module address of module pre deployment
     */
    function getAddressForStrategyModule(
        address beneficiary,
        address handler,
        uint256 index
    ) external view returns (address _module);

    /**
     * @dev Allows to retrieve the creation code used for the Proxy deployment.
     * @return The creation code for the Proxy.
     */
    function moduleCreationCode() external pure returns (bytes memory);
}
