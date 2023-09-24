# Defi Strategy module

This contract delegates calls with arbitrary data to external DeFi strategy implementations, known as handlers. Each module is associated with a beneficiary, and these implementations are immutable. It's essential to conduct security checks before enabling and adding them to smart accounts.

## Module Factory

This contract operates as a singleton registry, purpose-built for deploying Strategy Modules while receiving both the strategy implementation and beneficiary as inputs.

## Execute Strategy

To execute arbitrary data on the handler implementation, the module must be enabled, and the strategy transaction must be signed by the SA owner.

Anyone can execute the strategy by providing the  [Execute Strategy](#execute-strategy) of a valid owner. To execute the strategy, you need to call the execStrategy method, which checks the signature and calls the SA to perform the strategy.

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

The implementations of registered and deployed modules must undergo a security check and receive approval to allow the beneficiary to collect fees.

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