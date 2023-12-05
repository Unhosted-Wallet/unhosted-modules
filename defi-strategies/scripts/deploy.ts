import { ethers } from "hardhat";
import {
  AAVEPROTOCOL_V2_PROVIDER_GOERLI,
  GOERLI_WRAPPED_NATIVE_UNIV3, UNISWAPV3_ROUTER, WRAPPED_NATIVE_TOKEN, WRAPPED_NATIVE_TOKEN_AAVEV2_GOERLI, WRAPPED_NATIVE_TOKEN_COMPV3_GOERLI,
} from "../test/utils/constants_eth";
import { AAVEPROTOCOL_V2_PROVIDER_MUMBAI, MUMBAI_USDC_COMPV3, MUMBAI_WRAPPED_NATIVE_AAVEV2, MUMBAI_WRAPPED_NATIVE_UNIV3 } from "../test/utils/constants_poly";

async function main() {

  const StrategyFactory = await ethers.getContractFactory("StrategyModule");
  const strategy = await StrategyFactory.deploy();

  console.log(strategy.address);

  const StrategyModuleFactory = await ethers.getContractFactory(
    "StrategyModuleFactory"
  );

  const strategyModule = await StrategyModuleFactory.deploy(strategy.address);
  // const strategyModule = await StrategyModuleFactory.attach("0x2b2EA246FcEf28fE90f5de6FD54Bd121E0eD7066");

  console.log(strategyModule.address);

  const UniswapV3Factory = await ethers.getContractFactory("UniswapV3Handler");

  const uniV3 = await UniswapV3Factory.deploy(GOERLI_WRAPPED_NATIVE_UNIV3, UNISWAPV3_ROUTER);

  console.log(uniV3.address);

  const AaveV2Callback = await ethers.getContractFactory("FlashloanCallbackHandler");

  const aaveV2Callback = await AaveV2Callback.deploy(AAVEPROTOCOL_V2_PROVIDER_GOERLI);
  
  console.log(aaveV2Callback.address);

  const AaveV2Factory = await ethers.getContractFactory("AaveV2Handler");

  const aaveV2 = await AaveV2Factory.deploy(WRAPPED_NATIVE_TOKEN_AAVEV2_GOERLI, AAVEPROTOCOL_V2_PROVIDER_GOERLI, aaveV2Callback.address);

  console.log(aaveV2.address);

  const CompV3Factory = await ethers.getContractFactory("CompoundV3Handler");

  const compV3 = await CompV3Factory.deploy(WRAPPED_NATIVE_TOKEN_COMPV3_GOERLI);

  console.log(compV3.address);

  const proxyAddress = await strategyModule.getAddressForStrategyModule(
    "0x17b7c1765611E0ce15b20aF68ECFdF86Eac636B3",
    "0xD8B15aa35C5C4195e277FCB660f0c1b1f1784f80",
    0
  );

  console.log(proxyAddress);

  const proxy = await strategyModule.deployStrategyModule(
    "0x17b7c1765611E0ce15b20aF68ECFdF86Eac636B3",
    "0xD8B15aa35C5C4195e277FCB660f0c1b1f1784f80",
    0
  );

  await proxy.wait();
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
//mumbai
// implementation 0x60c215d50714582ec92f27aBAAeEa3Ac5AcD430F
// factory 0xb878B67D738ff1Ce25812589a1A845cB8A4857b1
// univ3 handler 0x6C39FE19D6c65e101b36905dE67F800DA74Db205
// univ3 proxy 0x4fac56AaDFfBaEbb83081011f049A3E51b7428Ca
// aavev2 handler 0xAc145D228fAAC1B99e33C768FD13D629814e28D3
// aavev2 proxy 0xD0C2c2E4474088BbbcEAdAC150ae1E10DB95c470
// compv3 handler 0x02c39f1be2Fac9C232F7018dfb35d8989bdDdebc
// compv3 proxy 0x6A9C9568151133Da9bD3834eAA842e2AeD129907

//goerli
// implementation 0x8092598451ee037505525046A79c4544a12C1935
// factory 0x2b2EA246FcEf28fE90f5de6FD54Bd121E0eD7066
// univ3 handler 0x5b88BE4687D40c4D71aA3E7C7E1041C91529Fe6C
// univ3 proxy 0x4D667b4FD3cbd5642114E550b27a299541e5535B
// aavev2 handler 0xD8B15aa35C5C4195e277FCB660f0c1b1f1784f80
// aavev2 proxy 0xCDf9d06c6083bc0Ffe1433a61826Ba6f02f0C5eB
// compv3 handler 0x2266b9c5cF361feD4AD6F8260116AeB189eDe274
// compv3 proxy 0x40912ba57a954919bE6BB2c8388dAF79A94920cB
