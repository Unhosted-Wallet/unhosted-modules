# <img src="logo.png" alt="Unhosted" height="100px">

![npm](https://img.shields.io/npm/v/%40unhosted%2Fhandlers?style=for-the-badge)
![NPM](https://img.shields.io/npm/l/%40unhosted%2Fhandlers?style=for-the-badge)
![GitHub all releases](https://img.shields.io/github/downloads/Unhosted-Wallet/unhosted-modules/total?style=for-the-badge)
![X (formerly Twitter) Follow](https://img.shields.io/twitter/follow/unh0sted?style=for-the-badge)

# Defi Strategy Module

![alt text](./strategy-diagram.png)

This contract delegates calls with arbitrary data to external DeFi strategy implementations, known as handlers. Each module is associated with a beneficiary, and these implementations are immutable. It's essential to conduct security checks before enabling and adding them to smart accounts.

## Overview

### Installation

```
$ npm install @unhosted/handlers
```

### Usage

_If you're new to smart contract development, head to [Developing Smart Contracts](https://docs.openzeppelin.com/learn/developing-smart-contracts) by openzeppelin to learn about creating a new project and compiling your contracts.

After installation, you have the flexibility to utilize the handlers in the library by importing them. You can either build upon existing defi protocol handlers or create your own by inheriting from BaseHandler.sol. Once you've constructed and deployed your handler implementation, you can use the StrategyFactory to deploy your Module proxy and then enable it for your wallet:

```solidity
pragma solidity ^0.8.17;

import { UniswapV3Handler } from "@unhosted/handlers/uniswapV3/UniswapV3H.sol";
import { AaveV2Handler } from "@unhosted/handlers/aaveV2/AaveV2H.sol";

contract MyStrategy is UniswapV3Handler, AaveV2Handler {
  constructor(
    address wethAddress,
    address aaveV2Provider,
    address fallbackHandler
  )
    UniswapV3Handler(wethAddress)
    AaveV2Handler(wethAddress, aaveV2Provider, fallbackHandler)
  {}

  function getContractName()
    public
    pure
    override(UniswapV3Handler, AaveV2Handler)
    returns (string memory)
  {
    return "MyStrategy";
  }
}
```

> [!IMPORTANT]
> 1.The functions in handlers operate through `delegatecall` from the user's wallet. Therefore, it's crucial that handlers are developed in a way that avoids altering the wallet storage. State variables should be defined as either `constant` or `immutable` variables, which are stored directly in the deployed bytecode. This means they are not stored at a fixed offset in storage, unlike regular state variables.
> 2. Certain functionalities in strategies, such as flash loans, require changes to the fallback handlers on the user's wallet. This is why there is a fallback handler storage slot in BaseHandler.sol that can be modified based on the functionality, as seen in the example of the AaveV2 handler.

## Module Factory

This contract operates as a singleton registry, purpose-built for deploying Strategy Modules while receiving both the strategy implementation and beneficiary as inputs.

## Execute Strategy

To execute arbitrary data on the handler implementation, the module must be enabled, and the strategy transaction must be signed by the Smart Account (SA) owner.

Anyone can execute the strategy by providing the [Execute Strategy](#execute-strategy) of a valid owner. To execute the strategy, you need to call the execStrategy method, which checks the signature and calls the SA to perform the strategy.

The strategy module signatures are EIP-712 based. And uses the following scheme:

- EIP712Domain

```json
{
  "EIP712Domain": [
    { "type": "uint256", "name": "chainId" },
    { "type": "address", "name": "verifyingContract" }
  ]
}
```

- ExecuteStrategy

```json
{
  "ExecuteStrategy": [
    { "type": "address", "name": "handler" },
    { "type": "uint256", "name": "value" },
    { "type": "bytes", "name": "data" },
    { "type": "uint256", "name": "nonce" }
  ]
}
```

## Approval Mechanism

However, the module strategy factory is permissionless, allowing anyone to deploy their strategy with their handler implementation and add it to their wallet. Nonetheless, unhosted comes with its own approval mechanism, ensuring that only modules that have undergone security checks are displayed. This precaution is in place to prevent the addition of malicious code to users' wallets.

### Considerations

Once the Strategy Module is enabled, it obtains complete ownership of the SA and the ability to delegate calls for executing any external arbitrary data. The approval mechanism plays a vital role in verifying these strategies.

## Running tests

```bash
yarn
yarn test
```

## Compiling contracts

```bash
yarn
yarn build
```
