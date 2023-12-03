# <p align="center"><img src="logo.png" alt="Unhosted" height="100px"></p>

![npm](https://img.shields.io/npm/v/%40unhosted%2Fhandlers?style=for-the-badge)
![NPM](https://img.shields.io/npm/l/%40unhosted%2Fhandlers?style=for-the-badge)
![Static Badge](https://img.shields.io/badge/framework-hardhat-yellow?style=for-the-badge)
![Static Badge](https://img.shields.io/badge/Solidity-0.8.19-orange?style=for-the-badge)
![X (formerly Twitter) Follow](https://img.shields.io/twitter/follow/unh0sted?style=for-the-badge)

# Recurring Execution Module

The recurring execution module empowers the owner of the SA with the capability to schedule a arbitrary data call to a specified receiver address from the wallet. This scheduling can be set on a Daily, Weekly, or Monthly basis within a defined time frame. The execution of any added transaction is open to anyone if the module is enabled on the wallet.

In terms of datetime considerations, the BokkyPooBah's DateTime Library is utilized for validating transactions. The contract has been duplicated from its original repository and is stored in the libs folder. Notably, the contract has the capability to handle leap years, guaranteeing that transfers will consistently execute as anticipated.

> [!IMPORTANT]
>
> Keep in mind that if any added transaction isn't executed within the specified time frame, it will be lost and won't be carried forward for the next execution.

## Requirement

- The transfer window is restricted to whole hours (e.g., 1 am, 11 pm, etc.) and is confined to a single day. Therefore, for monthly scheduling, an execution starting on one day of the month and ending on another is not feasible.
- To ensure monthly execution, the transaction day must be prior to the 29th of each month.
- The execution day must not be set to 0.
- For weekly scheduling, the execution day falls within the range of 1 to 7, starting with Monday as 1.
- In daily scheduling, the execution can be set to any day, and it is not a determining factor.
- The initiation hour of execution should be earlier than the completion hour of execution.
- The starting and ending hours of execution are in a 24-hour format and should fall within the range of 1 to 22.

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
