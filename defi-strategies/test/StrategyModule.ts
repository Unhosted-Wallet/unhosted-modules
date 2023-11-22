import { expect } from "chai";
import { Contract } from "ethers";
import { AddressZero } from "@ethersproject/constants";
import { ethers, deployments, waffle } from "hardhat";

let deployer;
let mockCaller;
describe("Strategy Factory", async () => {
  [deployer, mockCaller] = waffle.provider.getWallets();
  let strategyModule: Contract;
  let implementation: Contract;
  let strategyFactory: Contract;
  let mockFeed: Contract;

  const setupTests = deployments.createFixture(async ({ deployments }) => {
    await deployments.fixture();

    mockFeed = await (
      await ethers.getContractFactory("MockAggregatorV3")
    ).deploy("20000000000");

    implementation = await (
      await ethers.getContractFactory("StrategyModule")
    ).deploy(mockFeed.address);

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

    it("should revert to deploy strategy twice", async function () {
      const { factory } = await setupTests();

      await expect(
        factory.deployStrategyModule(deployer.address, deployer.address, 0)
      ).to.be.revertedWith("Create2 call failed");
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
      // 0xb626f145 IStrategyModule interface id
      expect(await strategyModule.supportsInterface(0xb626f145)).to.be.eq(true);
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
        "Invalid implementation address"
      );
    });
  });
});
