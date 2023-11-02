import { expect } from "chai";
import { Contract } from "ethers";
import { decodeError } from "ethers-decode-error";
import hardhat, { ethers, deployments, waffle } from "hardhat";
import {
  buildEcdsaModuleAuthorizedStrategyTx,
  callExecStrategy,
} from "./utils/execution";
import { makeEcdsaModuleUserOp } from "./utils/userOp";
import {
  USDT_TOKEN,
  AUSDT_V2_DEBT_STABLE,
  AUSDT_V2_DEBT_VARIABLE,
  COMP_TOKEN,
  AWRAPPED_NATIVE_V2_DEBT_STABLE,
  AWRAPPED_NATIVE_V2_DEBT_VARIABLE,
  AAVE_RATEMODE,
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

describe("AaveV2 Borrow", async () => {
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
  let debtWrappedETH: Contract;
  let AWrappedETH: Contract;
  let token: Contract;
  let debtToken: Contract;
  let borrowToken: Contract;
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

  it("Module is enabled", async () => {
    const { userSA } = await setupTests();
    expect(await userSA.isModuleEnabled(strategyModule.address)).to.equal(true);
  });

  describe("Borrow with Stable Rate", function () {
    const depositAmount = ethers.utils.parseEther("10000");
    const rateMode = AAVE_RATEMODE.STABLE;

    before(async function () {
      debtWrappedETH = await (
        await ethers.getContractFactory("MockToken")
      ).attach(AWRAPPED_NATIVE_V2_DEBT_STABLE);

      debtToken = await (
        await ethers.getContractFactory("MockToken")
      ).attach(AUSDT_V2_DEBT_STABLE);

      borrowToken = await (
        await ethers.getContractFactory("MockToken")
      ).attach(USDT_TOKEN);
    });

    it("Borrow token", async function () {
      const { userSA, ecdsaModule, errAbi } = await setupTests();

      await token
        .connect(providerAddress)
        .approve(lendingPool.address, depositAmount);

      await lendingPool
        .connect(providerAddress)
        .deposit(token.address, depositAmount, userSA.address, 0);

      const value = ethers.utils.parseUnits("100", 6);
      const handler = aaveV2handler.address;
      const data = (
        await ethers.getContractFactory("AaveV2Handler")
      ).interface.encodeFunctionData("borrow(address,uint256,uint256)", [
        borrowToken.address,
        value,
        rateMode,
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

      const beforeExecBalance = await borrowToken.balanceOf(userSA.address);

      const debtTokenUserBefore = await debtToken.balanceOf(userSA.address);

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

      const afterExecBalance = await borrowToken.balanceOf(userSA.address);
      const debtTokenUserAfter = await debtToken.balanceOf(userSA.address);

      //  borrowAmount - 1 <= (debtTokenUserAfter-debtTokenUserBefore) < borrowAmount + interestMax
      const interestMax = value.mul(1).div(10000);

      expect(debtTokenUserAfter.sub(debtTokenUserBefore)).to.be.gte(
        value.sub(1)
      );
      expect(debtTokenUserAfter.sub(debtTokenUserBefore)).to.be.lt(
        value.add(interestMax)
      );

      expect(afterExecBalance.sub(beforeExecBalance)).to.be.eq(value);

      expect(await waffle.provider.getBalance(strategyModule.address)).to.be.eq(
        0
      );

      expect(await borrowToken.balanceOf(strategyModule.address)).to.be.eq(0);

      expect(await debtToken.balanceOf(strategyModule.address)).to.be.eq(0);
    });

    it("Borrow weth", async function () {
      const { userSA, ecdsaModule, errAbi } = await setupTests();

      await token
        .connect(providerAddress)
        .approve(lendingPool.address, depositAmount);

      await lendingPool
        .connect(providerAddress)
        .deposit(token.address, depositAmount, userSA.address, 0);

      const value = ethers.utils.parseEther("1");
      const handler = aaveV2handler.address;
      const data = (
        await ethers.getContractFactory("AaveV2Handler")
      ).interface.encodeFunctionData("borrow(address,uint256,uint256)", [
        WrappedETH.address,
        value,
        rateMode,
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

      const beforeExecBalance = await WrappedETH.balanceOf(userSA.address);

      const debtTokenUserBefore = await debtWrappedETH.balanceOf(
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

      const afterExecBalance = await WrappedETH.balanceOf(userSA.address);
      const debtTokenUserAfter = await debtWrappedETH.balanceOf(userSA.address);

      //  borrowAmount - 1 <= (debtTokenUserAfter-debtTokenUserBefore) < borrowAmount + interestMax
      const interestMax = value.mul(1).div(10000);

      expect(debtTokenUserAfter.sub(debtTokenUserBefore)).to.be.gte(
        value.sub(1)
      );
      expect(debtTokenUserAfter.sub(debtTokenUserBefore)).to.be.lt(
        value.add(interestMax)
      );

      expect(afterExecBalance.sub(beforeExecBalance)).to.be.eq(value);

      expect(await waffle.provider.getBalance(strategyModule.address)).to.be.eq(
        0
      );

      expect(await borrowToken.balanceOf(strategyModule.address)).to.be.eq(0);

      expect(await debtToken.balanceOf(strategyModule.address)).to.be.eq(0);
    });

    it("Borrow eth", async function () {
      const { userSA, ecdsaModule, errAbi } = await setupTests();

      await token
        .connect(providerAddress)
        .approve(lendingPool.address, depositAmount);

      await lendingPool
        .connect(providerAddress)
        .deposit(token.address, depositAmount, userSA.address, 0);

      const value = ethers.utils.parseEther("1");
      const handler = aaveV2handler.address;
      const data = (
        await ethers.getContractFactory("AaveV2Handler")
      ).interface.encodeFunctionData("borrowETH(uint256,uint256)", [
        value,
        rateMode,
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

      const beforeExecBalance = await waffle.provider.getBalance(
        userSA.address
      );

      const debtTokenUserBefore = await debtWrappedETH.balanceOf(
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
      const debtTokenUserAfter = await debtWrappedETH.balanceOf(userSA.address);

      //  borrowAmount - 1 <= (debtTokenUserAfter-debtTokenUserBefore) < borrowAmount + interestMax
      const interestMax = value.mul(1).div(10000);

      expect(debtTokenUserAfter.sub(debtTokenUserBefore)).to.be.gte(
        value.sub(1)
      );
      expect(debtTokenUserAfter.sub(debtTokenUserBefore)).to.be.lt(
        value.add(interestMax)
      );

      expect(afterExecBalance.sub(beforeExecBalance)).to.be.eq(value);

      expect(await waffle.provider.getBalance(strategyModule.address)).to.be.eq(
        0
      );

      expect(await borrowToken.balanceOf(strategyModule.address)).to.be.eq(0);

      expect(await debtToken.balanceOf(strategyModule.address)).to.be.eq(0);
    });
  });

  describe("Borrow with Variable Rate", function () {
    const depositAmount = ethers.utils.parseEther("10000");
    const rateMode = AAVE_RATEMODE.VARIABLE;

    before(async function () {
      debtWrappedETH = await (
        await ethers.getContractFactory("MockToken")
      ).attach(AWRAPPED_NATIVE_V2_DEBT_VARIABLE);

      debtToken = await (
        await ethers.getContractFactory("MockToken")
      ).attach(AUSDT_V2_DEBT_VARIABLE);

      borrowToken = await (
        await ethers.getContractFactory("MockToken")
      ).attach(USDT_TOKEN);
    });

    it("Borrow token", async function () {
      const { userSA, ecdsaModule, errAbi } = await setupTests();

      await token
        .connect(providerAddress)
        .approve(lendingPool.address, depositAmount);

      await lendingPool
        .connect(providerAddress)
        .deposit(token.address, depositAmount, userSA.address, 0);

      const value = ethers.utils.parseUnits("100", 6);
      const handler = aaveV2handler.address;
      const data = (
        await ethers.getContractFactory("AaveV2Handler")
      ).interface.encodeFunctionData("borrow(address,uint256,uint256)", [
        borrowToken.address,
        value,
        rateMode,
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

      const beforeExecBalance = await borrowToken.balanceOf(userSA.address);

      const debtTokenUserBefore = await debtToken.balanceOf(userSA.address);

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

      const afterExecBalance = await borrowToken.balanceOf(userSA.address);
      const debtTokenUserAfter = await debtToken.balanceOf(userSA.address);

      //  borrowAmount <= (debtTokenUserAfter-debtTokenUserBefore) < borrowAmount + interestMax
      const interestMax = value.mul(1).div(10000);

      expect(debtTokenUserAfter.sub(debtTokenUserBefore)).to.be.gte(value);
      expect(debtTokenUserAfter.sub(debtTokenUserBefore)).to.be.lt(
        value.add(interestMax)
      );

      expect(afterExecBalance.sub(beforeExecBalance)).to.be.eq(value);

      expect(await waffle.provider.getBalance(strategyModule.address)).to.be.eq(
        0
      );

      expect(await borrowToken.balanceOf(strategyModule.address)).to.be.eq(0);

      expect(await debtToken.balanceOf(strategyModule.address)).to.be.eq(0);
    });

    it("Borrow weth", async function () {
      const { userSA, ecdsaModule, errAbi } = await setupTests();

      await token
        .connect(providerAddress)
        .approve(lendingPool.address, depositAmount);

      await lendingPool
        .connect(providerAddress)
        .deposit(token.address, depositAmount, userSA.address, 0);

      const value = ethers.utils.parseEther("1");
      const handler = aaveV2handler.address;
      const data = (
        await ethers.getContractFactory("AaveV2Handler")
      ).interface.encodeFunctionData("borrow(address,uint256,uint256)", [
        WrappedETH.address,
        value,
        rateMode,
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

      const beforeExecBalance = await WrappedETH.balanceOf(userSA.address);

      const debtTokenUserBefore = await debtWrappedETH.balanceOf(
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

      const afterExecBalance = await WrappedETH.balanceOf(userSA.address);
      const debtTokenUserAfter = await debtWrappedETH.balanceOf(userSA.address);

      //  borrowAmount - 1 <= (debtTokenUserAfter-debtTokenUserBefore) < borrowAmount + interestMax
      const interestMax = value.mul(1).div(10000);

      expect(debtTokenUserAfter.sub(debtTokenUserBefore)).to.be.gte(
        value.sub(1)
      );
      expect(debtTokenUserAfter.sub(debtTokenUserBefore)).to.be.lt(
        value.add(interestMax)
      );

      expect(afterExecBalance.sub(beforeExecBalance)).to.be.eq(value);

      expect(await waffle.provider.getBalance(strategyModule.address)).to.be.eq(
        0
      );

      expect(await borrowToken.balanceOf(strategyModule.address)).to.be.eq(0);

      expect(await debtToken.balanceOf(strategyModule.address)).to.be.eq(0);
    });

    it("Borrow eth", async function () {
      const { userSA, ecdsaModule, errAbi } = await setupTests();

      await token
        .connect(providerAddress)
        .approve(lendingPool.address, depositAmount);

      await lendingPool
        .connect(providerAddress)
        .deposit(token.address, depositAmount, userSA.address, 0);

      const value = ethers.utils.parseEther("1");
      const handler = aaveV2handler.address;
      const data = (
        await ethers.getContractFactory("AaveV2Handler")
      ).interface.encodeFunctionData("borrowETH(uint256,uint256)", [
        value,
        rateMode,
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

      const beforeExecBalance = await waffle.provider.getBalance(
        userSA.address
      );

      const debtTokenUserBefore = await debtWrappedETH.balanceOf(
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
      const debtTokenUserAfter = await debtWrappedETH.balanceOf(userSA.address);

      //  borrowAmount - 1 <= (debtTokenUserAfter-debtTokenUserBefore) < borrowAmount + interestMax
      const interestMax = value.mul(1).div(10000);

      expect(debtTokenUserAfter.sub(debtTokenUserBefore)).to.be.gte(
        value.sub(1)
      );
      expect(debtTokenUserAfter.sub(debtTokenUserBefore)).to.be.lt(
        value.add(interestMax)
      );

      expect(afterExecBalance.sub(beforeExecBalance)).to.be.eq(value);

      expect(await waffle.provider.getBalance(strategyModule.address)).to.be.eq(
        0
      );

      expect(await borrowToken.balanceOf(strategyModule.address)).to.be.eq(0);

      expect(await debtToken.balanceOf(strategyModule.address)).to.be.eq(0);
    });
  });
});
