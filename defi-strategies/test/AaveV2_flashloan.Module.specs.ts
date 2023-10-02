import { expect } from "chai";
import { Contract } from "ethers";
import { decodeError } from "ethers-decode-error";
import hardhat, { ethers, deployments, waffle } from "hardhat";
import { buildEcdsaModuleAuthorizedStrategyTx } from "./utils/execution";
import { makeEcdsaModuleUserOp } from "./utils/userOp";
import {
  WRAPPED_NATIVE_TOKEN,
  AAVEPROTOCOL_V2_PROVIDER,
  AWRAPPED_NATIVE_V2_TOKEN,
  DAI_TOKEN,
  ADAI_V2,
  AAVE_RATEMODE,
} from "./utils/constants_eth";
import { MAX_UINT256 } from "./utils/constants";

import {
  getEntryPoint,
  getEcdsaOwnershipRegistryModule,
  getSmartAccountWithModule,
  getStrategyModule,
} from "./utils/setupHelper";
import { getTokenProvider } from "./utils/providers";

describe("AaveV2 flashloan", async () => {
  const chainId = hardhat.network.config.chainId;
  if (chainId === 1 || chainId === 137) {
    // This test supports to run on these chains.
  } else {
    return;
  }
  const [deployer, smartAccountOwner, alice] = waffle.provider.getWallets();
  let strategyModule: Contract;
  let aaveV2handler: Contract;
  let WrappedETH: Contract;
  let AWrappedETH: Contract;
  let token: Contract;
  let aToken: Contract;
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

    provider = await ethers.getContractAt(
      "ILendingPoolAddressesProviderV2",
      AAVEPROTOCOL_V2_PROVIDER
    );

    lendingPool = await ethers.getContractAt(
      "ILendingPoolV2",
      await provider.getLendingPool()
    );

    WrappedETH = await (
      await ethers.getContractFactory("MockToken")
    ).attach(WRAPPED_NATIVE_TOKEN);

    AWrappedETH = await (
      await ethers.getContractFactory("MockToken")
    ).attach(AWRAPPED_NATIVE_V2_TOKEN);

    token = await (
      await ethers.getContractFactory("MockToken")
    ).attach(DAI_TOKEN);

    aToken = await (
      await ethers.getContractFactory("MockToken")
    ).attach(ADAI_V2);

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

    const callbackHandler = await (
      await ethers.getContractFactory("FlashloanCallbackHandler")
    ).deploy();

    aaveV2handler = await (
      await ethers.getContractFactory("AaveV2Handler")
    ).deploy(WRAPPED_NATIVE_TOKEN, AAVEPROTOCOL_V2_PROVIDER, callbackHandler.address);


    strategyModule = await getStrategyModule(
      alice.address,
      aaveV2handler.address,
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

  describe("ٔNormal", function () {
    beforeEach(async function () {
      // const { userSA } = await setupTests();
      // const depositAmount = ethers.utils.parseEther("10000");

      // await token
      //   .connect(providerAddress)
      //   .approve(lendingPool.address, depositAmount);

      // await lendingPool.connect(providerAddress).deposit(
      //   token.address,
      //   depositAmount,
      //   userSA.address,
      //   0,
      // );
    });

    it("single asset with no debt", async function () {
      const { userSA, ecdsaModule, errAbi } = await setupTests();
      const value = ethers.utils.parseEther("10000");
      const handler = aaveV2handler.address;

      const data = (
        await ethers.getContractFactory("AaveV2Handler")
      ).interface.encodeFunctionData(
        "flashLoan(address[],uint256[],uint256[],bytes)",
        [[token.address], [value], [AAVE_RATEMODE.NODEBT], '0x']
      );

      await token.connect(providerAddress).transfer(userSA.address, value);

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

      const beforeExecBalance = await token.balanceOf(userSA.address)

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

      const afterExecBalance = await token.balanceOf(userSA.address);

      console.log(userSA.address, beforeExecBalance, afterExecBalance)

      // expect(beforeExecBalance.sub(afterExecBalance)).to.be.eq(value);

      // expect(await AWrappedETH.balanceOf(userSA.address)).to.be.eq(value);

      // expect(await AWrappedETH.balanceOf(strategyModule.address)).to.be.eq(0);

      // expect(await waffle.provider.getBalance(strategyModule.address)).to.be.eq(
      //   0
      // );
    });
  });
});

// function _getFlashloanParams(tos, configs, faucets, tokens, amounts) {
//   const data = [
//     "0x" +
//       abi
//         .simpleEncode(
//           "drainTokens(address[],address[],uint256[])",
//           faucets,
//           tokens,
//           amounts
//         )
//         .toString("hex"),
//   ];

//   const params = web3.eth.abi.encodeParameters(
//     ["address[]", "bytes32[]", "bytes[]"],
//     [tos, configs, data]
//   );
//   return params;
// }

// function _getFlashloanCubeData(assets, amounts, modes, params) {
//   const data = abi.simpleEncode(
//     "flashLoan(address[],uint256[],uint256[],bytes)",
//     assets,
//     amounts,
//     modes,
//     util.toBuffer(params)
//   );
//   return data;
// }

// function _getFlashloanFee(value) {
//   return value.mul(new BN("9")).div(new BN("10000"));
// }
