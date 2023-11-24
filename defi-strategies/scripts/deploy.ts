import { ethers } from "hardhat";
import {
  GOERLI_WRAPPED_NATIVE_UNIV3,
} from "../test/utils/constants_eth";

async function main() {

  const StrategyFactory = await ethers.getContractFactory("StrategyModule");
  const strategy = await StrategyFactory.deploy();

  console.log(strategy.address);

  const StrategyModuleFactory = await ethers.getContractFactory(
    "StrategyModuleFactory"
  );

  const strategyModule = await StrategyModuleFactory.deploy(strategy.address);

  console.log(strategyModule.address);

  const UniswapV3Factory = await ethers.getContractFactory("UniswapV3Handler");

  const uniV3 = await UniswapV3Factory.deploy(GOERLI_WRAPPED_NATIVE_UNIV3);

  console.log(uniV3.address);

  const proxy = await strategyModule.deployStrategyModule(
    "0x17b7c1765611E0ce15b20aF68ECFdF86Eac636B3",
    uniV3.address,
    0
  );

  console.log(proxy);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
//mumbai
// implementation 0xB729Eb190Fd722978b035A0b54E4DFc806840C41
// factory 0x0205539573A057D26546988E6ff09C923824dfbd
// handler 0x09717AE0ADf0b066843fd7d4B0aCfF48156668e2
// proxy 0x76e0809db9d34Ee0c3Ed2DC1d752522e8C8D2348

//goerli
// implementation 0xB2a6F8FeFC5f13eaB7DE0ca720E16E6e65EF9EC0
// factory 0xE0A0E53fd5C84df9026E87093e9A8Df7A46b2c82
// handler 0x273daEDDeCA7dc1100aAcA14e18fA3a9247a2fA2
// proxy 0x0C624Ecb80172a128F3ac411b3713533cDFbff81
