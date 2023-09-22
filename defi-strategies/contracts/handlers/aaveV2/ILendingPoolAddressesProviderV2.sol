// SPDX-License-Identifier: agpl-3.0

pragma solidity 0.8.17;

/**
 * @title LendingPoolAddressesProvider contract
 * @dev Main registry of addresses part of or connected to the protocol, including permissioned roles
 * - Acting also as factory of proxies and admin of those, so with right to change its implementations
 * - Owned by the Aave Governance
 * @author Aave
 *
 */
interface ILendingPoolAddressesProviderV2 {
    event MarketIdSet(string newMarketId);
    event LendingPoolUpdated(address indexed newAddress);
    event ConfigurationAdminUpdated(address indexed newAddress);
    event EmergencyAdminUpdated(address indexed newAddress);
    event LendingPoolConfiguratorUpdated(address indexed newAddress);
    event LendingPoolCollateralManagerUpdated(address indexed newAddress);
    event PriceOracleUpdated(address indexed newAddress);
    event LendingRateOracleUpdated(address indexed newAddress);
    event ProxyCreated(bytes32 id, address indexed newAddress);
    event AddressSet(bytes32 id, address indexed newAddress, bool hasProxy);

    function setMarketId(string calldata marketId) external;

    function setAddress(bytes32 id, address newAddress) external;

    function setAddressAsProxy(bytes32 id, address impl) external;

    function setLendingPoolImpl(address pool) external;

    function setLendingPoolConfiguratorImpl(address configurator) external;

    function setPoolAdmin(address admin) external;

    function setPriceOracle(address priceOracle) external;

    function setLendingRateOracle(address lendingRateOracle) external;

    function setLendingPoolCollateralManager(address manager) external;

    function setEmergencyAdmin(address admin) external;

    function getMarketId() external view returns (string memory);

    function getAddress(bytes32 id) external view returns (address);

    function getLendingPool() external view returns (address);

    function getLendingPoolConfigurator() external view returns (address);

    function getLendingPoolCollateralManager() external view returns (address);

    function getPoolAdmin() external view returns (address);

    function getEmergencyAdmin() external view returns (address);

    function getPriceOracle() external view returns (address);

    function getLendingRateOracle() external view returns (address);
}
