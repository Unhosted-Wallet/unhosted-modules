import { expect } from "chai";
import { Contract } from "ethers";
import { AddressZero } from "@ethersproject/constants";
import { ethers, deployments, waffle } from "hardhat";
import { WRAPPED_NATIVE_TOKEN } from "../../defi-strategies/test/utils/constants_eth";
import {
  getEcdsaOwnershipRegistryModule,
  getEntryPoint,
  getSmartAccountWithModule,
} from "./utils/setupHelper";
import { makeEcdsaModuleUserOp, makeExecModuleUserOp } from "./utils/userOp";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("Execution Factory", async () => {
  const [deployer, smartAccountOwner, alice] = waffle.provider.getWallets();
  let executionModule: Contract;
  let WrappedETH: Contract;
  let mockExecutor: Contract;
  const now = async () => {
    return (await waffle.provider.getBlock("latest")).timestamp;
  };

  const setupTests = deployments.createFixture(async ({ deployments }) => {
    await deployments.fixture();

    mockExecutor = await (
      await ethers.getContractFactory("MockExecutor")
    ).deploy();

    WrappedETH = await (
      await ethers.getContractFactory("MockToken")
    ).attach(WRAPPED_NATIVE_TOKEN);

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

    executionModule = await (
      await ethers.getContractFactory("RecurringExecuteModule")
    ).deploy();

    const userOp = await makeEcdsaModuleUserOp(
      "enableModule",
      [executionModule.address],
      userSA.address,
      smartAccountOwner,
      entryPoint,
      ecdsaModule.address
    );

    await entryPoint.handleOps([userOp], alice.address);

    return {
      executionModule,
      ecdsaModule,
      userSA,
      entryPoint,
    };
  });

  describe("Execution Module", function () {
    it("Module is enabled", async () => {
      const { executionModule, userSA } = await setupTests();
      console.log(new Date((await now()) * 1000).toDateString());
      expect(await userSA.isModuleEnabled(executionModule.address)).to.equal(
        true
      );
    });

    it("should supports IRecurringExecuteModule interface by ERC165", async function () {
      const { executionModule } = await setupTests();
      await mockExecutor.checkInterface(executionModule.address);

      // 0x2ed5083c IRecurringExecuteModule interface id
      expect(await executionModule.supportsInterface(0x2ed5083c)).to.be.eq(
        true
      );
      expect(await executionModule.supportsInterface(0x2ed5083a)).to.be.eq(
        false
      );
    });

    it("Should revert to add with day zero", async () => {
      const { executionModule, ecdsaModule, userSA, entryPoint } =
        await setupTests();

      const value = ethers.utils.parseEther("1");
      const recurring = 0; // Daily
      const receiver = WrappedETH.address;
      const data = new ethers.utils.Interface([
        "function deposit()",
      ]).encodeFunctionData("deposit");
      const day = 0; // does not matter
      const sHour = 1;
      const eHour = 22;

      const execData = executionModule.interface.encodeFunctionData(
        "addRecurringExecution",
        [recurring, receiver, value, day, sHour, eHour, data]
      );

      const userOp = await makeEcdsaModuleUserOp(
        "execute",
        [executionModule.address, 0, execData],
        userSA.address,
        smartAccountOwner,
        entryPoint,
        ecdsaModule.address
      );

      await entryPoint.handleOps([userOp], alice.address);

      expect(
        (
          await executionModule.recurringExecution(
            userSA.address,
            WrappedETH.address
          )
        )[0]
      ).to.be.eq(0);
      expect(
        (
          await executionModule.recurringExecution(
            userSA.address,
            WrappedETH.address
          )
        )[1]
      ).to.be.eq(0);
      expect(
        (
          await executionModule.recurringExecution(
            userSA.address,
            WrappedETH.address
          )
        )[4]
      ).to.be.eq(0);
      expect(
        (
          await executionModule.recurringExecution(
            userSA.address,
            WrappedETH.address
          )
        )[5]
      ).to.be.eq(0);
    });

    it("Should revert to add monthly with day > 28", async () => {
      const { executionModule, ecdsaModule, userSA, entryPoint } =
        await setupTests();

      const value = ethers.utils.parseEther("1");
      const recurring = 2; // Monthly
      const receiver = WrappedETH.address;
      const data = new ethers.utils.Interface([
        "function deposit()",
      ]).encodeFunctionData("deposit");
      const day = 29; // does not matter
      const sHour = 1;
      const eHour = 22;

      const execData = executionModule.interface.encodeFunctionData(
        "addRecurringExecution",
        [recurring, receiver, value, day, sHour, eHour, data]
      );

      const userOp = await makeEcdsaModuleUserOp(
        "execute",
        [executionModule.address, 0, execData],
        userSA.address,
        smartAccountOwner,
        entryPoint,
        ecdsaModule.address
      );

      await entryPoint.handleOps([userOp], alice.address);

      expect(
        (
          await executionModule.recurringExecution(
            userSA.address,
            WrappedETH.address
          )
        )[0]
      ).to.be.eq(0);
      expect(
        (
          await executionModule.recurringExecution(
            userSA.address,
            WrappedETH.address
          )
        )[1]
      ).to.be.eq(0);
      expect(
        (
          await executionModule.recurringExecution(
            userSA.address,
            WrappedETH.address
          )
        )[4]
      ).to.be.eq(0);
      expect(
        (
          await executionModule.recurringExecution(
            userSA.address,
            WrappedETH.address
          )
        )[5]
      ).to.be.eq(0);
    });

    it("Should revert to add weekly with day > 7", async () => {
      const { executionModule, ecdsaModule, userSA, entryPoint } =
        await setupTests();

      const value = ethers.utils.parseEther("1");
      const recurring = 1; // Weekly
      const receiver = WrappedETH.address;
      const data = new ethers.utils.Interface([
        "function deposit()",
      ]).encodeFunctionData("deposit");
      const day = 8; // does not matter
      const sHour = 1;
      const eHour = 22;

      const execData = executionModule.interface.encodeFunctionData(
        "addRecurringExecution",
        [recurring, receiver, value, day, sHour, eHour, data]
      );

      const userOp = await makeEcdsaModuleUserOp(
        "execute",
        [executionModule.address, 0, execData],
        userSA.address,
        smartAccountOwner,
        entryPoint,
        ecdsaModule.address
      );

      await entryPoint.handleOps([userOp], alice.address);

      expect(
        (
          await executionModule.recurringExecution(
            userSA.address,
            WrappedETH.address
          )
        )[0]
      ).to.be.eq(0);
      expect(
        (
          await executionModule.recurringExecution(
            userSA.address,
            WrappedETH.address
          )
        )[1]
      ).to.be.eq(0);
      expect(
        (
          await executionModule.recurringExecution(
            userSA.address,
            WrappedETH.address
          )
        )[4]
      ).to.be.eq(0);
      expect(
        (
          await executionModule.recurringExecution(
            userSA.address,
            WrappedETH.address
          )
        )[5]
      ).to.be.eq(0);
    });

    it("Should revert to add if start hour is zero", async () => {
      const { executionModule, ecdsaModule, userSA, entryPoint } =
        await setupTests();

      const value = ethers.utils.parseEther("1");
      const recurring = 0; // Weekly
      const receiver = WrappedETH.address;
      const data = new ethers.utils.Interface([
        "function deposit()",
      ]).encodeFunctionData("deposit");
      const day = 8; // does not matter
      const sHour = 0;
      const eHour = 22;

      const execData = executionModule.interface.encodeFunctionData(
        "addRecurringExecution",
        [recurring, receiver, value, day, sHour, eHour, data]
      );

      const userOp = await makeEcdsaModuleUserOp(
        "execute",
        [executionModule.address, 0, execData],
        userSA.address,
        smartAccountOwner,
        entryPoint,
        ecdsaModule.address
      );

      await entryPoint.handleOps([userOp], alice.address);

      expect(
        (
          await executionModule.recurringExecution(
            userSA.address,
            WrappedETH.address
          )
        )[0]
      ).to.be.eq(0);
      expect(
        (
          await executionModule.recurringExecution(
            userSA.address,
            WrappedETH.address
          )
        )[1]
      ).to.be.eq(0);
      expect(
        (
          await executionModule.recurringExecution(
            userSA.address,
            WrappedETH.address
          )
        )[4]
      ).to.be.eq(0);
      expect(
        (
          await executionModule.recurringExecution(
            userSA.address,
            WrappedETH.address
          )
        )[5]
      ).to.be.eq(0);
    });

    it("Should revert to add if end hour > 22", async () => {
      const { executionModule, ecdsaModule, userSA, entryPoint } =
        await setupTests();

      const value = ethers.utils.parseEther("1");
      const recurring = 0; // Weekly
      const receiver = WrappedETH.address;
      const data = new ethers.utils.Interface([
        "function deposit()",
      ]).encodeFunctionData("deposit");
      const day = 8; // does not matter
      const sHour = 1;
      const eHour = 23;

      const execData = executionModule.interface.encodeFunctionData(
        "addRecurringExecution",
        [recurring, receiver, value, day, sHour, eHour, data]
      );

      const userOp = await makeEcdsaModuleUserOp(
        "execute",
        [executionModule.address, 0, execData],
        userSA.address,
        smartAccountOwner,
        entryPoint,
        ecdsaModule.address
      );

      await entryPoint.handleOps([userOp], alice.address);

      expect(
        (
          await executionModule.recurringExecution(
            userSA.address,
            WrappedETH.address
          )
        )[0]
      ).to.be.eq(0);
      expect(
        (
          await executionModule.recurringExecution(
            userSA.address,
            WrappedETH.address
          )
        )[1]
      ).to.be.eq(0);
      expect(
        (
          await executionModule.recurringExecution(
            userSA.address,
            WrappedETH.address
          )
        )[4]
      ).to.be.eq(0);
      expect(
        (
          await executionModule.recurringExecution(
            userSA.address,
            WrappedETH.address
          )
        )[5]
      ).to.be.eq(0);
    });

    it("Should revert to add if start hour >= end hour", async () => {
      const { executionModule, ecdsaModule, userSA, entryPoint } =
        await setupTests();

      const value = ethers.utils.parseEther("1");
      const recurring = 0; // Weekly
      const receiver = WrappedETH.address;
      const data = new ethers.utils.Interface([
        "function deposit()",
      ]).encodeFunctionData("deposit");
      const day = 8; // does not matter
      const sHour = 1;
      const eHour = 1;

      const execData = executionModule.interface.encodeFunctionData(
        "addRecurringExecution",
        [recurring, receiver, value, day, sHour, eHour, data]
      );

      const userOp = await makeEcdsaModuleUserOp(
        "execute",
        [executionModule.address, 0, execData],
        userSA.address,
        smartAccountOwner,
        entryPoint,
        ecdsaModule.address
      );

      await entryPoint.handleOps([userOp], alice.address);

      expect(
        (
          await executionModule.recurringExecution(
            userSA.address,
            WrappedETH.address
          )
        )[0]
      ).to.be.eq(0);
      expect(
        (
          await executionModule.recurringExecution(
            userSA.address,
            WrappedETH.address
          )
        )[1]
      ).to.be.eq(0);
      expect(
        (
          await executionModule.recurringExecution(
            userSA.address,
            WrappedETH.address
          )
        )[4]
      ).to.be.eq(0);
      expect(
        (
          await executionModule.recurringExecution(
            userSA.address,
            WrappedETH.address
          )
        )[5]
      ).to.be.eq(0);
    });

    it("Should add daily deposit to WETH contract", async () => {
      const { executionModule, ecdsaModule, userSA, entryPoint } =
        await setupTests();

      const value = ethers.utils.parseEther("1");
      const recurring = 0; // Daily
      const receiver = WrappedETH.address;
      const data = new ethers.utils.Interface([
        "function deposit()",
      ]).encodeFunctionData("deposit");
      const day = 1; // does not matter
      const sHour = 1;
      const eHour = 22;

      const execData = executionModule.interface.encodeFunctionData(
        "addRecurringExecution",
        [recurring, receiver, value, day, sHour, eHour, data]
      );

      const userOp = await makeEcdsaModuleUserOp(
        "execute",
        [executionModule.address, 0, execData],
        userSA.address,
        smartAccountOwner,
        entryPoint,
        ecdsaModule.address
      );

      await entryPoint.handleOps([userOp], alice.address);

      expect(
        (
          await executionModule.recurringExecution(
            userSA.address,
            WrappedETH.address
          )
        )[0]
      ).to.be.eq(0);
      expect(
        (
          await executionModule.recurringExecution(
            userSA.address,
            WrappedETH.address
          )
        )[1]
      ).to.be.eq(value);
      expect(
        (
          await executionModule.recurringExecution(
            userSA.address,
            WrappedETH.address
          )
        )[4]
      ).to.be.eq(sHour);
      expect(
        (
          await executionModule.recurringExecution(
            userSA.address,
            WrappedETH.address
          )
        )[5]
      ).to.be.eq(eHour);
    });

    it("Should remove after adding daily deposit to WETH contract", async () => {
      const { executionModule, ecdsaModule, userSA, entryPoint } =
        await setupTests();

      const value = ethers.utils.parseEther("1");
      const recurring = 0; // Daily
      const receiver = WrappedETH.address;
      const data = new ethers.utils.Interface([
        "function deposit()",
      ]).encodeFunctionData("deposit");
      const day = 1; // does not matter
      const sHour = 1;
      const eHour = 22;

      let execData = executionModule.interface.encodeFunctionData(
        "addRecurringExecution",
        [recurring, receiver, value, day, sHour, eHour, data]
      );

      let userOp = await makeEcdsaModuleUserOp(
        "execute",
        [executionModule.address, 0, execData],
        userSA.address,
        smartAccountOwner,
        entryPoint,
        ecdsaModule.address
      );

      await entryPoint.handleOps([userOp], alice.address);

      execData = executionModule.interface.encodeFunctionData(
        "removeRecurringExecution",
        [receiver]
      );

      userOp = await makeEcdsaModuleUserOp(
        "execute",
        [executionModule.address, 0, execData],
        userSA.address,
        smartAccountOwner,
        entryPoint,
        ecdsaModule.address
      );

      await entryPoint.handleOps([userOp], alice.address);

      expect(
        (
          await executionModule.recurringExecution(
            userSA.address,
            WrappedETH.address
          )
        )[0]
      ).to.be.eq(0);
      expect(
        (
          await executionModule.recurringExecution(
            userSA.address,
            WrappedETH.address
          )
        )[1]
      ).to.be.eq(0);
      expect(
        (
          await executionModule.recurringExecution(
            userSA.address,
            WrappedETH.address
          )
        )[4]
      ).to.be.eq(0);
      expect(
        (
          await executionModule.recurringExecution(
            userSA.address,
            WrappedETH.address
          )
        )[5]
      ).to.be.eq(0);
    });

    it("Should add daily deposit to WETH contract and execute", async () => {
      const { executionModule, ecdsaModule, userSA, entryPoint } =
        await setupTests();

      const value = ethers.utils.parseEther("1");
      const recurring = 0; // Daily
      const receiver = WrappedETH.address;
      const data = new ethers.utils.Interface([
        "function deposit()",
      ]).encodeFunctionData("deposit");
      const day = 1; // does not matter
      const sHour = 16;
      const eHour = 17;

      const execData = executionModule.interface.encodeFunctionData(
        "addRecurringExecution",
        [recurring, receiver, value, day, sHour, eHour, data]
      );

      const userOp = await makeEcdsaModuleUserOp(
        "execute",
        [executionModule.address, 0, execData],
        userSA.address,
        smartAccountOwner,
        entryPoint,
        ecdsaModule.address
      );

      await entryPoint.handleOps([userOp], alice.address);

      const beforeExec = await waffle.provider.getBalance(userSA.address);

      await executionModule.executeRecurringExecution(
        userSA.address,
        WrappedETH.address
      );

      const afterExec = await waffle.provider.getBalance(userSA.address);

      expect(await WrappedETH.balanceOf(userSA.address)).to.be.eq(value);
      expect(beforeExec.sub(afterExec)).to.be.eq(value);

      await time.increase(3600 * 24); // pass one day
      await executionModule.executeRecurringExecution(
        userSA.address,
        WrappedETH.address
      );

      expect(await WrappedETH.balanceOf(userSA.address)).to.be.eq(value.mul(2));

      await time.increase(3600 * 24 * 30); // pass one month

      await executionModule.executeRecurringExecution(
        userSA.address,
        WrappedETH.address
      );

      expect(await WrappedETH.balanceOf(userSA.address)).to.be.eq(value.mul(3));

      await time.increase(3600 * 24 * 30 * 12); // pass one year

      await executionModule.executeRecurringExecution(
        userSA.address,
        WrappedETH.address
      );

      expect(await WrappedETH.balanceOf(userSA.address)).to.be.eq(value.mul(4));
    });

    it("Should add weekly deposit to WETH contract and execute", async () => {
      const { executionModule, ecdsaModule, userSA, entryPoint } =
        await setupTests();

      const value = ethers.utils.parseEther("1");
      const recurring = 1; // Weekly
      const receiver = WrappedETH.address;
      const data = new ethers.utils.Interface([
        "function deposit()",
      ]).encodeFunctionData("deposit");
      const day = 3; // does not matter
      const sHour = 16;
      const eHour = 17;

      const execData = executionModule.interface.encodeFunctionData(
        "addRecurringExecution",
        [recurring, receiver, value, day, sHour, eHour, data]
      );

      const userOp = await makeEcdsaModuleUserOp(
        "execute",
        [executionModule.address, 0, execData],
        userSA.address,
        smartAccountOwner,
        entryPoint,
        ecdsaModule.address
      );

      await entryPoint.handleOps([userOp], alice.address);

      const beforeExec = await waffle.provider.getBalance(userSA.address);

      await executionModule.executeRecurringExecution(
        userSA.address,
        WrappedETH.address
      );

      const afterExec = await waffle.provider.getBalance(userSA.address);

      expect(await WrappedETH.balanceOf(userSA.address)).to.be.eq(value);
      expect(beforeExec.sub(afterExec)).to.be.eq(value);

      await time.increase(3600 * 24 * 7); // pass one week
      await executionModule.executeRecurringExecution(
        userSA.address,
        WrappedETH.address
      );

      expect(await WrappedETH.balanceOf(userSA.address)).to.be.eq(value.mul(2));

      await time.increase(3600 * 24 * 7 * 4); // pass one month

      await executionModule.executeRecurringExecution(
        userSA.address,
        WrappedETH.address
      );

      expect(await WrappedETH.balanceOf(userSA.address)).to.be.eq(value.mul(3));

      await time.increase(3600 * 24 * 7 * 4 * 12); // pass one year
      await executionModule.executeRecurringExecution(
        userSA.address,
        WrappedETH.address
      );

      expect(await WrappedETH.balanceOf(userSA.address)).to.be.eq(value.mul(4));

      await time.increase(3600 * 24 * 7); // pass one week

      await executionModule.executeRecurringExecution(
        userSA.address,
        WrappedETH.address
      );

      expect(await WrappedETH.balanceOf(userSA.address)).to.be.eq(value.mul(5));
    });

    it("Should add monthly deposit to WETH contract and execute", async () => {
      const { executionModule, ecdsaModule, userSA, entryPoint } =
        await setupTests();

      const value = ethers.utils.parseEther("1");
      const recurring = 2; // Monthly
      const receiver = WrappedETH.address;
      const data = new ethers.utils.Interface([
        "function deposit()",
      ]).encodeFunctionData("deposit");
      const day = 27; // does not matter
      const sHour = 16;
      const eHour = 17;

      const execData = executionModule.interface.encodeFunctionData(
        "addRecurringExecution",
        [recurring, receiver, value, day, sHour, eHour, data]
      );

      const userOp = await makeEcdsaModuleUserOp(
        "execute",
        [executionModule.address, 0, execData],
        userSA.address,
        smartAccountOwner,
        entryPoint,
        ecdsaModule.address
      );

      await entryPoint.handleOps([userOp], alice.address);

      const beforeExec = await waffle.provider.getBalance(userSA.address);

      await executionModule.executeRecurringExecution(
        userSA.address,
        WrappedETH.address
      );

      const afterExec = await waffle.provider.getBalance(userSA.address);

      expect(await WrappedETH.balanceOf(userSA.address)).to.be.eq(value);
      expect(beforeExec.sub(afterExec)).to.be.eq(value);

      await time.increase(3600 * 24 * 30); // pass one month

      await executionModule.executeRecurringExecution(
        userSA.address,
        WrappedETH.address
      );

      expect(await WrappedETH.balanceOf(userSA.address)).to.be.eq(value.mul(2));

      await time.increase(3600 * 24 * 30 * 12); // pass one year
      await time.increase(3600 * 24 * 6); // pass 5 day to get to 27

      await executionModule.executeRecurringExecution(
        userSA.address,
        WrappedETH.address
      );

      expect(await WrappedETH.balanceOf(userSA.address)).to.be.eq(value.mul(3));
    });

    it("Should revert to execute with wrong address", async () => {
      const { executionModule, ecdsaModule, userSA, entryPoint } =
        await setupTests();

      await expect(
        executionModule.executeRecurringExecution(
          AddressZero,
          WrappedETH.address
        )
      ).to.be.revertedWith("InvalidAddress");

      await expect(
        executionModule.executeRecurringExecution(userSA.address, AddressZero)
      ).to.be.revertedWith("InvalidAddress");
    });

    it("Should revert to execute without recurring transfer", async () => {
      const { executionModule, userSA } = await setupTests();

      await expect(
        executionModule.executeRecurringExecution(
          userSA.address,
          WrappedETH.address
        )
      ).to.be.revertedWith("NoRecurringExecution");
    });

    it("Should revert to execute daily out of hour", async () => {
      const { executionModule, ecdsaModule, userSA, entryPoint } =
        await setupTests();

      const value = ethers.utils.parseEther("1");
      const recurring = 0; // Daily
      const receiver = WrappedETH.address;
      const data = new ethers.utils.Interface([
        "function deposit()",
      ]).encodeFunctionData("deposit");
      const day = 1; // does not matter
      const sHour = 16;
      const eHour = 17;

      const execData = executionModule.interface.encodeFunctionData(
        "addRecurringExecution",
        [recurring, receiver, value, day, sHour, eHour, data]
      );

      const userOp = await makeEcdsaModuleUserOp(
        "execute",
        [executionModule.address, 0, execData],
        userSA.address,
        smartAccountOwner,
        entryPoint,
        ecdsaModule.address
      );

      await entryPoint.handleOps([userOp], alice.address);

      await time.increase(3600);

      await expect(
        executionModule.executeRecurringExecution(
          userSA.address,
          WrappedETH.address
        )
      ).to.be.revertedWith("InvalidDailyExecution");
    });

    it("Should revert to execute already executed daily", async () => {
      const { executionModule, ecdsaModule, userSA, entryPoint } =
        await setupTests();

      const value = ethers.utils.parseEther("1");
      const recurring = 0; // Daily
      const receiver = WrappedETH.address;
      const data = new ethers.utils.Interface([
        "function deposit()",
      ]).encodeFunctionData("deposit");
      const day = 1; // does not matter
      const sHour = 16;
      const eHour = 17;

      const execData = executionModule.interface.encodeFunctionData(
        "addRecurringExecution",
        [recurring, receiver, value, day, sHour, eHour, data]
      );

      const userOp = await makeEcdsaModuleUserOp(
        "execute",
        [executionModule.address, 0, execData],
        userSA.address,
        smartAccountOwner,
        entryPoint,
        ecdsaModule.address
      );

      await entryPoint.handleOps([userOp], alice.address);

      await executionModule.executeRecurringExecution(
        userSA.address,
        WrappedETH.address
      );

      await expect(
        executionModule.executeRecurringExecution(
          userSA.address,
          WrappedETH.address
        )
      ).to.be.revertedWith("InvalidDailyExecution");
    });

    it("Should revert to execute weekly out of hour", async () => {
      const { executionModule, ecdsaModule, userSA, entryPoint } =
        await setupTests();

      const value = ethers.utils.parseEther("1");
      const recurring = 1; // Weekly
      const receiver = WrappedETH.address;
      const data = new ethers.utils.Interface([
        "function deposit()",
      ]).encodeFunctionData("deposit");
      const day = 3; // does not matter
      const sHour = 16;
      const eHour = 17;

      const execData = executionModule.interface.encodeFunctionData(
        "addRecurringExecution",
        [recurring, receiver, value, day, sHour, eHour, data]
      );

      const userOp = await makeEcdsaModuleUserOp(
        "execute",
        [executionModule.address, 0, execData],
        userSA.address,
        smartAccountOwner,
        entryPoint,
        ecdsaModule.address
      );

      await entryPoint.handleOps([userOp], alice.address);

      await time.increase(3600);

      await expect(
        executionModule.executeRecurringExecution(
          userSA.address,
          WrappedETH.address
        )
      ).to.be.revertedWith("InvalidWeeklyExecution");
    });

    it("Should revert to execute already executed weekly", async () => {
      const { executionModule, ecdsaModule, userSA, entryPoint } =
        await setupTests();

      const value = ethers.utils.parseEther("1");
      const recurring = 1; // Daily
      const receiver = WrappedETH.address;
      const data = new ethers.utils.Interface([
        "function deposit()",
      ]).encodeFunctionData("deposit");
      const day = 3; // does not matter
      const sHour = 16;
      const eHour = 17;

      const execData = executionModule.interface.encodeFunctionData(
        "addRecurringExecution",
        [recurring, receiver, value, day, sHour, eHour, data]
      );

      const userOp = await makeEcdsaModuleUserOp(
        "execute",
        [executionModule.address, 0, execData],
        userSA.address,
        smartAccountOwner,
        entryPoint,
        ecdsaModule.address
      );

      await entryPoint.handleOps([userOp], alice.address);

      await executionModule.executeRecurringExecution(
        userSA.address,
        WrappedETH.address
      );

      await expect(
        executionModule.executeRecurringExecution(
          userSA.address,
          WrappedETH.address
        )
      ).to.be.revertedWith("InvalidWeeklyExecution");
    });

    it("Should revert to execute monthly out of hour", async () => {
      const { executionModule, ecdsaModule, userSA, entryPoint } =
        await setupTests();

      const value = ethers.utils.parseEther("1");
      const recurring = 2; // Monthly
      const receiver = WrappedETH.address;
      const data = new ethers.utils.Interface([
        "function deposit()",
      ]).encodeFunctionData("deposit");
      const day = 27; // does not matter
      const sHour = 16;
      const eHour = 17;

      const execData = executionModule.interface.encodeFunctionData(
        "addRecurringExecution",
        [recurring, receiver, value, day, sHour, eHour, data]
      );

      const userOp = await makeEcdsaModuleUserOp(
        "execute",
        [executionModule.address, 0, execData],
        userSA.address,
        smartAccountOwner,
        entryPoint,
        ecdsaModule.address
      );

      await entryPoint.handleOps([userOp], alice.address);

      await time.increase(3600);

      await expect(
        executionModule.executeRecurringExecution(
          userSA.address,
          WrappedETH.address
        )
      ).to.be.revertedWith("InvalidMonthlyExecution");
    });

    it("Should revert to execute already executed monthly", async () => {
      const { executionModule, ecdsaModule, userSA, entryPoint } =
        await setupTests();

      const value = ethers.utils.parseEther("1");
      const recurring = 2; // Monthly
      const receiver = WrappedETH.address;
      const data = new ethers.utils.Interface([
        "function deposit()",
      ]).encodeFunctionData("deposit");
      const day = 27; // does not matter
      const sHour = 16;
      const eHour = 17;

      const execData = executionModule.interface.encodeFunctionData(
        "addRecurringExecution",
        [recurring, receiver, value, day, sHour, eHour, data]
      );

      const userOp = await makeEcdsaModuleUserOp(
        "execute",
        [executionModule.address, 0, execData],
        userSA.address,
        smartAccountOwner,
        entryPoint,
        ecdsaModule.address
      );

      await entryPoint.handleOps([userOp], alice.address);

      await executionModule.executeRecurringExecution(
        userSA.address,
        WrappedETH.address
      );

      await expect(
        executionModule.executeRecurringExecution(
          userSA.address,
          WrappedETH.address
        )
      ).to.be.revertedWith("InvalidMonthlyExecution");
    });

    it("Should revert to reEnter execution", async () => {
      const { executionModule, ecdsaModule, userSA, entryPoint } =
        await setupTests();

      const value = 0;
      const recurring = 0; // Daily
      const receiver = mockExecutor.address;
      const data = new ethers.utils.Interface([
        "function reEnter(address,address,address)",
      ]).encodeFunctionData("reEnter", [
        executionModule.address,
        userSA.address,
        mockExecutor.address,
      ]);
      const day = 1; // does not matter
      const sHour = 16;
      const eHour = 17;

      const execData = executionModule.interface.encodeFunctionData(
        "addRecurringExecution",
        [recurring, receiver, value, day, sHour, eHour, data]
      );

      const userOp = await makeEcdsaModuleUserOp(
        "execute",
        [executionModule.address, 0, execData],
        userSA.address,
        smartAccountOwner,
        entryPoint,
        ecdsaModule.address
      );

      await entryPoint.handleOps([userOp], alice.address);

      await expect(
        executionModule.executeRecurringExecution(
          userSA.address,
          mockExecutor.address
        )
      ).not.to.be.reverted;
    });
  });
});
