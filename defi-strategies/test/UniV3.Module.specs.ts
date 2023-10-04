import { expect } from "chai";
import { Contract } from "ethers";
import { decodeError } from "ethers-decode-error";
import hardhat, { ethers, deployments, waffle } from "hardhat";
import { buildEcdsaModuleAuthorizedStrategyTx } from "./utils/execution";
import { makeEcdsaModuleUserOp } from "./utils/userOp";
import {
  SUSHISWAP_ROUTER,
  UNISWAPV3_ROUTER,
  USDC_TOKEN,
  WRAPPED_NATIVE_TOKEN,
} from "./utils/constants_eth";
import { MAX_UINT256 } from "./utils/constants";

import {
  getEntryPoint,
  getEcdsaOwnershipRegistryModule,
  getSmartAccountWithModule,
  getStrategyModule,
} from "./utils/setupHelper";
import { getTokenProvider } from "./utils/providers";

describe("Strategy Module (UniV3)", async () => {
  const chainId = hardhat.network.config.chainId;
  if (chainId === 1 || chainId === 137) {
    // This test supports to run on these chains.
  } else {
    return;
  }
  const [deployer, smartAccountOwner, alice, developer] =
    waffle.provider.getWallets();
  let strategyModule: Contract;
  let uniV3Handler: Contract;
  let wrappedETH: Contract;
  let usdcToken: Contract;
  let usdcProviderAddress: any;
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

    usdcToken = await (
      await ethers.getContractFactory("MockToken")
    ).attach(USDC_TOKEN);

    wrappedETH = await (
      await ethers.getContractFactory("MockToken")
    ).attach(WRAPPED_NATIVE_TOKEN);

    usdcProviderAddress = await getTokenProvider(usdcToken.address);
    usdcProviderAddress = await ethers.getSigner(usdcProviderAddress);

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

    uniV3Handler = await (
      await ethers.getContractFactory("UniV3Handler")
    ).deploy(UNISWAPV3_ROUTER, SUSHISWAP_ROUTER);

    strategyModule = await getStrategyModule(
      alice.address,
      uniV3Handler.address,
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

  describe("Deposit", () => {
    it("deposit token normal", async () => {
      const { userSA, ecdsaModule, errAbi } = await setupTests();
      const value = ethers.utils.parseUnits("100", 6);

      const handler = uniV3Handler.address;

      const data = (
        await ethers.getContractFactory("UniV3Handler")
      ).interface.encodeFunctionData("deposit(uint256)", [value]);

      await usdcToken
        .connect(usdcProviderAddress)
        .transfer(userSA.address, value);

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

      try {
        await strategyModule.execStrategy(
          userSA.address,
          transaction,
          signature,
          { value: fee }
        );
      } catch (error) {
        console.log(error);
      }
      const afterExecBalance = await usdcToken.balanceOf(userSA.address);
      console.log(afterExecBalance)
      expect(afterExecBalance).to.be.eq(value);
    });
  });
});
