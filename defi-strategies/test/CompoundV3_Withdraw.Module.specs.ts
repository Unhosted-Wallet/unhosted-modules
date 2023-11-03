import { expect } from "chai";
import { BigNumber, Contract } from "ethers";
import { decodeError } from "ethers-decode-error";
import hardhat, { ethers, deployments, waffle } from "hardhat";
import {
  buildEcdsaModuleAuthorizedStrategyTx,
  callExecStrategy,
} from "./utils/execution";
import { makeEcdsaModuleUserOp } from "./utils/userOp";
import {
  WRAPPED_NATIVE_TOKEN,
  DAI_TOKEN,
  USDC_TOKEN,
  COMPOUND_V3_COMET_USDC,
  COMPOUND_V3_COMET_WETH,
  CBETH_TOKEN,
} from "./utils/constants_eth";
import { MAX_UINT256 } from "./utils/constants";

import {
  getEntryPoint,
  getEcdsaOwnershipRegistryModule,
  getSmartAccountWithModule,
  getStrategyModule,
} from "./utils/setupHelper";
import { getTokenProvider } from "./utils/providers";

describe("Compound V3 withdraw", async () => {
  const chainId = hardhat.network.config.chainId;
  if (chainId === 1) {
    // This test supports to run on these chains.
  } else {
    return;
  }
  const [deployer, smartAccountOwner, alice] = waffle.provider.getWallets();
  let strategyModule: Contract;
  let compoundV3handler: Contract;
  let WrappedETH: Contract;
  let cometUSDC: Contract;
  let cometWETH: Contract;
  let cbETH: Contract;
  let dai: Contract;
  let usdc: Contract;
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

    WrappedETH = await (
      await ethers.getContractFactory("MockToken")
    ).attach(WRAPPED_NATIVE_TOKEN);

    dai = await (
      await ethers.getContractFactory("MockToken")
    ).attach(DAI_TOKEN);

    usdc = await (
      await ethers.getContractFactory("MockToken")
    ).attach(USDC_TOKEN);

    cometUSDC = await ethers.getContractAt("IComet", COMPOUND_V3_COMET_USDC);

    cometWETH = await ethers.getContractAt("IComet", COMPOUND_V3_COMET_WETH);

    cbETH = await (
      await ethers.getContractFactory("MockToken")
    ).attach(CBETH_TOKEN);

    providerAddress = await getTokenProvider(usdc.address);
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

    compoundV3handler = await (
      await ethers.getContractFactory("CompoundV3Handler")
    ).deploy(WRAPPED_NATIVE_TOKEN);

    strategyModule = await getStrategyModule(
      alice.address,
      compoundV3handler.address,
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

  const supplyToken = async (
    baseToken: Contract,
    comet: Contract,
    userSA: Contract,
    supplyAmount: BigNumber,
    errAbi: any,
    ecdsaModule: Contract,
    providerAddress: any
  ) => {
    await baseToken
      .connect(providerAddress)
      .transfer(userSA.address, supplyAmount);

    const handler = compoundV3handler.address;

    const data = (
      await ethers.getContractFactory("CompoundV3Handler")
    ).interface.encodeFunctionData("supply(address,address,uint256)", [
      comet.address,
      baseToken.address,
      supplyAmount,
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
  };

  it("Module is enabled", async () => {
    const { userSA } = await setupTests();
    expect(await userSA.isModuleEnabled(strategyModule.address)).to.equal(true);
  });

  describe("Withdraw", function () {
    describe("Token-base", function () {
      let comet: Contract;
      let baseToken: Contract;
      const supplyAmount = ethers.utils.parseUnits("1", 6);

      it("normal", async function () {
        const { userSA, ecdsaModule, errAbi } = await setupTests();
        await supplyToken(
          usdc,
          cometUSDC,
          userSA,
          supplyAmount,
          errAbi,
          ecdsaModule,
          providerAddress
        );
        comet = cometUSDC;
        baseToken = usdc;
        const value = await comet.balanceOf(userSA.address);
        const handler = compoundV3handler.address;

        const data = (
          await ethers.getContractFactory("CompoundV3Handler")
        ).interface.encodeFunctionData("withdraw(address,address,uint256)", [
          comet.address,
          baseToken.address,
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

        const beforeExecBalance = await baseToken.balanceOf(comet.address);

        try {
          await strategyModule.requiredTxFee(userSA.address, transaction);
        } catch (error) {
          fee = decodeError(error, errAbi).args;
          fee = fee[0];
        }

        expect(await baseToken.balanceOf(userSA.address)).to.be.eq(0);

        const execRes = await callExecStrategy(
          strategyModule,
          [userSA.address, transaction, signature],
          ["uint256"],
          fee
        );

        const afterExecBalance = await baseToken.balanceOf(comet.address);

        expect(beforeExecBalance.sub(afterExecBalance)).to.be.eq(execRes[0]);

        expect(beforeExecBalance.sub(afterExecBalance)).to.be.eq(value);

        expect(await baseToken.balanceOf(userSA.address)).to.be.eq(value);

        expect(await baseToken.balanceOf(strategyModule.address)).to.be.eq(0);

        expect(
          await waffle.provider.getBalance(strategyModule.address)
        ).to.be.eq(0);
      });

      it("partial", async function () {
        const { userSA, ecdsaModule, errAbi } = await setupTests();
        await supplyToken(
          usdc,
          cometUSDC,
          userSA,
          supplyAmount,
          errAbi,
          ecdsaModule,
          providerAddress
        );

        const value = (await comet.balanceOf(userSA.address)).div(2);
        const handler = compoundV3handler.address;

        const data = (
          await ethers.getContractFactory("CompoundV3Handler")
        ).interface.encodeFunctionData("withdraw(address,address,uint256)", [
          comet.address,
          baseToken.address,
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

        const beforeExecBalance = await baseToken.balanceOf(comet.address);

        try {
          await strategyModule.requiredTxFee(userSA.address, transaction);
        } catch (error) {
          fee = decodeError(error, errAbi).args;
          fee = fee[0];
        }

        expect(await baseToken.balanceOf(userSA.address)).to.be.eq(0);

        const execRes = await callExecStrategy(
          strategyModule,
          [userSA.address, transaction, signature],
          ["uint256"],
          fee
        );

        const afterExecBalance = await baseToken.balanceOf(comet.address);

        expect(beforeExecBalance.sub(afterExecBalance)).to.be.eq(execRes[0]);

        expect(beforeExecBalance.sub(afterExecBalance)).to.be.eq(value);

        expect(await baseToken.balanceOf(userSA.address)).to.be.eq(value);

        expect(await baseToken.balanceOf(strategyModule.address)).to.be.eq(0);

        expect(
          await waffle.provider.getBalance(strategyModule.address)
        ).to.be.eq(0);
      });

      it("max amount", async function () {
        const { userSA, ecdsaModule, errAbi } = await setupTests();
        await supplyToken(
          usdc,
          cometUSDC,
          userSA,
          supplyAmount,
          errAbi,
          ecdsaModule,
          providerAddress
        );

        const value = await comet.balanceOf(userSA.address);
        const handler = compoundV3handler.address;

        const data = (
          await ethers.getContractFactory("CompoundV3Handler")
        ).interface.encodeFunctionData("withdraw(address,address,uint256)", [
          comet.address,
          baseToken.address,
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

        const beforeExecBalance = await baseToken.balanceOf(comet.address);

        try {
          await strategyModule.requiredTxFee(userSA.address, transaction);
        } catch (error) {
          fee = decodeError(error, errAbi).args;
          fee = fee[0];
        }

        expect(await baseToken.balanceOf(userSA.address)).to.be.eq(0);

        const execRes = await callExecStrategy(
          strategyModule,
          [userSA.address, transaction, signature],
          ["uint256"],
          fee
        );

        const afterExecBalance = await baseToken.balanceOf(comet.address);

        expect(beforeExecBalance.sub(afterExecBalance)).to.be.eq(value);

        expect(beforeExecBalance.sub(afterExecBalance)).to.be.eq(execRes[0]);

        expect(await baseToken.balanceOf(userSA.address)).to.be.eq(value);

        expect(await baseToken.balanceOf(strategyModule.address)).to.be.eq(0);

        expect(
          await waffle.provider.getBalance(strategyModule.address)
        ).to.be.eq(0);
      });
    });

    describe("ETH-base", function () {
      if (chainId !== 1) {
        return;
      }
      let comet: Contract;
      let baseToken: Contract;
      const supplyAmount = ethers.utils.parseEther("1");

      it("normal", async function () {
        const { userSA, ecdsaModule, errAbi } = await setupTests();
        await supplyToken(
          WrappedETH,
          cometWETH,
          userSA,
          supplyAmount,
          errAbi,
          ecdsaModule,
          wethProviderAddress
        );
        comet = cometWETH;
        baseToken = WrappedETH;

        const value = await comet.balanceOf(userSA.address);
        const handler = compoundV3handler.address;

        const data = (
          await ethers.getContractFactory("CompoundV3Handler")
        ).interface.encodeFunctionData("withdrawETH(address,uint256)", [
          comet.address,
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

        const beforeExecBalance = await waffle.provider.getBalance(
          userSA.address
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

        const afterExecBalance = await waffle.provider.getBalance(
          userSA.address
        );

        expect(await comet.balanceOf(userSA.address)).to.be.lt(
          ethers.utils.parseEther("0.00001")
        );

        expect(afterExecBalance.sub(beforeExecBalance)).to.be.eq(execRes[0]);

        expect(afterExecBalance.sub(beforeExecBalance)).to.be.eq(value);

        expect(
          await waffle.provider.getBalance(strategyModule.address)
        ).to.be.eq(0);
      });

      it("partial", async function () {
        const { userSA, ecdsaModule, errAbi } = await setupTests();
        await supplyToken(
          WrappedETH,
          cometWETH,
          userSA,
          supplyAmount,
          errAbi,
          ecdsaModule,
          wethProviderAddress
        );

        const value = (await comet.balanceOf(userSA.address)).div(2);
        const handler = compoundV3handler.address;

        const data = (
          await ethers.getContractFactory("CompoundV3Handler")
        ).interface.encodeFunctionData("withdrawETH(address,uint256)", [
          comet.address,
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

        const beforeExecBalance = await waffle.provider.getBalance(
          userSA.address
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

        const afterExecBalance = await waffle.provider.getBalance(
          userSA.address
        );

        expect(await comet.balanceOf(userSA.address)).to.be.lt(
          value.add(ethers.utils.parseEther("0.00001"))
        );

        expect(afterExecBalance.sub(beforeExecBalance)).to.be.eq(value);

        expect(afterExecBalance.sub(beforeExecBalance)).to.be.eq(execRes[0]);

        expect(
          await waffle.provider.getBalance(strategyModule.address)
        ).to.be.eq(0);
      });

      it("max amount", async function () {
        const { userSA, ecdsaModule, errAbi } = await setupTests();
        await supplyToken(
          WrappedETH,
          cometWETH,
          userSA,
          supplyAmount,
          errAbi,
          ecdsaModule,
          wethProviderAddress
        );

        const value = await comet.balanceOf(userSA.address);
        const handler = compoundV3handler.address;

        const data = (
          await ethers.getContractFactory("CompoundV3Handler")
        ).interface.encodeFunctionData("withdrawETH(address,uint256)", [
          comet.address,
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

        const beforeExecBalance = await waffle.provider.getBalance(
          userSA.address
        );
        try {
          await strategyModule.requiredTxFee(userSA.address, transaction);
        } catch (error) {
          fee = decodeError(error, errAbi).args;
          fee = fee[0];
        }

        await callExecStrategy(
          strategyModule,
          [userSA.address, transaction, signature],
          ["uint256"],
          fee
        );

        const afterExecBalance = await waffle.provider.getBalance(
          userSA.address
        );

        expect(await comet.balanceOf(userSA.address)).to.be.eq(0);

        expect(afterExecBalance.sub(beforeExecBalance)).to.be.within(
          value,
          value.add(ethers.utils.parseEther("0.00001"))
        );

        expect(
          await waffle.provider.getBalance(strategyModule.address)
        ).to.be.eq(0);
      });
    });
  });
});
