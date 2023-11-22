import { expect } from "chai";
import { Contract } from "ethers";
import { AddressZero } from "@ethersproject/constants";
import { ethers, deployments, waffle } from "hardhat";

describe("Execution Factory", async () => {
  const [deployer] = waffle.provider.getWallets();
  let executionModule: Contract;

  const setupTests = deployments.createFixture(async ({ deployments }) => {
    await deployments.fixture();

    executionModule = await (
      await ethers.getContractFactory("RecurringExecuteModule")
    ).deploy();

    return {
      executionModule,
    };
  });

  describe("Execution Module", function () {
    it("should supports IStrategyModule interface by ERC165", async function () {
      const { factory, strategyModule } = await setupTests();
      // 0xf8572868 IStrategyModule interface id
      expect(await strategyModule.supportsInterface(0xf8572868)).to.be.eq(true);
      expect(await strategyModule.supportsInterface(0xf8572867)).to.be.eq(
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
