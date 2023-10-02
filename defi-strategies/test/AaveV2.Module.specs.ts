import { expect } from "chai";
import { Contract } from "ethers";
import { decodeError } from "ethers-decode-error";
import hardhat, { ethers, deployments, waffle } from "hardhat";
import { buildEcdsaModuleAuthorizedStrategyTx } from "./utils/execution";
import { makeEcdsaModuleUserOp } from "./utils/userOp";
import {
  WRAPPED_NATIVE_TOKEN,
  AAVEPROTOCOL_V2_PROVIDER,
  AWRAPPED_NATIVE_V2_TOKEN,
  DAI_TOKEN,
  ADAI_V2,
} from "./utils/constants_eth";
import { MAX_UINT256 } from "./utils/constants";

import {
  getEntryPoint,
  getEcdsaOwnershipRegistryModule,
  getSmartAccountWithModule,
  getStrategyModule,
} from "./utils/setupHelper";
import { getTokenProvider } from "./utils/providers";

describe("AaveV2 deposit & withdraw", async () => {
  const chainId = hardhat.network.config.chainId;
  if (chainId === 1 || chainId === 137) {
    // This test supports to run on these chains.
  } else {
    return;
  }
  const [deployer, smartAccountOwner, alice] = waffle.provider.getWallets();
  let strategyModule: Contract;
  let aaveV2handler: Contract;
  let WrappedETH: Contract;
  let AWrappedETH: Contract;
  let token: Contract;
  let aToken: Contract;
  let provider: Contract;
  let lendingPool: Contract;
  let providerAddress: any;
  let wethProviderAddress: any;
  let fee: any;

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

    WrappedETH = await (
      await ethers.getContractFactory("MockToken")
    ).attach(WRAPPED_NATIVE_TOKEN);

    AWrappedETH = await (
      await ethers.getContractFactory("MockToken")
    ).attach(AWRAPPED_NATIVE_V2_TOKEN);

    token = await (
      await ethers.getContractFactory("MockToken")
    ).attach(DAI_TOKEN);

    aToken = await (
      await ethers.getContractFactory("MockToken")
    ).attach(ADAI_V2);

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
    ).deploy(WRAPPED_NATIVE_TOKEN, AAVEPROTOCOL_V2_PROVIDER, callbackHandler.address);

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

  it("Module is enabled", async () => {
    const { userSA } = await setupTests();
    expect(await userSA.isModuleEnabled(strategyModule.address)).to.equal(true);
  });

  describe("Deposit", function () {
    it("deposit ETH normal", async function () {
      const { userSA, ecdsaModule, errAbi } = await setupTests();
      const value = ethers.utils.parseEther("1");
      const handler = aaveV2handler.address;
      const data = (
        await ethers.getContractFactory("AaveV2Handler")
      ).interface.encodeFunctionData("depositETH(uint256)", [value]);

      const { transaction, signature } =
        await buildEcdsaModuleAuthorizedStrategyTx(
          handler,
          data,
          userSA,
          smartAccountOwner,
          ecdsaModule.address,
          strategyModule,
          value.toString()
        );

      const beforeExecBalance = await waffle.provider.getBalance(
        userSA.address
      );

      try {
        await strategyModule.requiredTxFee(userSA.address, transaction);
      } catch (error) {
        fee = decodeError(error, errAbi).args;
        fee = fee[0];
      }

      await strategyModule.execStrategy(
        userSA.address,
        transaction,
        signature,
        { value: fee }
      );

      const afterExecBalance = await waffle.provider.getBalance(userSA.address);

      expect(beforeExecBalance.sub(afterExecBalance)).to.be.eq(value);

      expect(await AWrappedETH.balanceOf(userSA.address)).to.be.eq(value);

      expect(await AWrappedETH.balanceOf(strategyModule.address)).to.be.eq(0);

      expect(await waffle.provider.getBalance(strategyModule.address)).to.be.eq(
        0
      );
    });

    it("deposit ETH max amount", async function () {
      const { userSA, ecdsaModule, errAbi } = await setupTests();
      const value = ethers.utils.parseEther("1");
      const handler = aaveV2handler.address;
      const data = (
        await ethers.getContractFactory("AaveV2Handler")
      ).interface.encodeFunctionData("depositETH(uint256)", [MAX_UINT256]);

      const { transaction, signature } =
        await buildEcdsaModuleAuthorizedStrategyTx(
          handler,
          data,
          userSA,
          smartAccountOwner,
          ecdsaModule.address,
          strategyModule,
          value.toString()
        );

      try {
        await strategyModule.requiredTxFee(userSA.address, transaction);
      } catch (error) {
        fee = decodeError(error, errAbi).args;
        fee = fee[0];
      }

      const beforeExecBalance = await waffle.provider.getBalance(
        userSA.address
      );
      await strategyModule.execStrategy(
        userSA.address,
        transaction,
        signature,
        { value: fee }
      );

      const afterExecBalance = await waffle.provider.getBalance(userSA.address);

      expect(beforeExecBalance.sub(afterExecBalance)).to.be.eq(
        beforeExecBalance
      );

      expect(await AWrappedETH.balanceOf(userSA.address)).to.be.eq(
        beforeExecBalance
      );

      expect(await AWrappedETH.balanceOf(strategyModule.address)).to.be.eq(0);

      expect(await waffle.provider.getBalance(strategyModule.address)).to.be.eq(
        0
      );
    });

    it("deposit token normal", async function () {
      const { userSA, ecdsaModule, errAbi } = await setupTests();
      const value = ethers.utils.parseEther("1");
      const handler = aaveV2handler.address;

      const data = (
        await ethers.getContractFactory("AaveV2Handler")
      ).interface.encodeFunctionData("deposit(address,uint256)", [
        token.address,
        value,
      ]);

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

      try {
        await strategyModule.requiredTxFee(userSA.address, transaction);
      } catch (error) {
        fee = decodeError(error, errAbi).args;
        fee = fee[0];
      }

      const beforeExecBalance = await token.balanceOf(userSA.address);

      await strategyModule.execStrategy(
        userSA.address,
        transaction,
        signature,
        { value: fee }
      );

      const afterExecBalance = await token.balanceOf(userSA.address);

      expect(beforeExecBalance.sub(afterExecBalance)).to.be.eq(value);

      expect(await aToken.balanceOf(userSA.address)).to.be.eq(value);

      expect(await aToken.balanceOf(strategyModule.address)).to.be.eq(0);

      expect(await token.balanceOf(strategyModule.address)).to.be.eq(0);
    });

    it("deposit token max amount", async function () {
      const { userSA, ecdsaModule, errAbi } = await setupTests();
      const value = ethers.utils.parseEther("10");
      const handler = aaveV2handler.address;

      const data = (
        await ethers.getContractFactory("AaveV2Handler")
      ).interface.encodeFunctionData("deposit(address,uint256)", [
        token.address,
        MAX_UINT256,
      ]);

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

      try {
        await strategyModule.requiredTxFee(userSA.address, transaction);
      } catch (error) {
        fee = decodeError(error, errAbi).args;
        fee = fee[0];
      }

      const beforeExecBalance = await token.balanceOf(userSA.address);

      await strategyModule.execStrategy(
        userSA.address,
        transaction,
        signature,
        { value: fee }
      );

      const afterExecBalance = await token.balanceOf(userSA.address);

      expect(beforeExecBalance.sub(afterExecBalance)).to.be.eq(value);

      expect(await aToken.balanceOf(userSA.address)).to.be.eq(value);

      expect(await aToken.balanceOf(strategyModule.address)).to.be.eq(0);

      expect(await token.balanceOf(strategyModule.address)).to.be.eq(0);
    });
  });

  describe("Withdraw", function () {
    let depositAmount = ethers.utils.parseEther("5");

    it("withdraw ETH partial", async function () {
      const { userSA, ecdsaModule, errAbi } = await setupTests();
      await WrappedETH.connect(wethProviderAddress).approve(
        lendingPool.address,
        depositAmount
      );
      await lendingPool
        .connect(wethProviderAddress)
        .deposit(WrappedETH.address, depositAmount, userSA.address, 0);

      depositAmount = await AWrappedETH.balanceOf(userSA.address);

      const value = depositAmount.div(2);
      const diff = ethers.utils.parseEther("0.0001");
      const handler = aaveV2handler.address;
      const data = (
        await ethers.getContractFactory("AaveV2Handler")
      ).interface.encodeFunctionData("withdrawETH(uint256)", [value]);

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

      try {
        await strategyModule.requiredTxFee(userSA.address, transaction);
      } catch (error) {
        fee = decodeError(error, errAbi).args;
        fee = fee[0];
      }

      const beforeExecBalance = await AWrappedETH.balanceOf(userSA.address);

      const beforeExecETH = await waffle.provider.getBalance(userSA.address);

      await strategyModule.execStrategy(
        userSA.address,
        transaction,
        signature,
        { value: fee }
      );

      const afterExecBalance = await AWrappedETH.balanceOf(userSA.address);

      const afterExecETH = await waffle.provider.getBalance(userSA.address);

      expect(beforeExecBalance.sub(afterExecBalance)).to.be.lt(value);

      expect(beforeExecBalance.sub(afterExecBalance)).to.be.gt(value.sub(diff));

      expect(afterExecETH.sub(beforeExecETH)).to.be.eq(value);

      expect(await waffle.provider.getBalance(strategyModule.address)).to.be.eq(
        0
      );

      expect(await AWrappedETH.balanceOf(strategyModule.address)).to.be.eq(0);
    });

    it("withdraw ETH max amount", async function () {
      const { userSA, ecdsaModule, errAbi } = await setupTests();
      await WrappedETH.connect(wethProviderAddress).approve(
        lendingPool.address,
        depositAmount
      );
      await lendingPool
        .connect(wethProviderAddress)
        .deposit(WrappedETH.address, depositAmount, userSA.address, 0);

      depositAmount = await AWrappedETH.balanceOf(userSA.address);

      const diff = ethers.utils.parseEther("0.0001");
      const handler = aaveV2handler.address;
      const data = (
        await ethers.getContractFactory("AaveV2Handler")
      ).interface.encodeFunctionData("withdrawETH(uint256)", [MAX_UINT256]);

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

      const beforeExecBalance = await AWrappedETH.balanceOf(userSA.address);

      const beforeExecETH = await waffle.provider.getBalance(userSA.address);

      try {
        await strategyModule.requiredTxFee(userSA.address, transaction);
      } catch (error) {
        fee = decodeError(error, errAbi).args;
        fee = fee[0];
      }

      await strategyModule.execStrategy(
        userSA.address,
        transaction,
        signature,
        { value: fee }
      );

      const afterExecBalance = await AWrappedETH.balanceOf(userSA.address);

      const afterExecETH = await waffle.provider.getBalance(userSA.address);

      expect(beforeExecBalance.sub(afterExecBalance)).to.be.eq(depositAmount);

      expect(afterExecETH.sub(beforeExecETH)).to.be.gt(depositAmount);

      expect(afterExecETH.sub(beforeExecETH)).to.be.lt(depositAmount.add(diff));

      expect(await waffle.provider.getBalance(strategyModule.address)).to.be.eq(
        0
      );

      expect(await AWrappedETH.balanceOf(strategyModule.address)).to.be.eq(0);
    });

    it("withdraw token partial", async function () {
      const { userSA, ecdsaModule, errAbi } = await setupTests();
      await token
        .connect(providerAddress)
        .approve(lendingPool.address, depositAmount);
      await lendingPool
        .connect(providerAddress)
        .deposit(token.address, depositAmount, userSA.address, 0);

      depositAmount = await aToken.balanceOf(userSA.address);

      const value = depositAmount.div(2);
      const diff = ethers.utils.parseEther("0.0001");
      const handler = aaveV2handler.address;
      const data = (
        await ethers.getContractFactory("AaveV2Handler")
      ).interface.encodeFunctionData("withdraw(address,uint256)", [
        token.address,
        value,
      ]);

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

      try {
        await strategyModule.requiredTxFee(userSA.address, transaction);
      } catch (error) {
        fee = decodeError(error, errAbi).args;
        fee = fee[0];
      }

      const beforeExecBalance = await aToken.balanceOf(userSA.address);
      const beforeExecToken = await token.balanceOf(userSA.address);

      await strategyModule.execStrategy(
        userSA.address,
        transaction,
        signature,
        { value: fee }
      );

      const afterExecBalance = await aToken.balanceOf(userSA.address);

      const afterExecToken = await token.balanceOf(userSA.address);

      expect(beforeExecBalance.sub(afterExecBalance)).to.be.lt(value);

      expect(beforeExecBalance.sub(afterExecBalance)).to.be.gt(value.sub(diff));

      expect(afterExecToken.sub(beforeExecToken)).to.be.eq(value);

      expect(await token.balanceOf(strategyModule.address)).to.be.eq(0);

      expect(await aToken.balanceOf(strategyModule.address)).to.be.eq(0);
    });

    it("withdraw token max amount", async function () {
      const { userSA, ecdsaModule, errAbi } = await setupTests();
      await token
        .connect(providerAddress)
        .approve(lendingPool.address, depositAmount);

      await lendingPool
        .connect(providerAddress)
        .deposit(token.address, depositAmount, userSA.address, 0);

      depositAmount = await aToken.balanceOf(userSA.address);

      const diff = ethers.utils.parseEther("0.0001");
      const handler = aaveV2handler.address;
      const data = (
        await ethers.getContractFactory("AaveV2Handler")
      ).interface.encodeFunctionData("withdraw(address,uint256)", [
        token.address,
        MAX_UINT256,
      ]);

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

      const beforeExecBalance = await aToken.balanceOf(userSA.address);

      const beforeExecToken = await token.balanceOf(userSA.address);

      try {
        await strategyModule.requiredTxFee(userSA.address, transaction);
      } catch (error) {
        fee = decodeError(error, errAbi).args;
        fee = fee[0];
      }

      await strategyModule.execStrategy(
        userSA.address,
        transaction,
        signature,
        { value: fee }
      );

      const afterExecBalance = await aToken.balanceOf(userSA.address);

      const afterExecToken = await token.balanceOf(userSA.address);

      expect(beforeExecBalance.sub(afterExecBalance)).to.be.eq(depositAmount);

      expect(afterExecToken.sub(beforeExecToken)).to.be.gt(depositAmount);

      expect(afterExecToken.sub(beforeExecToken)).to.be.lt(
        depositAmount.add(diff)
      );

      expect(await token.balanceOf(strategyModule.address)).to.be.eq(0);

      expect(await aToken.balanceOf(strategyModule.address)).to.be.eq(0);
    });
  });
});
