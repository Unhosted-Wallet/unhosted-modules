import { expect } from "chai";
import { BigNumber, Contract } from "ethers";
import { decodeError } from "ethers-decode-error";
import hardhat, { ethers, deployments, waffle } from "hardhat";
import { buildEcdsaModuleAuthorizedStrategyTx } from "./utils/execution";
import { makeEcdsaModuleUserOp } from "./utils/userOp";
import {
  WRAPPED_NATIVE_TOKEN,
  AAVEPROTOCOL_V2_PROVIDER,
  DAI_TOKEN,
  AAVE_RATEMODE,
  AWRAPPED_NATIVE_V2_DEBT_VARIABLE,
} from "./utils/constants_eth";

import {
  getEntryPoint,
  getEcdsaOwnershipRegistryModule,
  getSmartAccountWithModule,
  getStrategyModule,
} from "./utils/setupHelper";
import { getTokenProvider } from "./utils/providers";

describe("AaveV2 flashloan", async () => {
  const chainId = hardhat.network.config.chainId;
  if (chainId === 1) {
    // This test supports to run on these chains.
  } else {
    return;
  }
  const [deployer, smartAccountOwner, alice] = waffle.provider.getWallets();
  let strategyModule: Contract;
  let aaveV2handler: Contract;
  let WrappedETH: Contract;
  let variableDebtWETH: Contract;
  let token: Contract;
  let provider: Contract;
  let lendingPool: Contract;
  let providerAddress: any;
  let wethProviderAddress: any;
  let fee: any;

  const _getFlashloanFee = (value: BigNumber) => {
    return value.mul(9).div(10000);
  };

  const setupTests = deployments.createFixture(async ({ deployments }) => {
    await deployments.fixture();

    const errAbi = [
      {
        inputs: [
          {
            internalType: "uint256",
            name: "",
            type: "uint256",
          },
        ],
        name: "RevertEstimation",
        type: "error",
      },
    ];

    provider = await ethers.getContractAt(
      "ILendingPoolAddressesProviderV2",
      AAVEPROTOCOL_V2_PROVIDER
    );

    lendingPool = await ethers.getContractAt(
      "ILendingPoolV2",
      await provider.getLendingPool()
    );

    variableDebtWETH = await ethers.getContractAt(
      "IVariableDebtToken",
      AWRAPPED_NATIVE_V2_DEBT_VARIABLE
    );

    WrappedETH = await (
      await ethers.getContractFactory("MockToken")
    ).attach(WRAPPED_NATIVE_TOKEN);

    token = await (
      await ethers.getContractFactory("MockToken")
    ).attach(DAI_TOKEN);

    providerAddress = await getTokenProvider(token.address);
    providerAddress = await ethers.getSigner(providerAddress);
    wethProviderAddress = await getTokenProvider(WRAPPED_NATIVE_TOKEN);
    wethProviderAddress = await ethers.getSigner(wethProviderAddress);

    const entryPoint = await getEntryPoint();
    const ecdsaModule = await getEcdsaOwnershipRegistryModule();
    const EcdsaOwnershipRegistryModule = await ethers.getContractFactory(
      "EcdsaOwnershipRegistryModule"
    );

    const ecdsaOwnershipSetupData =
      EcdsaOwnershipRegistryModule.interface.encodeFunctionData(
        "initForSmartAccount",
        [await smartAccountOwner.getAddress()]
      );
    const smartAccountDeploymentIndex = 0;
    const userSA = await getSmartAccountWithModule(
      ecdsaModule.address,
      ecdsaOwnershipSetupData,
      smartAccountDeploymentIndex
    );

    // send funds to userSA and mint tokens
    await deployer.sendTransaction({
      to: userSA.address,
      value: ethers.utils.parseEther("10"),
    });

    const callbackHandler = await (
      await ethers.getContractFactory("FlashloanCallbackHandler")
    ).deploy();

    aaveV2handler = await (
      await ethers.getContractFactory("AaveV2Handler")
    ).deploy(
      WRAPPED_NATIVE_TOKEN,
      AAVEPROTOCOL_V2_PROVIDER,
      callbackHandler.address
    );

    strategyModule = await getStrategyModule(
      alice.address,
      aaveV2handler.address,
      smartAccountDeploymentIndex
    );

    const userOp = await makeEcdsaModuleUserOp(
      "enableModule",
      [strategyModule.address],
      userSA.address,
      smartAccountOwner,
      entryPoint,
      ecdsaModule.address
    );

    await entryPoint.handleOps([userOp], alice.address);

    return {
      ecdsaModule: ecdsaModule,
      userSA: userSA,
      errAbi: errAbi,
    };
  });

  describe("ٔNormal", function () {
    it("single asset with no debt", async function () {
      const { userSA, ecdsaModule, errAbi } = await setupTests();
      const value = ethers.utils.parseEther("1");
      const handler = aaveV2handler.address;

      const data = (
        await ethers.getContractFactory("AaveV2Handler")
      ).interface.encodeFunctionData(
        "flashLoan(address[],uint256[],uint256[],bytes)",
        [[token.address], [value], [AAVE_RATEMODE.NODEBT], "0x"]
      );

      // const loanFee = value.mul(9).div(10000);

      await token.connect(providerAddress).transfer(userSA.address, value);

      const { transaction, signature } =
        await buildEcdsaModuleAuthorizedStrategyTx(
          handler,
          data,
          userSA,
          smartAccountOwner,
          ecdsaModule.address,
          strategyModule,
          0
        );

      const beforeExecBalance = await token.balanceOf(userSA.address);

      try {
        await strategyModule.requiredTxFee(userSA.address, transaction);
      } catch (error) {
        fee = decodeError(error, errAbi).args;
        fee = fee[0];
      }

      await strategyModule.execStrategy(userSA.address, transaction, signature);

      const afterExecBalance = await token.balanceOf(userSA.address);

      expect(beforeExecBalance.sub(afterExecBalance)).to.be.eq(
        _getFlashloanFee(value)
      );

      expect(await token.balanceOf(strategyModule.address)).to.be.eq(0);
    });

    it("single asset with variable rate by borrowing from itself", async function () {
      const { userSA, ecdsaModule, errAbi } = await setupTests();

      const depositAmount = ethers.utils.parseEther("10000");

      await WrappedETH.connect(wethProviderAddress).approve(
        lendingPool.address,
        depositAmount
      );

      await lendingPool
        .connect(wethProviderAddress)
        .deposit(WrappedETH.address, depositAmount, userSA.address, 0);

      const value = ethers.utils.parseEther("1");
      const handler = aaveV2handler.address;

      const data = (
        await ethers.getContractFactory("AaveV2Handler")
      ).interface.encodeFunctionData(
        "flashLoan(address[],uint256[],uint256[],bytes)",
        [[WrappedETH.address], [value], [AAVE_RATEMODE.VARIABLE], "0x"]
      );

      const { transaction, signature } =
        await buildEcdsaModuleAuthorizedStrategyTx(
          handler,
          data,
          userSA,
          smartAccountOwner,
          ecdsaModule.address,
          strategyModule,
          0
        );

      const beforeExecBalance = await WrappedETH.balanceOf(userSA.address);

      try {
        await strategyModule.requiredTxFee(userSA.address, transaction);
      } catch (error) {
        fee = decodeError(error, errAbi).args;
        fee = fee[0];
      }

      await strategyModule.execStrategy(userSA.address, transaction, signature);

      const afterExecBalance = await WrappedETH.balanceOf(userSA.address);

      expect(afterExecBalance.sub(beforeExecBalance)).to.be.within(
        value.sub(1),
        value.add(1)
      );

      expect(await variableDebtWETH.balanceOf(userSA.address)).to.be.within(
        value.sub(1),
        value.add(1)
      );

      expect(await WrappedETH.balanceOf(strategyModule.address)).to.be.eq(0);
    });

    it("multiple assets with no debt", async function () {
      const { userSA, ecdsaModule, errAbi } = await setupTests();

      const value = ethers.utils.parseEther("1");
      const handler = aaveV2handler.address;

      const data = (
        await ethers.getContractFactory("AaveV2Handler")
      ).interface.encodeFunctionData(
        "flashLoan(address[],uint256[],uint256[],bytes)",
        [
          [token.address, WrappedETH.address],
          [value, value],
          [AAVE_RATEMODE.NODEBT, AAVE_RATEMODE.NODEBT],
          "0x",
        ]
      );

      await token.connect(providerAddress).transfer(userSA.address, value);
      await WrappedETH.connect(wethProviderAddress).transfer(
        userSA.address,
        value
      );

      const { transaction, signature } =
        await buildEcdsaModuleAuthorizedStrategyTx(
          handler,
          data,
          userSA,
          smartAccountOwner,
          ecdsaModule.address,
          strategyModule,
          0
        );

      const beforeExecBalance = await token.balanceOf(userSA.address);
      const beforeExecBalanceWeth = await WrappedETH.balanceOf(userSA.address);

      try {
        await strategyModule.requiredTxFee(userSA.address, transaction);
      } catch (error) {
        fee = decodeError(error, errAbi).args;
        fee = fee[0];
      }

      await strategyModule.execStrategy(userSA.address, transaction, signature);

      const afterExecBalance = await token.balanceOf(userSA.address);
      const afterExecBalanceWeth = await WrappedETH.balanceOf(userSA.address);

      expect(beforeExecBalance.sub(afterExecBalance)).to.be.eq(
        _getFlashloanFee(value)
      );
      expect(beforeExecBalanceWeth.sub(afterExecBalanceWeth)).to.be.eq(
        _getFlashloanFee(value)
      );

      expect(await token.balanceOf(strategyModule.address)).to.be.eq(0);
    });
  });
});
