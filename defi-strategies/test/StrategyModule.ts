import { expect } from "chai";
import { Contract } from "ethers";
import { AddressZero } from "@ethersproject/constants";
import { ethers, deployments, waffle } from "hardhat";
import {
  getEntryPoint,
  getEcdsaOwnershipRegistryModule,
  getSmartAccountWithModule,
  getStrategyModule,
} from "./utils/setupHelper";
import { makeEcdsaModuleUserOp } from "./utils/userOp";

let deployer;
let mockCaller;
describe("Strategy Factory", async () => {
  [deployer, mockCaller] = waffle.provider.getWallets();
  let strategyModule: Contract;
  let implementation: Contract;
  let strategyFactory: Contract;

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
        [await deployer.getAddress()]
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

    const userOp = await makeEcdsaModuleUserOp(
      "deployStrategyModule",
      [deployer.address, deployer.address, 0],
      userSA.address,
      deployer,
      entryPoint,
      ecdsaModule.address
    );

    await entryPoint.handleOps([userOp], mockCaller.address);

    implementation = await (
      await ethers.getContractFactory("StrategyModule")
    ).deploy();

    strategyFactory = await (
      await ethers.getContractFactory("StrategyModuleFactory")
    ).deploy(implementation.address);

    const expectedStrategyModuleAddress =
      await strategyFactory.getAddressForStrategyModule(
        deployer.address,
        deployer.address,
        0
      );

    await strategyFactory.deployStrategyModule(
      deployer.address,
      deployer.address,
      0
    );

    strategyModule = await ethers.getContractAt(
      "StrategyModule",
      expectedStrategyModuleAddress
    );

    return {
      factory: strategyFactory,
      implementation,
      strategyModule,
    };
  });

  describe("Strategy Factory", function () {
    it("should get creation code", async function () {
      const { factory } = await setupTests();

      expect((await factory.moduleCreationCode()).length).to.be.gt(0);
    });

    it("should revert to deploy with address zero", async function () {
      const fac = await ethers.getContractFactory("StrategyModuleFactory");
      await expect(fac.deploy(AddressZero)).to.be.reverted;
    });

    it("should revert to change implementation without admin access", async function () {
      const { factory } = await setupTests();

      await expect(
        factory.connect(mockCaller).updateImplementation(AddressZero)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("should revert to change implementation with zero address", async function () {
      const { factory } = await setupTests();

      await expect(
        factory.updateImplementation(AddressZero)
      ).to.be.revertedWith("InvalidAddress");
    });

    it("should revert to deploy strategy twice", async function () {
      const { factory } = await setupTests();

      await expect(
        factory.deployStrategyModule(deployer.address, deployer.address, 0)
      ).to.be.reverted;
    });

    it("should change implementation address", async function () {
      const { factory } = await setupTests();

      await factory.updateImplementation(mockCaller.address);
      expect(await factory.basicImplementation()).to.be.eq(mockCaller.address);
    });
  });

  describe("Strategy Module", function () {
    it("should revert to deploy module with address zero handler", async function () {
      const { factory } = await setupTests();

      await expect(
        factory.deployStrategyModule(AddressZero, deployer.address, 0)
      ).to.be.revertedWith("AddressCanNotBeZero");
    });

    it("should revert to deploy module with address zero beneficiary", async function () {
      const { factory } = await setupTests();

      await expect(
        factory.deployStrategyModule(deployer.address, AddressZero, 0)
      ).to.be.revertedWith("AddressCanNotBeZero");
    });

    it("should revert initialize already initialized module", async function () {
      const { strategyModule } = await setupTests();

      await expect(
        strategyModule.init(deployer.address, deployer.address)
      ).to.be.revertedWith("AlreadyInitialized");
    });

    it("should revert to claim accumulated fees by invalid caller", async function () {
      const { strategyModule } = await setupTests();

      await expect(
        strategyModule.connect(mockCaller).claim()
      ).to.be.revertedWith("NotAuthorized");
    });

    it("should claim fees by beneficiary", async function () {
      const { strategyModule } = await setupTests();

      await strategyModule.claim();
    });

    it("should supports IStrategyModule interface by ERC165", async function () {
      const { factory, strategyModule } = await setupTests();
      // 0xffe2fc80 IStrategyModule interface id
      expect(await strategyModule.supportsInterface(0xffe2fc80)).to.be.eq(true);
      expect(await strategyModule.supportsInterface(0xb626f144)).to.be.eq(
        false
      );
    });
  });

  describe("Proxy", function () {
    it("should revert to deploy proxy with address zero", async function () {
      const proxyFactory = await ethers.getContractFactory(
        "contracts/Proxy.sol:Proxy"
      );

      await expect(proxyFactory.deploy(AddressZero)).to.be.revertedWith(
        "InvalidAddress"
      );
    });
  });
});
