import { expect } from "chai";
import { Contract } from "ethers";
import { decodeError } from "ethers-decode-error";
import hardhat, { ethers, deployments, waffle } from "hardhat";
import { buildEcdsaModuleAuthorizedStrategyTx } from "./utils/execution";
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

describe("Compound V3 supply", async () => {
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

  it("Module is enabled", async () => {
    const { userSA } = await setupTests();
    expect(await userSA.isModuleEnabled(strategyModule.address)).to.equal(true);
  });

  describe("Supply", function () {
    describe("Token-base", function () {
      let comet: Contract;
      let baseToken: Contract;
      const supplyAmount = ethers.utils.parseUnits("1", 6);

      beforeEach(async function () {
        comet = cometUSDC;
        baseToken = usdc;
      });

      it("normal", async function () {
        const { userSA, ecdsaModule, errAbi } = await setupTests();
        const value = supplyAmount;
        const handler = compoundV3handler.address;

        const data = (
          await ethers.getContractFactory("CompoundV3Handler")
        ).interface.encodeFunctionData("supply(address,address,uint256)", [
          comet.address,
          baseToken.address,
          value,
        ]);

        await usdc.connect(providerAddress).transfer(userSA.address, value);

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

        await strategyModule.execStrategy(
          userSA.address,
          transaction,
          signature,
          { value: fee }
        );

        const afterExecBalance = await baseToken.balanceOf(comet.address);

        expect(afterExecBalance).to.be.eq(value.add(beforeExecBalance));

        expect(await baseToken.balanceOf(userSA.address)).to.be.eq(0);

        expect(await baseToken.balanceOf(strategyModule.address)).to.be.eq(0);

        expect(
          await waffle.provider.getBalance(strategyModule.address)
        ).to.be.eq(0);
      });

      it("max amount", async function () {
        const { userSA, ecdsaModule, errAbi } = await setupTests();
        const value = supplyAmount;
        const handler = compoundV3handler.address;

        const data = (
          await ethers.getContractFactory("CompoundV3Handler")
        ).interface.encodeFunctionData("supply(address,address,uint256)", [
          comet.address,
          baseToken.address,
          MAX_UINT256,
        ]);

        await usdc.connect(providerAddress).transfer(userSA.address, value);

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

        await strategyModule.execStrategy(
          userSA.address,
          transaction,
          signature,
          { value: fee }
        );

        const afterExecBalance = await baseToken.balanceOf(comet.address);

        expect(afterExecBalance).to.be.eq(value.add(beforeExecBalance));

        expect(await baseToken.balanceOf(userSA.address)).to.be.eq(0);

        expect(await baseToken.balanceOf(strategyModule.address)).to.be.eq(0);

        expect(
          await waffle.provider.getBalance(strategyModule.address)
        ).to.be.eq(0);
      });

      it("by repay", async function () {
        const { userSA, ecdsaModule, errAbi } = await setupTests();
        const value = supplyAmount;
        const handler = compoundV3handler.address;

        const data = (
          await ethers.getContractFactory("CompoundV3Handler")
        ).interface.encodeFunctionData("repay(address,uint256)", [
          comet.address,
          value,
        ]);

        await usdc.connect(providerAddress).transfer(userSA.address, value);

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

        await strategyModule.execStrategy(
          userSA.address,
          transaction,
          signature,
          { value: fee }
        );

        const afterExecBalance = await baseToken.balanceOf(comet.address);

        expect(afterExecBalance).to.be.eq(value.add(beforeExecBalance));

        expect(await baseToken.balanceOf(userSA.address)).to.be.eq(0);

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

      const supplyAmount = ethers.utils.parseEther("1");
      let comet: Contract;
      let baseToken: Contract;

      beforeEach(async function () {
        comet = cometWETH;
        baseToken = WrappedETH;
      });

      it("normal", async function () {
        const { userSA, ecdsaModule, errAbi } = await setupTests();
        const value = supplyAmount;
        const handler = compoundV3handler.address;

        const data = (
          await ethers.getContractFactory("CompoundV3Handler")
        ).interface.encodeFunctionData("supplyETH(address,uint256)", [
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
            value.toString()
          );

        const beforeExecBalance = await baseToken.balanceOf(comet.address);

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

        const afterExecBalance = await baseToken.balanceOf(comet.address);

        expect(afterExecBalance).to.be.eq(value.add(beforeExecBalance));

        expect(await baseToken.balanceOf(userSA.address)).to.be.eq(0);

        expect(await baseToken.balanceOf(strategyModule.address)).to.be.eq(0);

        expect(
          await waffle.provider.getBalance(strategyModule.address)
        ).to.be.eq(0);
      });

      it("max amount", async function () {
        const { userSA, ecdsaModule, errAbi } = await setupTests();
        const value = await waffle.provider.getBalance(userSA.address);
        const handler = compoundV3handler.address;

        const data = (
          await ethers.getContractFactory("CompoundV3Handler")
        ).interface.encodeFunctionData("supplyETH(address,uint256)", [
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
            value.toString()
          );

        const beforeExecBalance = await baseToken.balanceOf(comet.address);

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

        const afterExecBalance = await baseToken.balanceOf(comet.address);

        expect(afterExecBalance).to.be.eq(value.add(beforeExecBalance));

        expect(await baseToken.balanceOf(userSA.address)).to.be.eq(0);

        expect(await baseToken.balanceOf(strategyModule.address)).to.be.eq(0);

        expect(
          await waffle.provider.getBalance(strategyModule.address)
        ).to.be.eq(0);
      });

      it("by repayETH", async function () {
        const { userSA, ecdsaModule, errAbi } = await setupTests();
        const value = supplyAmount;
        const handler = compoundV3handler.address;

        const data = (
          await ethers.getContractFactory("CompoundV3Handler")
        ).interface.encodeFunctionData("repayETH(address,uint256)", [
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
            value.toString()
          );

        const beforeExecBalance = await baseToken.balanceOf(comet.address);

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

        const afterExecBalance = await baseToken.balanceOf(comet.address);

        expect(afterExecBalance).to.be.eq(value.add(beforeExecBalance));

        expect(await baseToken.balanceOf(userSA.address)).to.be.eq(0);

        expect(await baseToken.balanceOf(strategyModule.address)).to.be.eq(0);

        expect(
          await waffle.provider.getBalance(strategyModule.address)
        ).to.be.eq(0);
      });
    });
    describe("Token-collateral", function () {
      let comet: Contract;
      let baseToken: Contract;
      const supplyAmount = ethers.utils.parseEther("10");

      beforeEach(async function () {
        comet = cometUSDC;
        baseToken = WrappedETH;
      });

      it("normal", async function () {
        const { userSA, ecdsaModule, errAbi } = await setupTests();
        const collateral = WrappedETH;
        const value = supplyAmount;
        const handler = compoundV3handler.address;

        const data = (
          await ethers.getContractFactory("CompoundV3Handler")
        ).interface.encodeFunctionData("supply(address,address,uint256)", [
          comet.address,
          collateral.address,
          value,
        ]);

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

        const beforeExecBalance = await baseToken.balanceOf(comet.address);

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

        const afterExecBalance = await baseToken.balanceOf(comet.address);

        expect(afterExecBalance).to.be.eq(value.add(beforeExecBalance));

        expect(await baseToken.balanceOf(userSA.address)).to.be.eq(0);

        expect(
          await comet.collateralBalanceOf(userSA.address, collateral.address)
        ).to.be.eq(value);

        expect(
          await comet.collateralBalanceOf(
            strategyModule.address,
            collateral.address
          )
        ).to.be.eq(0);

        expect(await baseToken.balanceOf(strategyModule.address)).to.be.eq(0);

        expect(
          await waffle.provider.getBalance(strategyModule.address)
        ).to.be.eq(0);
      });

      it("max amount", async function () {
        const { userSA, ecdsaModule, errAbi } = await setupTests();
        const collateral = WrappedETH;
        const value = supplyAmount;
        const handler = compoundV3handler.address;

        const data = (
          await ethers.getContractFactory("CompoundV3Handler")
        ).interface.encodeFunctionData("supply(address,address,uint256)", [
          comet.address,
          collateral.address,
          MAX_UINT256,
        ]);

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

        const beforeExecBalance = await baseToken.balanceOf(comet.address);

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

        const afterExecBalance = await baseToken.balanceOf(comet.address);

        expect(afterExecBalance).to.be.eq(value.add(beforeExecBalance));

        expect(await baseToken.balanceOf(userSA.address)).to.be.eq(0);

        expect(
          await comet.collateralBalanceOf(userSA.address, collateral.address)
        ).to.be.eq(value);

        expect(
          await comet.collateralBalanceOf(
            strategyModule.address,
            collateral.address
          )
        ).to.be.eq(0);

        expect(await baseToken.balanceOf(strategyModule.address)).to.be.eq(0);

        expect(
          await waffle.provider.getBalance(strategyModule.address)
        ).to.be.eq(0);
      });
    });

    describe("ETH-collateral", function () {
      let comet: Contract;
      let baseToken: Contract;
      const supplyAmount = ethers.utils.parseEther("1");

      beforeEach(async function () {
        comet = cometUSDC;
        baseToken = WrappedETH;
      });

      it("normal", async function () {
        const { userSA, ecdsaModule, errAbi } = await setupTests();
        const collateral = WrappedETH;
        const value = supplyAmount;
        const handler = compoundV3handler.address;

        const data = (
          await ethers.getContractFactory("CompoundV3Handler")
        ).interface.encodeFunctionData("supplyETH(address,uint256)", [
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
            value.toString()
          );

        const beforeExecBalance = await baseToken.balanceOf(comet.address);

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

        const afterExecBalance = await baseToken.balanceOf(comet.address);

        expect(afterExecBalance).to.be.eq(value.add(beforeExecBalance));

        expect(await baseToken.balanceOf(userSA.address)).to.be.eq(0);

        expect(
          await comet.collateralBalanceOf(userSA.address, collateral.address)
        ).to.be.eq(value);

        expect(
          await comet.collateralBalanceOf(
            strategyModule.address,
            collateral.address
          )
        ).to.be.eq(0);

        expect(await baseToken.balanceOf(strategyModule.address)).to.be.eq(0);

        expect(
          await waffle.provider.getBalance(strategyModule.address)
        ).to.be.eq(0);
      });

      it("max amount", async function () {
        const { userSA, ecdsaModule, errAbi } = await setupTests();
        const collateral = WrappedETH;
        const value = await waffle.provider.getBalance(userSA.address);
        const handler = compoundV3handler.address;

        const data = (
          await ethers.getContractFactory("CompoundV3Handler")
        ).interface.encodeFunctionData("supplyETH(address,uint256)", [
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
            value.toString()
          );

        const beforeExecBalance = await baseToken.balanceOf(comet.address);

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

        const afterExecBalance = await baseToken.balanceOf(comet.address);

        expect(afterExecBalance).to.be.eq(value.add(beforeExecBalance));

        expect(await baseToken.balanceOf(userSA.address)).to.be.eq(0);

        expect(
          await comet.collateralBalanceOf(userSA.address, collateral.address)
        ).to.be.eq(value);

        expect(
          await comet.collateralBalanceOf(
            strategyModule.address,
            collateral.address
          )
        ).to.be.eq(0);

        expect(await baseToken.balanceOf(strategyModule.address)).to.be.eq(0);

        expect(
          await waffle.provider.getBalance(strategyModule.address)
        ).to.be.eq(0);
      });
    });
  });
});
