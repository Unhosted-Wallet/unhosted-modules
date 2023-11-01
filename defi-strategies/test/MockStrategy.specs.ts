import { expect } from "chai";
import { Contract } from "ethers";
import { decodeError } from "ethers-decode-error";
import { ethers, deployments, waffle } from "hardhat";
import { buildEcdsaModuleAuthorizedStrategyTx } from "./utils/execution";
import { makeEcdsaModuleUserOp } from "./utils/userOp";

import {
  getEntryPoint,
  getEcdsaOwnershipRegistryModule,
  getSmartAccountWithModule,
  getStrategyModule,
} from "./utils/setupHelper";

describe("Mock Handler", async () => {
  const [deployer, smartAccountOwner, alice] = waffle.provider.getWallets();
  let strategyModule: Contract;
  let mockHandler: Contract;
  let fee: any;

  const setupTests = deployments.createFixture(async ({ deployments }) => {
    await deployments.fixture();

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

    mockHandler = await (
      await ethers.getContractFactory("MockHandler")
    ).deploy();

    strategyModule = await getStrategyModule(
      alice.address,
      mockHandler.address,
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
    };
  });

  it("Should revert if anyone but owner sign the tx", async function () {
    const { userSA, ecdsaModule } = await setupTests();
    const value = ethers.utils.parseEther("1");
    const handler = mockHandler.address;

    const data = (
      await ethers.getContractFactory("MockHandler")
    ).interface.encodeFunctionData("reEnter(address)", [
      strategyModule.address,
    ]);

    const { transaction, signature } =
      await buildEcdsaModuleAuthorizedStrategyTx(
        handler,
        data,
        userSA,
        alice,
        ecdsaModule.address,
        strategyModule,
        value.toString()
      );

    const data1 = strategyModule.interface.encodeFunctionData("execStrategy", [
      userSA.address,
      transaction,
      signature,
    ]);

    const txRes = await waffle.provider.call({
      to: strategyModule.address,
      data: data1,
      value: fee,
    });

    expect(txRes).to.be.eq(
      ethers.utils.id("InvalidSignature()").substring(0, 10)
    );
  });

  it("Should revert if handler tried to reEnter the strategy module", async function () {
    const { userSA, ecdsaModule } = await setupTests();
    const value = ethers.utils.parseEther("1");
    const handler = mockHandler.address;

    const data = (
      await ethers.getContractFactory("MockHandler")
    ).interface.encodeFunctionData("reEnter(address)", [
      strategyModule.address,
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
      await strategyModule.execStrategy(userSA.address, transaction, signature);
    } catch (err) {
      const { error } = decodeError(err);
      expect(error).to.be.eq("Empty error data returned");
    }
  });

  it("Should get the transaction hash", async function () {
    const { userSA, ecdsaModule } = await setupTests();
    const handler = mockHandler.address;

    const data = (
      await ethers.getContractFactory("MockHandler")
    ).interface.encodeFunctionData("reEnter(address)", [
      strategyModule.address,
    ]);

    const { transaction } = await buildEcdsaModuleAuthorizedStrategyTx(
      handler,
      data,
      userSA,
      smartAccountOwner,
      ecdsaModule.address,
      strategyModule,
      0
    );

    const res = await strategyModule.getTransactionHash(
      transaction,
      0,
      userSA.address
    );

    const expectRes = await strategyModule.encodeStrategyData(
      userSA.address,
      transaction,
      0
    );

    expect(ethers.utils.keccak256(expectRes)).to.be.eq(res);
  });

  it("Should get the transaction hash", async function () {
    const { userSA, ecdsaModule } = await setupTests();
    const handler = mockHandler.address;

    const data = (
      await ethers.getContractFactory("MockHandler")
    ).interface.encodeFunctionData("checkInterface(address)", [
      strategyModule.address,
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

    const data1 = strategyModule.interface.encodeFunctionData("execStrategy", [
      userSA.address,
      transaction,
      signature,
    ]);

    await waffle.provider.call({
      to: strategyModule.address,
      data: data1,
      value: fee,
    });
  });
});
