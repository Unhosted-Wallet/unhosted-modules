import { expect } from "chai";
import { Contract } from "ethers";
import { decodeError } from "ethers-decode-error";
import hardhat, { ethers, deployments, waffle } from "hardhat";
import {
  buildEcdsaModuleAuthorizedStrategyTx,
  callExecStrategy,
} from "./utils/execution";
import { makeEcdsaModuleUserOp } from "./utils/userOp";
import { LIDO_PROXY, LIDO_REFERRAL_ADDRESS } from "./utils/constants_eth";
import { MAX_UINT256 } from "./utils/constants";

import {
  getEntryPoint,
  getEcdsaOwnershipRegistryModule,
  getSmartAccountWithModule,
  getStrategyModule,
} from "./utils/setupHelper";

describe("Lido Finance", async () => {
  const chainId = hardhat.network.config.chainId;
  if (chainId === 1) {
    // This test supports to run on these chains.
  } else {
    return;
  }
  const [deployer, smartAccountOwner, alice] = waffle.provider.getWallets();
  let strategyModule: Contract;
  let lidoHandler: Contract;
  let stETH: Contract;
  let fee: any;
  const gasPrice = ethers.utils.parseUnits("30", 9);

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

    stETH = await (
      await ethers.getContractFactory("MockToken")
    ).attach(LIDO_PROXY);

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

    lidoHandler = await (
      await ethers.getContractFactory("LidoHandler")
    ).deploy(LIDO_PROXY, LIDO_REFERRAL_ADDRESS);

    strategyModule = await getStrategyModule(
      alice.address,
      lidoHandler.address,
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

  describe("Submit", function () {
    it("normal", async function () {
      const { userSA, ecdsaModule, errAbi } = await setupTests();
      const value = ethers.utils.parseEther("1");
      const handler = lidoHandler.address;

      const data = (
        await ethers.getContractFactory("LidoHandler")
      ).interface.encodeFunctionData("submit(uint256)", [value]);

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

      const beforeExecBalance = await stETH.balanceOf(userSA.address);

      try {
        await strategyModule.requiredTxGas(userSA.address, transaction);
      } catch (error) {
        fee = decodeError(error, errAbi).args;
        fee = fee[0].mul(gasPrice);
      }

      const execRes = await callExecStrategy(
        strategyModule,
        [userSA.address, transaction, signature],
        ["uint256"]
      );

      const afterExecBalance = await stETH.balanceOf(userSA.address);

      expect(afterExecBalance.sub(beforeExecBalance)).to.be.eq(execRes[0]);

      expect(afterExecBalance.sub(beforeExecBalance)).to.be.within(
        value.sub(10),
        value
      );

      expect(await stETH.balanceOf(strategyModule.address)).to.be.eq(0);
    });
  });
});
