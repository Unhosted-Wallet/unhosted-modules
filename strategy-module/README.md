# <p align="center"><img src="logo.png" alt="Unhosted" height="100px"></p>

![Static Badge](https://img.shields.io/badge/framework-foundry-yellow?style=for-the-badge)
![Static Badge](https://img.shields.io/badge/Solidity-0.8.20-orange?style=for-the-badge)
![X (formerly Twitter) Follow](https://img.shields.io/twitter/follow/unh0sted?style=for-the-badge)

# Strategy Module

Strategy Module, empowering smart accounts to utilize `call` and `delegatecall` for executing arbitrary logic. This opens the door to lots of functionalities, from automated wallets to streamlined one-click DeFi strategies. Developers can seamlessly add strategy contracts through the `updateStrategy` function, this provides an open platform for anyone to contribute their strategies and earn a percentage as both a developer fee and wallet provider fee.

## Execute Strategy

There are two execution functionalities available: `executeStrategy` and `executeTriggeredStrategy`. In the triggered strategy, the owner can define a specific on-chain criterion that must be met before actual execution. This require a trigger contract to be called, which can be provided by either the user or the wallet provider. The assigned developer of the strategy will earn a percentage of the execution gas usage, determined by the complexity of the on-chain execution.

To execute arbitrary data, the module strategy module must be enabled, and the strategy transaction must be signed by the Smart Account (SA) owner.

The strategy module signatures are EIP-712 based. And uses the following scheme:

- EIP712Domain

```json
{
  "EIP712Domain": [
    { "type": "string", "name": "name" },
    { "type": "string", "name": "version" },
    { "type": "uint256", "name": "chainId" },
    { "type": "address", "name": "verifyingContract" }
  ]
}
```

- ExecuteStrategy
  - `operation` is the type of call
  - `strategy` is the strategy contract for execution
  - `value` is the value to send with execution
  - `strategyData` is the arbitrary data to execute
  - `nonce` to validate the transaction for smartAccount

```json
{
  "ExecuteStrategy": [
    { "type": "Operation", "name": "operation" },
    { "type": "address", "name": "strategy" },
    { "type": "uint256", "name": "value" },
    { "type": "bytes", "name": "strategyData" },
    { "type": "uint256", "name": "nonce" }
  ]
}
```

- ExecuteTriggeredStrategy
  - `operation` is the type of call
  - `strategy` is the strategy contract for execution
  - `value` is the value to send with execution
  - `strategyData` is the arbitrary data to execute
  - `trigger` is the trigger address to check before execution
  - `triggerData` is the arbitrary data to check before execution
  - `nonce` to validate the transaction for smartAccount

```json
{
  "ExecuteTriggeredStrategy": [
    { "type": "Operation", "name": "operation" },
    { "type": "address", "name": "strategy" },
    { "type": "uint256", "name": "value" },
    { "type": "bytes", "name": "strategyData" },
    { "type": "address", "name": "trigger" },
    { "type": "bytes", "name": "triggerData" },
    { "type": "uint256", "name": "nonce" }
  ]
}
```

## Approval Mechanism

However, the module strategy is permissionless, enabling anyone to add their strategy contract and adding them to their wallet, Unhosted incorporates its approval mechanism. This ensures that only modules with verified security measures are provided to our users. Moving forward, we plan to adopt [ERC7484](https://eips.ethereum.org/EIPS/eip-7484) (Registries and Adapters for Smart Accounts) to validate the security of our on-chain strategies. This precaution is in place to prevent the addition of malicious code to users' wallets.

### Considerations

After enabling the Strategy Module, it has ability to invoke both `call` and `delegatecall` to execute any external arbitrary data signed by the owner of the smart account.

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
