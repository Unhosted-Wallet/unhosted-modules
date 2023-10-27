# <p align="center"><img src="../../logo.png" alt="Unhosted" height="100px"></p>

![npm](https://img.shields.io/npm/v/%40unhosted%2Fhandlers?style=for-the-badge)
![NPM](https://img.shields.io/npm/l/%40unhosted%2Fhandlers?style=for-the-badge)
![Static Badge](https://img.shields.io/badge/framework-hardhat-yellow?style=for-the-badge)
![Static Badge](https://img.shields.io/badge/Solidity-0.8.20-orange?style=for-the-badge)

# Defi Strategy Handlers

This library includes DeFi protocol handlers for deploying strategy modules through a module factory as the module implementation. It undergoes continuous updates, expanding its functionality by incorporating new protocols and automated DeFi strategies.

## Overview

### Installation

#### Hardhat, Truffle (npm)

```
$ npm install @unhosted/handlers  @openzeppelin/contracts
```

#### Foundry (git)

```
$ forge install Unhosted-Wallet/unhosted-modules OpenZeppelin/openzeppelin-contracts
```

Also add  
```
$ @unhosted/handlers/=lib/unhosted-modules/defi-strategies/contracts/handlers/  
$ @openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/
```
to `remappings.txt`

### Usage

<em>If you're new to smart contract development, head to [Developing Smart Contracts](https://docs.openzeppelin.com/learn/developing-smart-contracts) by openzeppelin to learn about creating a new project and compiling your contracts</em>.

After installation, you have the flexibility to utilize the handlers in the library by importing them. You can either build upon existing defi protocol handlers or create your own by inheriting from BaseHandler.sol. Once you've constructed and deployed your handler implementation, you can use the StrategyFactory to deploy your Module proxy and then enable it for your wallet:

```solidity
pragma solidity ^0.8.20;

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
>
> 1. The functions in handlers operate through `delegatecall` from the user's wallet. Therefore, it's crucial that handlers are developed in a way that avoids altering the wallet storage. State variables should be defined as either `constant` or `immutable` variables, which are stored directly in the deployed bytecode. This means they are not stored at a fixed offset in storage, unlike regular state variables.
> 2. Certain functionalities in strategies, such as flash loans, require changes to the fallback handlers on the user's wallet. This is why there is a fallback handler storage slot in BaseHandler.sol that can be modified based on the functionality, as seen in the example of the AaveV2 handler.

## Contribution

We welcome contributions to this repository. If you find any issues or have suggestions for improvements, please open an issue or submit a pull request.
