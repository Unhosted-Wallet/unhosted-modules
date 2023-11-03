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
  AWRAPPED_NATIVE_V2_DEBT_STABLE,
  AWRAPPED_NATIVE_V2_DEBT_VARIABLE,
  AAVE_RATEMODE,
  WRAPPED_NATIVE_TOKEN,
  AAVEPROTOCOL_V2_PROVIDER,
  AWRAPPED_NATIVE_V2_TOKEN,
  DAI_TOKEN,
  ADAI_V2,
} from "./utils/constants_eth";

import {
  getEntryPoint,
  getEcdsaOwnershipRegistryModule,
  getSmartAccountWithModule,
  getStrategyModule,
} from "./utils/setupHelper";
import { getTokenProvider } from "./utils/providers";

describe("AaveV2 Repay", async () => {
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
  let token: Contract;
  let provider: Contract;
  let lendingPool: Contract;
  let providerAddress: any;
  let wethProviderAddress: any;
  let fee: any;

  const borrow = async (depositAmount, rateMode) => {
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

    try {
      await strategyModule.requiredTxFee(userSA.address, transaction);
    } catch (error) {
      fee = decodeError(error, errAbi).args;
      fee = fee[0];
    }

    await strategyModule.execStrategy(userSA.address, transaction, signature, {
      value: fee,
    });

    return {
      borrowAmount: value,
      ecdsaModule: ecdsaModule,
      userSA: userSA,
      errAbi: errAbi,
    };
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

  it("Module is enabled", async () => {
    const { userSA } = await setupTests();
    expect(await userSA.isModuleEnabled(strategyModule.address)).to.equal(true);
  });

  describe("Repay with Stable Rate", function () {
    const depositAmount = ethers.utils.parseEther("10000");
    const rateMode = AAVE_RATEMODE.STABLE;

    before(async function () {
      debtWrappedETH = await (
        await ethers.getContractFactory("MockToken")
      ).attach(AWRAPPED_NATIVE_V2_DEBT_STABLE);
    });

    it("Partial", async function () {
      const { borrowAmount, userSA, ecdsaModule, errAbi } = await borrow(
        depositAmount,
        rateMode
      );

      const value = borrowAmount.div(2);
      const handler = aaveV2handler.address;
      const data = (
        await ethers.getContractFactory("AaveV2Handler")
      ).interface.encodeFunctionData("repay(address,uint256,uint256,address)", [
        WrappedETH.address,
        value,
        rateMode,
        userSA.address,
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

      const execRes = await callExecStrategy(
        strategyModule,
        [userSA.address, transaction, signature],
        ["uint256"],
        fee
      );

      const afterExecBalance = await WrappedETH.balanceOf(userSA.address);
      const afterExecDebtBalance = await debtWrappedETH.balanceOf(
        userSA.address
      );
      const interestMax = borrowAmount.mul(1).div(10000);

      expect(execRes[0]).to.be.gte(borrowAmount.sub(value));

      expect(execRes[0]).to.be.lt(borrowAmount.sub(value).add(interestMax));

      // (borrow - repay - 1) <= debtTokenUserAfter < (borrow + interestMax - repay)
      expect(afterExecDebtBalance).to.be.gte(borrowAmount.sub(value).sub(1));
      expect(afterExecDebtBalance).to.be.lt(
        borrowAmount.add(interestMax).sub(value)
      );
      expect(afterExecBalance).to.be.eq(borrowAmount.sub(value));

      expect(await waffle.provider.getBalance(strategyModule.address)).to.be.eq(
        0
      );

      expect(await WrappedETH.balanceOf(strategyModule.address)).to.be.eq(0);

      expect(await debtWrappedETH.balanceOf(strategyModule.address)).to.be.eq(
        0
      );
    });

    it("Partial by eth", async function () {
      const { borrowAmount, userSA, ecdsaModule, errAbi } = await borrow(
        depositAmount,
        rateMode
      );

      const value = borrowAmount.div(2);
      const handler = aaveV2handler.address;
      const data = (
        await ethers.getContractFactory("AaveV2Handler")
      ).interface.encodeFunctionData("repayETH(uint256,uint256,address)", [
        value,
        rateMode,
        userSA.address,
      ]);

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

      const execRes = await callExecStrategy(
        strategyModule,
        [userSA.address, transaction, signature],
        ["uint256"],
        fee
      );

      const afterExecBalance = await waffle.provider.getBalance(userSA.address);
      const afterExecDebtBalance = await debtWrappedETH.balanceOf(
        userSA.address
      );
      const interestMax = borrowAmount.mul(1).div(10000);

      expect(execRes[0]).to.be.gte(borrowAmount.sub(value));

      expect(execRes[0]).to.be.lt(borrowAmount.sub(value).add(interestMax));

      // (borrow - repay - 1) <= debtTokenUserAfter < (borrow + interestMax - repay)
      expect(afterExecDebtBalance).to.be.gte(borrowAmount.sub(value).sub(1));
      expect(afterExecDebtBalance).to.be.lt(
        borrowAmount.add(interestMax).sub(value)
      );
      expect(beforeExecBalance.sub(afterExecBalance)).to.be.eq(value);

      expect(await waffle.provider.getBalance(strategyModule.address)).to.be.eq(
        0
      );

      expect(await WrappedETH.balanceOf(strategyModule.address)).to.be.eq(0);

      expect(await debtWrappedETH.balanceOf(strategyModule.address)).to.be.eq(
        0
      );
    });

    it("Whole", async function () {
      const { borrowAmount, userSA, ecdsaModule, errAbi } = await borrow(
        depositAmount,
        rateMode
      );

      const extraNeed = ethers.utils.parseEther("1");
      const value = borrowAmount.add(extraNeed);
      const handler = aaveV2handler.address;
      const data = (
        await ethers.getContractFactory("AaveV2Handler")
      ).interface.encodeFunctionData("repay(address,uint256,uint256,address)", [
        WrappedETH.address,
        value,
        rateMode,
        userSA.address,
      ]);

      await WrappedETH.connect(wethProviderAddress).transfer(
        userSA.address,
        extraNeed
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

      try {
        await strategyModule.requiredTxFee(userSA.address, transaction);
      } catch (error) {
        fee = decodeError(error, errAbi).args;
        fee = fee[0];
      }

      const beforeExecBalance = await waffle.provider.getBalance(
        userSA.address
      );

      const execRes = await callExecStrategy(
        strategyModule,
        [userSA.address, transaction, signature],
        ["uint256"],
        fee
      );

      const afterExecBalance = await waffle.provider.getBalance(userSA.address);
      const afterExecDebtBalance = await debtWrappedETH.balanceOf(
        userSA.address
      );
      const interestMax = borrowAmount.mul(1).div(10000);

      expect(execRes[0]).to.be.eq(0);

      expect(afterExecDebtBalance).to.be.eq(0);

      // (repay - borrow - interestMax) < borrowTokenUserAfter <= (repay - borrow)
      expect(await WrappedETH.balanceOf(userSA.address)).to.be.gt(
        value.sub(borrowAmount).sub(interestMax)
      );
      expect(await WrappedETH.balanceOf(userSA.address)).to.be.lte(
        value.sub(borrowAmount)
      );
      expect(beforeExecBalance.sub(afterExecBalance)).to.be.eq(0);

      expect(await waffle.provider.getBalance(strategyModule.address)).to.be.eq(
        0
      );

      expect(await WrappedETH.balanceOf(strategyModule.address)).to.be.eq(0);

      expect(await debtWrappedETH.balanceOf(strategyModule.address)).to.be.eq(
        0
      );
    });

    it("Whole by eth", async function () {
      const { borrowAmount, userSA, ecdsaModule, errAbi } = await borrow(
        depositAmount,
        rateMode
      );

      const extraNeed = ethers.utils.parseEther("1");
      const value = borrowAmount.add(extraNeed);
      const handler = aaveV2handler.address;
      const data = (
        await ethers.getContractFactory("AaveV2Handler")
      ).interface.encodeFunctionData("repayETH(uint256,uint256,address)", [
        value,
        rateMode,
        userSA.address,
      ]);

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

      const beforeExecBalance = await WrappedETH.balanceOf(userSA.address);

      const execRes = await callExecStrategy(
        strategyModule,
        [userSA.address, transaction, signature],
        ["uint256"],
        fee
      );

      const afterExecBalance = await WrappedETH.balanceOf(userSA.address);
      const afterExecDebtBalance = await debtWrappedETH.balanceOf(
        userSA.address
      );
      const interestMax = borrowAmount.mul(1).div(10000);

      expect(execRes[0]).to.be.eq(0);
      expect(afterExecDebtBalance).to.be.eq(0);

      // (repay - borrow - interestMax) < borrowTokenUserAfter <= (repay - borrow)
      expect(afterExecBalance.sub(beforeExecBalance)).to.be.lte(
        value.sub(borrowAmount)
      );
      expect(afterExecBalance.sub(beforeExecBalance)).to.be.gt(
        value.sub(borrowAmount).sub(interestMax)
      );

      expect(await waffle.provider.getBalance(strategyModule.address)).to.be.eq(
        0
      );

      expect(await WrappedETH.balanceOf(strategyModule.address)).to.be.eq(0);

      expect(await debtWrappedETH.balanceOf(strategyModule.address)).to.be.eq(
        0
      );
    });
  });

  describe("Repay with Stable Rate", function () {
    const depositAmount = ethers.utils.parseEther("10000");
    const rateMode = AAVE_RATEMODE.VARIABLE;

    before(async function () {
      debtWrappedETH = await (
        await ethers.getContractFactory("MockToken")
      ).attach(AWRAPPED_NATIVE_V2_DEBT_VARIABLE);
    });

    it("Partial", async function () {
      const { borrowAmount, userSA, ecdsaModule, errAbi } = await borrow(
        depositAmount,
        rateMode
      );

      const value = borrowAmount.div(2);
      const handler = aaveV2handler.address;
      const data = (
        await ethers.getContractFactory("AaveV2Handler")
      ).interface.encodeFunctionData("repay(address,uint256,uint256,address)", [
        WrappedETH.address,
        value,
        rateMode,
        userSA.address,
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

      const execRes = await callExecStrategy(
        strategyModule,
        [userSA.address, transaction, signature],
        ["uint256"],
        fee
      );

      const afterExecBalance = await WrappedETH.balanceOf(userSA.address);
      const afterExecDebtBalance = await debtWrappedETH.balanceOf(
        userSA.address
      );
      const interestMax = borrowAmount.mul(1).div(10000);

      // (borrowAmount - repayAmount -1) <= remainBorrowAmount < (borrowAmount + interestMax - repayAmount)
      expect(execRes[0]).to.be.gte(borrowAmount.sub(value.add(1)));
      expect(execRes[0]).to.be.lt(borrowAmount.sub(value).add(interestMax));

      // (borrow - repay - 1) <= debtTokenUserAfter < (borrow + interestMax - repay)
      expect(afterExecDebtBalance).to.be.gte(borrowAmount.sub(value).sub(1));
      expect(afterExecDebtBalance).to.be.lt(
        borrowAmount.add(interestMax).sub(value)
      );
      expect(afterExecBalance).to.be.eq(borrowAmount.sub(value));

      expect(await waffle.provider.getBalance(strategyModule.address)).to.be.eq(
        0
      );

      expect(await WrappedETH.balanceOf(strategyModule.address)).to.be.eq(0);

      expect(await debtWrappedETH.balanceOf(strategyModule.address)).to.be.eq(
        0
      );
    });

    it("Partial by eth", async function () {
      const { borrowAmount, userSA, ecdsaModule, errAbi } = await borrow(
        depositAmount,
        rateMode
      );

      const value = borrowAmount.div(2);
      const handler = aaveV2handler.address;
      const data = (
        await ethers.getContractFactory("AaveV2Handler")
      ).interface.encodeFunctionData("repayETH(uint256,uint256,address)", [
        value,
        rateMode,
        userSA.address,
      ]);

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

      const execRes = await callExecStrategy(
        strategyModule,
        [userSA.address, transaction, signature],
        ["uint256"],
        fee
      );

      const afterExecBalance = await waffle.provider.getBalance(userSA.address);
      const afterExecDebtBalance = await debtWrappedETH.balanceOf(
        userSA.address
      );
      const interestMax = borrowAmount.mul(1).div(10000);

      // (borrowAmount - repayAmount -1) <= remainBorrowAmount < (borrowAmount + interestMax - repayAmount)
      expect(execRes[0]).to.be.gte(borrowAmount.sub(value.add(1)));
      expect(execRes[0]).to.be.lt(borrowAmount.sub(value).add(interestMax));

      // (borrow - repay - 1) <= debtTokenUserAfter < (borrow + interestMax - repay)
      expect(afterExecDebtBalance).to.be.gte(borrowAmount.sub(value).sub(1));
      expect(afterExecDebtBalance).to.be.lt(
        borrowAmount.add(interestMax).sub(value)
      );
      expect(beforeExecBalance.sub(afterExecBalance)).to.be.eq(value);

      expect(await waffle.provider.getBalance(strategyModule.address)).to.be.eq(
        0
      );

      expect(await WrappedETH.balanceOf(strategyModule.address)).to.be.eq(0);

      expect(await debtWrappedETH.balanceOf(strategyModule.address)).to.be.eq(
        0
      );
    });

    it("Whole", async function () {
      const { borrowAmount, userSA, ecdsaModule, errAbi } = await borrow(
        depositAmount,
        rateMode
      );

      const extraNeed = ethers.utils.parseEther("1");
      const value = borrowAmount.add(extraNeed);
      const handler = aaveV2handler.address;
      const data = (
        await ethers.getContractFactory("AaveV2Handler")
      ).interface.encodeFunctionData("repay(address,uint256,uint256,address)", [
        WrappedETH.address,
        value,
        rateMode,
        userSA.address,
      ]);

      await WrappedETH.connect(wethProviderAddress).transfer(
        userSA.address,
        extraNeed
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

      try {
        await strategyModule.requiredTxFee(userSA.address, transaction);
      } catch (error) {
        fee = decodeError(error, errAbi).args;
        fee = fee[0];
      }

      const beforeExecBalance = await waffle.provider.getBalance(
        userSA.address
      );

      const execRes = await callExecStrategy(
        strategyModule,
        [userSA.address, transaction, signature],
        ["uint256"],
        fee
      );

      const afterExecBalance = await waffle.provider.getBalance(userSA.address);
      const afterExecDebtBalance = await debtWrappedETH.balanceOf(
        userSA.address
      );
      const interestMax = borrowAmount.mul(1).div(10000);

      expect(execRes[0]).to.be.eq(0);
      expect(afterExecDebtBalance).to.be.eq(0);

      // (repay - borrow - interestMax) < borrowTokenUserAfter <= (repay - borrow)
      expect(await WrappedETH.balanceOf(userSA.address)).to.be.gt(
        value.sub(borrowAmount).sub(interestMax)
      );
      expect(await WrappedETH.balanceOf(userSA.address)).to.be.lte(
        value.sub(borrowAmount)
      );
      expect(beforeExecBalance.sub(afterExecBalance)).to.be.eq(0);

      expect(await waffle.provider.getBalance(strategyModule.address)).to.be.eq(
        0
      );

      expect(await WrappedETH.balanceOf(strategyModule.address)).to.be.eq(0);

      expect(await debtWrappedETH.balanceOf(strategyModule.address)).to.be.eq(
        0
      );
    });

    it("Whole by eth", async function () {
      const { borrowAmount, userSA, ecdsaModule, errAbi } = await borrow(
        depositAmount,
        rateMode
      );

      const extraNeed = ethers.utils.parseEther("1");
      const value = borrowAmount.add(extraNeed);
      const handler = aaveV2handler.address;
      const data = (
        await ethers.getContractFactory("AaveV2Handler")
      ).interface.encodeFunctionData("repayETH(uint256,uint256,address)", [
        value,
        rateMode,
        userSA.address,
      ]);

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

      const beforeExecBalance = await WrappedETH.balanceOf(userSA.address);

      const execRes = await callExecStrategy(
        strategyModule,
        [userSA.address, transaction, signature],
        ["uint256"],
        fee
      );

      const afterExecBalance = await WrappedETH.balanceOf(userSA.address);
      const afterExecDebtBalance = await debtWrappedETH.balanceOf(
        userSA.address
      );
      const interestMax = borrowAmount.mul(1).div(10000);

      expect(execRes[0]).to.be.eq(0);
      expect(afterExecDebtBalance).to.be.eq(0);

      // (repay - borrow - interestMax) < borrowTokenUserAfter <= (repay - borrow)
      expect(afterExecBalance.sub(beforeExecBalance)).to.be.lte(
        value.sub(borrowAmount)
      );
      expect(afterExecBalance.sub(beforeExecBalance)).to.be.gt(
        value.sub(borrowAmount).sub(interestMax)
      );

      expect(await waffle.provider.getBalance(strategyModule.address)).to.be.eq(
        0
      );

      expect(await WrappedETH.balanceOf(strategyModule.address)).to.be.eq(0);

      expect(await debtWrappedETH.balanceOf(strategyModule.address)).to.be.eq(
        0
      );
    });
  });
});
