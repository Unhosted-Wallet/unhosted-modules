import { expect } from "chai";
import { Contract } from "ethers";
import { decodeError } from "ethers-decode-error";
import hardhat, { ethers, deployments, waffle } from "hardhat";
import {
  buildEcdsaModuleAuthorizedStrategyTx,
  call,
  callExecStrategy,
} from "./utils/execution";
import { makeEcdsaModuleUserOp } from "./utils/userOp";
import {
  WRAPPED_NATIVE_TOKEN,
  UNISWAPV3_ROUTER,
  UNISWAPV3_QUOTER,
  DAI_TOKEN,
  USDT_TOKEN,
} from "./utils/constants_eth";
import { MAX_UINT256 } from "./utils/constants";

import {
  getEntryPoint,
  getEcdsaOwnershipRegistryModule,
  getSmartAccountWithModule,
  getStrategyModule,
} from "./utils/setupHelper";
import { getTokenProvider } from "./utils/providers";

describe("Uniswap V3", async () => {
  const chainId = hardhat.network.config.chainId;
  if (chainId === 1) {
    // This test supports to run on these chains.
  } else {
    return;
  }
  const [deployer, smartAccountOwner, alice] = waffle.provider.getWallets();
  let strategyModule: Contract;
  let uniV3handler: Contract;
  let WrappedETH: Contract;
  let token: Contract;
  let token2: Contract;
  let quoter: Contract;
  let providerAddress: any;
  let wethProviderAddress: any;
  let fee: any;

  const encodePath = (path: any, fees: any) => {
    if (path.length !== fees.length + 1) {
      throw new Error("path/fee lengths do not match");
    }
    let encoded = "0x";
    for (let i = 0; i < fees.length; i++) {
      // 20 byte encoding of the address
      encoded += path[i].slice(2);
      // 3 byte encoding of the fee
      encoded += Number(fees[i]).toString(16).padStart(6, "0");
    }
    // encode the final token
    encoded += path[path.length - 1].slice(2);

    return encoded.toLowerCase();
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

    quoter = await ethers.getContractAt("IQuoter", UNISWAPV3_QUOTER);

    WrappedETH = await (
      await ethers.getContractFactory("MockToken")
    ).attach(WRAPPED_NATIVE_TOKEN);

    token = await (
      await ethers.getContractFactory("MockToken")
    ).attach(DAI_TOKEN);

    token2 = await (
      await ethers.getContractFactory("MockToken")
    ).attach(USDT_TOKEN);

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

    uniV3handler = await (
      await ethers.getContractFactory("UniswapV3Handler")
    ).deploy(WRAPPED_NATIVE_TOKEN);

    strategyModule = await getStrategyModule(
      alice.address,
      uniV3handler.address,
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

  describe("Exact input", function () {
    describe("Single path", function () {
      describe("Ether in", function () {
        it("normal", async function () {
          const { userSA, ecdsaModule, errAbi } = await setupTests();
          const value = ethers.utils.parseEther("1");
          const handler = uniV3handler.address;
          const tokenIn = WrappedETH.address;
          const tokenOut = token.address;
          const fee2 = ethers.BigNumber.from("3000");
          const amountIn = value;
          const amountOutMinimum = ethers.BigNumber.from("1");
          const sqrtPriceLimitX96 = ethers.BigNumber.from("0");

          const res = await call(
            quoter,
            "quoteExactInputSingle",
            [tokenIn, tokenOut, fee2, amountIn, sqrtPriceLimitX96],
            ["uint256"]
          );

          const data = (
            await ethers.getContractFactory("UniswapV3Handler")
          ).interface.encodeFunctionData(
            "exactInputSingleFromEther(address,uint24,uint256,uint256,uint160)",
            [tokenOut, fee2, amountIn, amountOutMinimum, sqrtPriceLimitX96]
          );

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

          expect(beforeExecBalance.sub(afterExecBalance)).to.be.eq(value);

          expect(execRes[0]).to.be.eq(res[0]);

          expect(await token.balanceOf(userSA.address)).to.be.eq(
            ethers.BigNumber.from(`${res}`)
          );

          expect(await token.balanceOf(strategyModule.address)).to.be.eq(0);

          expect(
            await waffle.provider.getBalance(strategyModule.address)
          ).to.be.eq(0);
        });

        it("max amount", async function () {
          const { userSA, ecdsaModule, errAbi } = await setupTests();
          const value = await waffle.provider.getBalance(userSA.address);
          const handler = uniV3handler.address;
          const tokenIn = WrappedETH.address;
          const tokenOut = token.address;
          const fee2 = ethers.BigNumber.from("3000");
          const amountIn = value;
          const amountOutMinimum = ethers.BigNumber.from("1");
          const sqrtPriceLimitX96 = ethers.BigNumber.from("0");

          const res = await call(
            quoter,
            "quoteExactInputSingle",
            [tokenIn, tokenOut, fee2, amountIn, sqrtPriceLimitX96],
            ["uint256"]
          );

          const data = (
            await ethers.getContractFactory("UniswapV3Handler")
          ).interface.encodeFunctionData(
            "exactInputSingleFromEther(address,uint24,uint256,uint256,uint160)",
            [tokenOut, fee2, MAX_UINT256, amountOutMinimum, sqrtPriceLimitX96]
          );

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

          expect(execRes[0]).to.be.eq(res[0]);

          expect(beforeExecBalance.sub(afterExecBalance)).to.be.eq(
            beforeExecBalance
          );

          expect(await token.balanceOf(userSA.address)).to.be.eq(
            ethers.BigNumber.from(`${res}`)
          );

          expect(await token.balanceOf(strategyModule.address)).to.be.eq(0);

          expect(
            await waffle.provider.getBalance(strategyModule.address)
          ).to.be.eq(0);
        });
      });

      describe("Ether out", function () {
        it("normal", async function () {
          const { userSA, ecdsaModule, errAbi } = await setupTests();
          const value = ethers.utils.parseEther("1");
          const handler = uniV3handler.address;
          const tokenIn = token.address;
          const tokenOut = WrappedETH.address;
          const fee2 = ethers.BigNumber.from("3000");
          const amountIn = value;
          const amountOutMinimum = ethers.BigNumber.from("1");
          const sqrtPriceLimitX96 = ethers.BigNumber.from("0");

          await token
            .connect(providerAddress)
            .transfer(userSA.address, amountIn);

          const res = await call(
            quoter,
            "quoteExactInputSingle",
            [tokenIn, tokenOut, fee2, amountIn, sqrtPriceLimitX96],
            ["uint256"]
          );

          const data = (
            await ethers.getContractFactory("UniswapV3Handler")
          ).interface.encodeFunctionData(
            "exactInputSingleToEther(address,uint24,uint256,uint256,uint160)",
            [tokenIn, fee2, amountIn, amountOutMinimum, sqrtPriceLimitX96]
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

          const beforeExecBalance = await token.balanceOf(userSA.address);

          const ethBeforeExecBalance = await waffle.provider.getBalance(
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

          const afterExecBalance = await token.balanceOf(userSA.address);

          const ethAfterExecBalance = await waffle.provider.getBalance(
            userSA.address
          );

          expect(execRes[0]).to.be.eq(res[0]);

          expect(beforeExecBalance.sub(afterExecBalance)).to.be.eq(value);

          expect(ethAfterExecBalance.sub(ethBeforeExecBalance)).to.be.eq(
            ethers.BigNumber.from(`${res}`)
          );

          expect(await token.balanceOf(strategyModule.address)).to.be.eq(0);

          expect(
            await waffle.provider.getBalance(strategyModule.address)
          ).to.be.eq(0);
        });

        it("max amount", async function () {
          const { userSA, ecdsaModule, errAbi } = await setupTests();
          const value = ethers.utils.parseEther("1");
          const handler = uniV3handler.address;
          const tokenIn = token.address;
          const tokenOut = WrappedETH.address;
          const fee2 = ethers.BigNumber.from("3000");
          const amountIn = value;
          const amountOutMinimum = ethers.BigNumber.from("1");
          const sqrtPriceLimitX96 = ethers.BigNumber.from("0");

          await token
            .connect(providerAddress)
            .transfer(userSA.address, amountIn);

          const res = await call(
            quoter,
            "quoteExactInputSingle",
            [tokenIn, tokenOut, fee2, amountIn, sqrtPriceLimitX96],
            ["uint256"]
          );

          const data = (
            await ethers.getContractFactory("UniswapV3Handler")
          ).interface.encodeFunctionData(
            "exactInputSingleToEther(address,uint24,uint256,uint256,uint160)",
            [tokenIn, fee2, MAX_UINT256, amountOutMinimum, sqrtPriceLimitX96]
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

          const beforeExecBalance = await token.balanceOf(userSA.address);

          const ethBeforeExecBalance = await waffle.provider.getBalance(
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

          const afterExecBalance = await token.balanceOf(userSA.address);

          const ethAfterExecBalance = await waffle.provider.getBalance(
            userSA.address
          );

          expect(execRes[0]).to.be.eq(res[0]);

          expect(beforeExecBalance.sub(afterExecBalance)).to.be.eq(
            beforeExecBalance
          );

          expect(ethAfterExecBalance.sub(ethBeforeExecBalance)).to.be.eq(
            ethers.BigNumber.from(`${res}`)
          );

          expect(await token.balanceOf(strategyModule.address)).to.be.eq(0);

          expect(
            await waffle.provider.getBalance(strategyModule.address)
          ).to.be.eq(0);
        });
      });

      describe("Token only", function () {
        it("normal", async function () {
          const { userSA, ecdsaModule, errAbi } = await setupTests();
          const value = ethers.utils.parseEther("1");
          const handler = uniV3handler.address;
          const tokenIn = token.address;
          const tokenOut = WrappedETH.address;
          const fee2 = ethers.BigNumber.from("3000");
          const amountIn = value;
          const amountOutMinimum = ethers.BigNumber.from("1");
          const sqrtPriceLimitX96 = ethers.BigNumber.from("0");

          await token
            .connect(providerAddress)
            .transfer(userSA.address, amountIn);

          const res = await call(
            quoter,
            "quoteExactInputSingle",
            [tokenIn, tokenOut, fee2, amountIn, sqrtPriceLimitX96],
            ["uint256"]
          );

          const data = (
            await ethers.getContractFactory("UniswapV3Handler")
          ).interface.encodeFunctionData(
            "exactInputSingle(address,address,uint24,uint256,uint256,uint160)",
            [
              tokenIn,
              tokenOut,
              fee2,
              amountIn,
              amountOutMinimum,
              sqrtPriceLimitX96,
            ]
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

          const beforeExecBalance = await token.balanceOf(userSA.address);

          const wethBeforeExecBalance = await WrappedETH.balanceOf(
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

          const afterExecBalance = await token.balanceOf(userSA.address);

          const wethAfterExecBalance = await WrappedETH.balanceOf(
            userSA.address
          );

          expect(execRes[0]).to.be.eq(res[0]);

          expect(beforeExecBalance.sub(afterExecBalance)).to.be.eq(value);

          expect(wethAfterExecBalance.sub(wethBeforeExecBalance)).to.be.eq(
            ethers.BigNumber.from(`${res}`)
          );

          expect(await token.balanceOf(strategyModule.address)).to.be.eq(0);

          expect(
            await waffle.provider.getBalance(strategyModule.address)
          ).to.be.eq(0);
        });

        it("max amount", async function () {
          const { userSA, ecdsaModule, errAbi } = await setupTests();
          const value = ethers.utils.parseEther("1");
          const handler = uniV3handler.address;
          const tokenIn = token.address;
          const tokenOut = WrappedETH.address;
          const fee2 = ethers.BigNumber.from("3000");
          const amountIn = value;
          const amountOutMinimum = ethers.BigNumber.from("1");
          const sqrtPriceLimitX96 = ethers.BigNumber.from("0");

          await token
            .connect(providerAddress)
            .transfer(userSA.address, amountIn);

          const res = await call(
            quoter,
            "quoteExactInputSingle",
            [tokenIn, tokenOut, fee2, amountIn, sqrtPriceLimitX96],
            ["uint256"]
          );

          const data = (
            await ethers.getContractFactory("UniswapV3Handler")
          ).interface.encodeFunctionData(
            "exactInputSingle(address,address,uint24,uint256,uint256,uint160)",
            [
              tokenIn,
              tokenOut,
              fee2,
              MAX_UINT256,
              amountOutMinimum,
              sqrtPriceLimitX96,
            ]
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

          const beforeExecBalance = await token.balanceOf(userSA.address);

          const wethBeforeExecBalance = await WrappedETH.balanceOf(
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

          const afterExecBalance = await token.balanceOf(userSA.address);

          const wethAfterExecBalance = await WrappedETH.balanceOf(
            userSA.address
          );

          expect(beforeExecBalance.sub(afterExecBalance)).to.be.eq(
            beforeExecBalance
          );

          expect(execRes[0]).to.be.eq(res[0]);

          expect(wethAfterExecBalance.sub(wethBeforeExecBalance)).to.be.eq(
            ethers.BigNumber.from(`${res}`)
          );

          expect(await token.balanceOf(strategyModule.address)).to.be.eq(0);

          expect(
            await waffle.provider.getBalance(strategyModule.address)
          ).to.be.eq(0);
        });
      });
    });

    describe("Multi path", function () {
      describe("Ether in", function () {
        it("normal", async function () {
          const { userSA, ecdsaModule, errAbi } = await setupTests();
          const value = ethers.utils.parseEther("1");
          const handler = uniV3handler.address;
          const tokens = [WrappedETH.address, token2.address, token.address];
          const fees = [
            ethers.BigNumber.from("3000"),
            ethers.BigNumber.from("500"),
          ];
          const amountIn = value;
          const amountOutMinimum = ethers.BigNumber.from("1");
          const path = encodePath(tokens, fees);

          const res = await call(
            quoter,
            "quoteExactInput",
            [path, amountIn],
            ["uint256"]
          );

          const data = (
            await ethers.getContractFactory("UniswapV3Handler")
          ).interface.encodeFunctionData(
            "exactInputFromEther(bytes,uint256,uint256)",
            [path, amountIn, amountOutMinimum]
          );

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

          expect(execRes[0]).to.be.eq(res[0]);

          expect(beforeExecBalance.sub(afterExecBalance)).to.be.eq(value);

          expect(await token.balanceOf(userSA.address)).to.be.eq(
            ethers.BigNumber.from(`${res}`)
          );

          expect(await token.balanceOf(strategyModule.address)).to.be.eq(0);

          expect(
            await waffle.provider.getBalance(strategyModule.address)
          ).to.be.eq(0);
        });

        it("max amount", async function () {
          const { userSA, ecdsaModule, errAbi } = await setupTests();
          const value = await waffle.provider.getBalance(userSA.address);
          const handler = uniV3handler.address;
          const tokens = [WrappedETH.address, token2.address, token.address];
          const fees = [
            ethers.BigNumber.from("3000"),
            ethers.BigNumber.from("500"),
          ];
          const amountIn = value;
          const amountOutMinimum = ethers.BigNumber.from("1");
          const path = encodePath(tokens, fees);

          const res = await call(
            quoter,
            "quoteExactInput",
            [path, amountIn],
            ["uint256"]
          );

          const data = (
            await ethers.getContractFactory("UniswapV3Handler")
          ).interface.encodeFunctionData(
            "exactInputFromEther(bytes,uint256,uint256)",
            [path, MAX_UINT256, amountOutMinimum]
          );

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

          expect(execRes[0]).to.be.eq(res[0]);

          expect(beforeExecBalance.sub(afterExecBalance)).to.be.eq(value);

          expect(await token.balanceOf(userSA.address)).to.be.eq(
            ethers.BigNumber.from(`${res}`)
          );

          expect(await token.balanceOf(strategyModule.address)).to.be.eq(0);

          expect(
            await waffle.provider.getBalance(strategyModule.address)
          ).to.be.eq(0);
        });
      });

      describe("Ether out", function () {
        it("normal", async function () {
          const { userSA, ecdsaModule, errAbi } = await setupTests();
          const value = ethers.utils.parseEther("1");
          const handler = uniV3handler.address;
          const tokens = [token.address, token2.address, WrappedETH.address];
          const fees = [
            ethers.BigNumber.from("500"),
            ethers.BigNumber.from("3000"),
          ];
          const amountIn = value;
          const amountOutMinimum = ethers.BigNumber.from("1");
          const path = encodePath(tokens, fees);

          const res = await call(
            quoter,
            "quoteExactInput",
            [path, amountIn],
            ["uint256"]
          );

          await token
            .connect(providerAddress)
            .transfer(userSA.address, amountIn);

          const data = (
            await ethers.getContractFactory("UniswapV3Handler")
          ).interface.encodeFunctionData(
            "exactInputToEther(bytes,uint256,uint256)",
            [path, amountIn, amountOutMinimum]
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

          const beforeExecBalance = await token.balanceOf(userSA.address);

          const ethBeforeExecBalance = await waffle.provider.getBalance(
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

          const afterExecBalance = await token.balanceOf(userSA.address);

          const ethAfterExecBalance = await waffle.provider.getBalance(
            userSA.address
          );

          expect(execRes[0]).to.be.eq(res[0]);

          expect(beforeExecBalance.sub(afterExecBalance)).to.be.eq(value);

          expect(ethAfterExecBalance.sub(ethBeforeExecBalance)).to.be.eq(
            ethers.BigNumber.from(`${res}`)
          );

          expect(await token.balanceOf(strategyModule.address)).to.be.eq(0);

          expect(
            await waffle.provider.getBalance(strategyModule.address)
          ).to.be.eq(0);
        });

        it("max amount", async function () {
          const { userSA, ecdsaModule, errAbi } = await setupTests();
          const value = ethers.utils.parseEther("1");
          const handler = uniV3handler.address;
          const tokens = [token.address, token2.address, WrappedETH.address];
          const fees = [
            ethers.BigNumber.from("500"),
            ethers.BigNumber.from("3000"),
          ];
          const amountIn = value;
          const amountOutMinimum = ethers.BigNumber.from("1");
          const path = encodePath(tokens, fees);

          const res = await call(
            quoter,
            "quoteExactInput",
            [path, amountIn],
            ["uint256"]
          );

          await token
            .connect(providerAddress)
            .transfer(userSA.address, amountIn);

          const data = (
            await ethers.getContractFactory("UniswapV3Handler")
          ).interface.encodeFunctionData(
            "exactInputToEther(bytes,uint256,uint256)",
            [path, MAX_UINT256, amountOutMinimum]
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

          const beforeExecBalance = await token.balanceOf(userSA.address);

          const ethBeforeExecBalance = await waffle.provider.getBalance(
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

          const afterExecBalance = await token.balanceOf(userSA.address);

          const ethAfterExecBalance = await waffle.provider.getBalance(
            userSA.address
          );

          expect(execRes[0]).to.be.eq(res[0]);

          expect(beforeExecBalance.sub(afterExecBalance)).to.be.eq(
            beforeExecBalance
          );

          expect(ethAfterExecBalance.sub(ethBeforeExecBalance)).to.be.eq(
            ethers.BigNumber.from(`${res}`)
          );

          expect(await token.balanceOf(strategyModule.address)).to.be.eq(0);

          expect(
            await waffle.provider.getBalance(strategyModule.address)
          ).to.be.eq(0);
        });
      });

      describe("Token only", function () {
        it("normal", async function () {
          const { userSA, ecdsaModule, errAbi } = await setupTests();
          const value = ethers.utils.parseEther("1");
          const handler = uniV3handler.address;
          const tokens = [token.address, token2.address, WrappedETH.address];
          const fees = [
            ethers.BigNumber.from("500"),
            ethers.BigNumber.from("3000"),
          ];
          const amountIn = value;
          const amountOutMinimum = ethers.BigNumber.from("1");
          const path = encodePath(tokens, fees);

          const res = await call(
            quoter,
            "quoteExactInput",
            [path, amountIn],
            ["uint256"]
          );

          await token
            .connect(providerAddress)
            .transfer(userSA.address, amountIn);

          const data = (
            await ethers.getContractFactory("UniswapV3Handler")
          ).interface.encodeFunctionData("exactInput(bytes,uint256,uint256)", [
            path,
            amountIn,
            amountOutMinimum,
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

          const beforeExecBalance = await token.balanceOf(userSA.address);

          const wethBeforeExecBalance = await WrappedETH.balanceOf(
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

          const afterExecBalance = await token.balanceOf(userSA.address);

          const wethAfterExecBalance = await WrappedETH.balanceOf(
            userSA.address
          );

          expect(execRes[0]).to.be.eq(res[0]);

          expect(beforeExecBalance.sub(afterExecBalance)).to.be.eq(value);

          expect(wethAfterExecBalance.sub(wethBeforeExecBalance)).to.be.eq(
            ethers.BigNumber.from(`${res}`)
          );

          expect(await token.balanceOf(strategyModule.address)).to.be.eq(0);

          expect(
            await waffle.provider.getBalance(strategyModule.address)
          ).to.be.eq(0);
        });

        it("max amount", async function () {
          const { userSA, ecdsaModule, errAbi } = await setupTests();
          const value = ethers.utils.parseEther("1");
          const handler = uniV3handler.address;
          const tokens = [token.address, token2.address, WrappedETH.address];
          const fees = [
            ethers.BigNumber.from("500"),
            ethers.BigNumber.from("3000"),
          ];
          const amountIn = value;
          const amountOutMinimum = ethers.BigNumber.from("1");
          const path = encodePath(tokens, fees);

          const res = await call(
            quoter,
            "quoteExactInput",
            [path, amountIn],
            ["uint256"]
          );

          await token
            .connect(providerAddress)
            .transfer(userSA.address, amountIn);

          const data = (
            await ethers.getContractFactory("UniswapV3Handler")
          ).interface.encodeFunctionData("exactInput(bytes,uint256,uint256)", [
            path,
            MAX_UINT256,
            amountOutMinimum,
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

          const beforeExecBalance = await token.balanceOf(userSA.address);

          const wethBeforeExecBalance = await WrappedETH.balanceOf(
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

          const afterExecBalance = await token.balanceOf(userSA.address);

          const wethAfterExecBalance = await WrappedETH.balanceOf(
            userSA.address
          );

          expect(execRes[0]).to.be.eq(res[0]);

          expect(beforeExecBalance.sub(afterExecBalance)).to.be.eq(
            beforeExecBalance
          );

          expect(wethAfterExecBalance.sub(wethBeforeExecBalance)).to.be.eq(
            ethers.BigNumber.from(`${res}`)
          );

          expect(await token.balanceOf(strategyModule.address)).to.be.eq(0);

          expect(
            await waffle.provider.getBalance(strategyModule.address)
          ).to.be.eq(0);
        });
      });
    });

    describe("Exact output", function () {
      describe("Single path", function () {
        describe("Ether in", function () {
          it("normal", async function () {
            const { userSA, ecdsaModule, errAbi } = await setupTests();
            const value = ethers.utils.parseEther("1");
            const handler = uniV3handler.address;
            const tokenIn = WrappedETH.address;
            const tokenOut = token.address;
            const fee2 = ethers.BigNumber.from("3000");
            const amountOut = ethers.utils.parseEther("1000");
            const amountInMaximum = value;
            const sqrtPriceLimitX96 = ethers.BigNumber.from("0");

            const res = await call(
              quoter,
              "quoteExactOutputSingle",
              [tokenIn, tokenOut, fee2, amountOut, sqrtPriceLimitX96],
              ["uint256"]
            );

            const data = (
              await ethers.getContractFactory("UniswapV3Handler")
            ).interface.encodeFunctionData(
              "exactOutputSingleFromEther(address,uint24,uint256,uint256,uint160)",
              [tokenOut, fee2, amountOut, amountInMaximum, sqrtPriceLimitX96]
            );

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

            expect(execRes[0]).to.be.eq(res[0]);

            expect(beforeExecBalance.sub(afterExecBalance)).to.be.eq(
              ethers.BigNumber.from(`${res}`)
            );

            expect(await token.balanceOf(userSA.address)).to.be.eq(
              ethers.BigNumber.from(amountOut)
            );

            expect(await token.balanceOf(strategyModule.address)).to.be.eq(0);

            expect(
              await waffle.provider.getBalance(strategyModule.address)
            ).to.be.eq(0);
          });

          it("max amount", async function () {
            const { userSA, ecdsaModule, errAbi } = await setupTests();
            const value = await waffle.provider.getBalance(userSA.address);
            const handler = uniV3handler.address;
            const tokenIn = WrappedETH.address;
            const tokenOut = token.address;
            const fee2 = ethers.BigNumber.from("3000");
            const amountOut = ethers.utils.parseEther("1000");
            const amountInMaximum = value;
            const sqrtPriceLimitX96 = ethers.BigNumber.from("0");

            const res = await call(
              quoter,
              "quoteExactOutputSingle",
              [tokenIn, tokenOut, fee2, amountOut, sqrtPriceLimitX96],
              ["uint256"]
            );

            const data = (
              await ethers.getContractFactory("UniswapV3Handler")
            ).interface.encodeFunctionData(
              "exactOutputSingleFromEther(address,uint24,uint256,uint256,uint160)",
              [tokenOut, fee2, amountOut, MAX_UINT256, sqrtPriceLimitX96]
            );

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

            expect(execRes[0]).to.be.eq(res[0]);

            expect(beforeExecBalance.sub(afterExecBalance)).to.be.eq(
              ethers.BigNumber.from(`${res}`)
            );

            expect(await token.balanceOf(userSA.address)).to.be.eq(
              ethers.BigNumber.from(amountOut)
            );

            expect(await token.balanceOf(strategyModule.address)).to.be.eq(0);

            expect(
              await waffle.provider.getBalance(strategyModule.address)
            ).to.be.eq(0);
          });
        });

        describe("Ether out", function () {
          it("normal", async function () {
            const { userSA, ecdsaModule, errAbi } = await setupTests();
            const value = ethers.utils.parseEther("1");
            const handler = uniV3handler.address;
            const tokenIn = token.address;
            const tokenOut = WrappedETH.address;
            const fee2 = ethers.BigNumber.from("3000");
            const amountOut = value;
            const amountInMaximum = ethers.utils.parseEther("5000");
            const sqrtPriceLimitX96 = ethers.BigNumber.from("0");

            await token
              .connect(providerAddress)
              .transfer(userSA.address, amountInMaximum);

            const res = await call(
              quoter,
              "quoteExactOutputSingle",
              [tokenIn, tokenOut, fee2, amountOut, sqrtPriceLimitX96],
              ["uint256"]
            );

            const data = (
              await ethers.getContractFactory("UniswapV3Handler")
            ).interface.encodeFunctionData(
              "exactOutputSingleToEther(address,uint24,uint256,uint256,uint160)",
              [tokenIn, fee2, amountOut, amountInMaximum, sqrtPriceLimitX96]
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

            const ethBeforeExecBalance = await waffle.provider.getBalance(
              userSA.address
            );

            const beforeExecBalance = await token.balanceOf(userSA.address);

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

            const ethAfterExecBalance = await waffle.provider.getBalance(
              userSA.address
            );

            const afterExecBalance = await token.balanceOf(userSA.address);

            expect(execRes[0]).to.be.eq(res[0]);

            expect(beforeExecBalance.sub(afterExecBalance)).to.be.eq(
              ethers.BigNumber.from(`${res}`)
            );

            expect(ethAfterExecBalance.sub(ethBeforeExecBalance)).to.be.eq(
              amountOut
            );

            expect(await token.balanceOf(strategyModule.address)).to.be.eq(0);

            expect(
              await waffle.provider.getBalance(strategyModule.address)
            ).to.be.eq(0);
          });

          it("max amount", async function () {
            const { userSA, ecdsaModule, errAbi } = await setupTests();
            const value = ethers.utils.parseEther("1");
            const handler = uniV3handler.address;
            const tokenIn = token.address;
            const tokenOut = WrappedETH.address;
            const fee2 = ethers.BigNumber.from("3000");
            const amountOut = value;
            const amountInMaximum = ethers.utils.parseEther("5000");
            const sqrtPriceLimitX96 = ethers.BigNumber.from("0");

            await token
              .connect(providerAddress)
              .transfer(userSA.address, amountInMaximum);

            const res = await call(
              quoter,
              "quoteExactOutputSingle",
              [tokenIn, tokenOut, fee2, amountOut, sqrtPriceLimitX96],
              ["uint256"]
            );

            const data = (
              await ethers.getContractFactory("UniswapV3Handler")
            ).interface.encodeFunctionData(
              "exactOutputSingleToEther(address,uint24,uint256,uint256,uint160)",
              [tokenIn, fee2, amountOut, MAX_UINT256, sqrtPriceLimitX96]
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

            const ethBeforeExecBalance = await waffle.provider.getBalance(
              userSA.address
            );

            const beforeExecBalance = await token.balanceOf(userSA.address);

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

            const ethAfterExecBalance = await waffle.provider.getBalance(
              userSA.address
            );

            const afterExecBalance = await token.balanceOf(userSA.address);

            expect(execRes[0]).to.be.eq(res[0]);

            expect(beforeExecBalance.sub(afterExecBalance)).to.be.eq(
              ethers.BigNumber.from(`${res}`)
            );

            expect(ethAfterExecBalance.sub(ethBeforeExecBalance)).to.be.eq(
              amountOut
            );

            expect(await token.balanceOf(strategyModule.address)).to.be.eq(0);

            expect(
              await waffle.provider.getBalance(strategyModule.address)
            ).to.be.eq(0);
          });
        });

        describe("Token only", function () {
          it("normal", async function () {
            const { userSA, ecdsaModule, errAbi } = await setupTests();
            const value = ethers.utils.parseEther("1");
            const handler = uniV3handler.address;
            const tokenIn = token.address;
            const tokenOut = WrappedETH.address;
            const fee2 = ethers.BigNumber.from("3000");
            const amountOut = value;
            const amountInMaximum = ethers.utils.parseEther("5000");
            const sqrtPriceLimitX96 = ethers.BigNumber.from("0");

            await token
              .connect(providerAddress)
              .transfer(userSA.address, amountInMaximum);

            const res = await call(
              quoter,
              "quoteExactOutputSingle",
              [tokenIn, tokenOut, fee2, amountOut, sqrtPriceLimitX96],
              ["uint256"]
            );

            const data = (
              await ethers.getContractFactory("UniswapV3Handler")
            ).interface.encodeFunctionData(
              "exactOutputSingle(address,address,uint24,uint256,uint256,uint160)",
              [
                tokenIn,
                tokenOut,
                fee2,
                amountOut,
                amountInMaximum,
                sqrtPriceLimitX96,
              ]
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

            const wethBeforeExecBalance = await WrappedETH.balanceOf(
              userSA.address
            );

            const beforeExecBalance = await token.balanceOf(userSA.address);

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

            const wethAfterExecBalance = await WrappedETH.balanceOf(
              userSA.address
            );

            const afterExecBalance = await token.balanceOf(userSA.address);

            expect(execRes[0]).to.be.eq(res[0]);

            expect(beforeExecBalance.sub(afterExecBalance)).to.be.eq(
              ethers.BigNumber.from(`${res}`)
            );

            expect(wethAfterExecBalance.sub(wethBeforeExecBalance)).to.be.eq(
              amountOut
            );

            expect(await token.balanceOf(strategyModule.address)).to.be.eq(0);

            expect(
              await waffle.provider.getBalance(strategyModule.address)
            ).to.be.eq(0);
          });

          it("max amount", async function () {
            const { userSA, ecdsaModule, errAbi } = await setupTests();
            const value = ethers.utils.parseEther("1");
            const handler = uniV3handler.address;
            const tokenIn = token.address;
            const tokenOut = WrappedETH.address;
            const fee2 = ethers.BigNumber.from("3000");
            const amountOut = value;
            const amountInMaximum = ethers.utils.parseEther("5000");
            const sqrtPriceLimitX96 = ethers.BigNumber.from("0");

            await token
              .connect(providerAddress)
              .transfer(userSA.address, amountInMaximum);

            const res = await call(
              quoter,
              "quoteExactOutputSingle",
              [tokenIn, tokenOut, fee2, amountOut, sqrtPriceLimitX96],
              ["uint256"]
            );

            const data = (
              await ethers.getContractFactory("UniswapV3Handler")
            ).interface.encodeFunctionData(
              "exactOutputSingle(address,address,uint24,uint256,uint256,uint160)",
              [
                tokenIn,
                tokenOut,
                fee2,
                amountOut,
                MAX_UINT256,
                sqrtPriceLimitX96,
              ]
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

            const wethBeforeExecBalance = await WrappedETH.balanceOf(
              userSA.address
            );

            const beforeExecBalance = await token.balanceOf(userSA.address);

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

            const wethAfterExecBalance = await WrappedETH.balanceOf(
              userSA.address
            );

            const afterExecBalance = await token.balanceOf(userSA.address);

            expect(execRes[0]).to.be.eq(res[0]);

            expect(beforeExecBalance.sub(afterExecBalance)).to.be.eq(
              ethers.BigNumber.from(`${res}`)
            );

            expect(wethAfterExecBalance.sub(wethBeforeExecBalance)).to.be.eq(
              amountOut
            );

            expect(await token.balanceOf(strategyModule.address)).to.be.eq(0);

            expect(
              await waffle.provider.getBalance(strategyModule.address)
            ).to.be.eq(0);
          });
        });
      });
      describe("Multi path", function () {
        describe("Ether in", function () {
          it("normal", async function () {
            const { userSA, ecdsaModule, errAbi } = await setupTests();
            const value = ethers.utils.parseEther("1");
            const handler = uniV3handler.address;
            const tokens = [token.address, token2.address, WrappedETH.address];
            const fees = [
              ethers.BigNumber.from("500"),
              ethers.BigNumber.from("3000"),
            ];
            const amountOut = ethers.utils.parseEther("1000");
            const amountInMaximum = value;
            const path = encodePath(tokens, fees);

            const res = await call(
              quoter,
              "quoteExactOutput",
              [path, amountOut],
              ["uint256"]
            );

            const data = (
              await ethers.getContractFactory("UniswapV3Handler")
            ).interface.encodeFunctionData(
              "exactOutputFromEther(bytes,uint256,uint256)",
              [path, amountOut, amountInMaximum]
            );

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

            expect(beforeExecBalance.sub(afterExecBalance)).to.be.eq(
              ethers.BigNumber.from(`${res}`)
            );

            expect(execRes[0]).to.be.eq(res[0]);

            expect(await token.balanceOf(userSA.address)).to.be.eq(amountOut);

            expect(await token.balanceOf(strategyModule.address)).to.be.eq(0);

            expect(
              await waffle.provider.getBalance(strategyModule.address)
            ).to.be.eq(0);
          });

          it("max amount", async function () {
            const { userSA, ecdsaModule, errAbi } = await setupTests();
            const value = await waffle.provider.getBalance(userSA.address);
            const handler = uniV3handler.address;
            const tokens = [token.address, token2.address, WrappedETH.address];
            const fees = [
              ethers.BigNumber.from("500"),
              ethers.BigNumber.from("3000"),
            ];
            const amountOut = ethers.utils.parseEther("1000");
            const amountInMaximum = value;
            const path = encodePath(tokens, fees);

            const res = await call(
              quoter,
              "quoteExactOutput",
              [path, amountOut],
              ["uint256"]
            );

            const data = (
              await ethers.getContractFactory("UniswapV3Handler")
            ).interface.encodeFunctionData(
              "exactOutputFromEther(bytes,uint256,uint256)",
              [path, amountOut, MAX_UINT256]
            );

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

            expect(execRes[0]).to.be.eq(res[0]);

            expect(beforeExecBalance.sub(afterExecBalance)).to.be.eq(
              ethers.BigNumber.from(`${res}`)
            );

            expect(await token.balanceOf(userSA.address)).to.be.eq(amountOut);

            expect(await token.balanceOf(strategyModule.address)).to.be.eq(0);

            expect(
              await waffle.provider.getBalance(strategyModule.address)
            ).to.be.eq(0);
          });
        });

        describe("Ether out", function () {
          it("normal", async function () {
            const { userSA, ecdsaModule, errAbi } = await setupTests();
            const value = ethers.utils.parseEther("1");
            const handler = uniV3handler.address;
            const tokens = [WrappedETH.address, token2.address, token.address];
            const fees = [
              ethers.BigNumber.from("3000"),
              ethers.BigNumber.from("500"),
            ];
            const amountOut = value;
            const amountInMaximum = ethers.utils.parseEther("5000");
            const path = encodePath(tokens, fees);

            await token
              .connect(providerAddress)
              .transfer(userSA.address, amountInMaximum);

            const res = await call(
              quoter,
              "quoteExactOutput",
              [path, amountOut],
              ["uint256"]
            );

            const data = (
              await ethers.getContractFactory("UniswapV3Handler")
            ).interface.encodeFunctionData(
              "exactOutputToEther(bytes,uint256,uint256)",
              [path, amountOut, amountInMaximum]
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

            const beforeExecBalance = await token.balanceOf(userSA.address);

            const ethBeforeExecBalance = await waffle.provider.getBalance(
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

            const afterExecBalance = await token.balanceOf(userSA.address);

            const ethAfterExecBalance = await waffle.provider.getBalance(
              userSA.address
            );

            expect(execRes[0]).to.be.eq(res[0]);

            expect(beforeExecBalance.sub(afterExecBalance)).to.be.eq(
              ethers.BigNumber.from(`${res}`)
            );

            expect(ethAfterExecBalance.sub(ethBeforeExecBalance)).to.be.eq(
              amountOut
            );

            expect(await token.balanceOf(strategyModule.address)).to.be.eq(0);

            expect(
              await waffle.provider.getBalance(strategyModule.address)
            ).to.be.eq(0);
          });

          it("max amount", async function () {
            const { userSA, ecdsaModule, errAbi } = await setupTests();
            const value = ethers.utils.parseEther("1");
            const handler = uniV3handler.address;
            const tokens = [WrappedETH.address, token2.address, token.address];
            const fees = [
              ethers.BigNumber.from("3000"),
              ethers.BigNumber.from("500"),
            ];
            const amountOut = value;
            const amountInMaximum = ethers.utils.parseEther("5000");
            const path = encodePath(tokens, fees);

            await token
              .connect(providerAddress)
              .transfer(userSA.address, amountInMaximum);

            const res = await call(
              quoter,
              "quoteExactOutput",
              [path, amountOut],
              ["uint256"]
            );

            const data = (
              await ethers.getContractFactory("UniswapV3Handler")
            ).interface.encodeFunctionData(
              "exactOutputToEther(bytes,uint256,uint256)",
              [path, amountOut, MAX_UINT256]
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

            const beforeExecBalance = await token.balanceOf(userSA.address);

            const ethBeforeExecBalance = await waffle.provider.getBalance(
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

            const afterExecBalance = await token.balanceOf(userSA.address);

            const ethAfterExecBalance = await waffle.provider.getBalance(
              userSA.address
            );

            expect(execRes[0]).to.be.eq(res[0]);

            expect(beforeExecBalance.sub(afterExecBalance)).to.be.eq(
              ethers.BigNumber.from(`${res}`)
            );

            expect(ethAfterExecBalance.sub(ethBeforeExecBalance)).to.be.eq(
              amountOut
            );

            expect(await token.balanceOf(strategyModule.address)).to.be.eq(0);

            expect(
              await waffle.provider.getBalance(strategyModule.address)
            ).to.be.eq(0);
          });
        });

        describe("Token only", function () {
          it("normal", async function () {
            const { userSA, ecdsaModule, errAbi } = await setupTests();
            const value = ethers.utils.parseEther("1");
            const handler = uniV3handler.address;
            const tokens = [WrappedETH.address, token2.address, token.address];
            const fees = [
              ethers.BigNumber.from("3000"),
              ethers.BigNumber.from("500"),
            ];
            const amountOut = value;
            const amountInMaximum = ethers.utils.parseEther("5000");
            const path = encodePath(tokens, fees);

            await token
              .connect(providerAddress)
              .transfer(userSA.address, amountInMaximum);

            const res = await call(
              quoter,
              "quoteExactOutput",
              [path, amountOut],
              ["uint256"]
            );

            const data = (
              await ethers.getContractFactory("UniswapV3Handler")
            ).interface.encodeFunctionData(
              "exactOutput(bytes,uint256,uint256)",
              [path, amountOut, amountInMaximum]
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

            const beforeExecBalance = await token.balanceOf(userSA.address);

            const wethBeforeExecBalance = await WrappedETH.balanceOf(
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

            const afterExecBalance = await token.balanceOf(userSA.address);

            const wethAfterExecBalance = await WrappedETH.balanceOf(
              userSA.address
            );

            expect(execRes[0]).to.be.eq(res[0]);

            expect(beforeExecBalance.sub(afterExecBalance)).to.be.eq(
              ethers.BigNumber.from(`${res}`)
            );

            expect(wethAfterExecBalance.sub(wethBeforeExecBalance)).to.be.eq(
              amountOut
            );

            expect(await token.balanceOf(strategyModule.address)).to.be.eq(0);

            expect(
              await waffle.provider.getBalance(strategyModule.address)
            ).to.be.eq(0);
          });

          it("max amount", async function () {
            const { userSA, ecdsaModule, errAbi } = await setupTests();
            const value = ethers.utils.parseEther("1");
            const handler = uniV3handler.address;
            const tokens = [WrappedETH.address, token2.address, token.address];
            const fees = [
              ethers.BigNumber.from("3000"),
              ethers.BigNumber.from("500"),
            ];
            const amountOut = value;
            const amountInMaximum = ethers.utils.parseEther("5000");
            const path = encodePath(tokens, fees);

            await token
              .connect(providerAddress)
              .transfer(userSA.address, amountInMaximum);

            const res = await call(
              quoter,
              "quoteExactOutput",
              [path, amountOut],
              ["uint256"]
            );

            const data = (
              await ethers.getContractFactory("UniswapV3Handler")
            ).interface.encodeFunctionData(
              "exactOutput(bytes,uint256,uint256)",
              [path, amountOut, MAX_UINT256]
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

            const beforeExecBalance = await token.balanceOf(userSA.address);

            const wethBeforeExecBalance = await WrappedETH.balanceOf(
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

            const afterExecBalance = await token.balanceOf(userSA.address);

            const wethAfterExecBalance = await WrappedETH.balanceOf(
              userSA.address
            );

            expect(execRes[0]).to.be.eq(res[0]);

            expect(beforeExecBalance.sub(afterExecBalance)).to.be.eq(
              ethers.BigNumber.from(`${res}`)
            );

            expect(wethAfterExecBalance.sub(wethBeforeExecBalance)).to.be.eq(
              amountOut
            );

            expect(await token.balanceOf(strategyModule.address)).to.be.eq(0);

            expect(
              await waffle.provider.getBalance(strategyModule.address)
            ).to.be.eq(0);
          });
        });
      });
    });
  });
});
