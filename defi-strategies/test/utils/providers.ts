import {
  UNISWAPV3_FACTORY,
  USDC_TOKEN,
  WRAPPED_NATIVE_TOKEN,
} from "./constants_eth";
import hardhat, { ethers, waffle } from "hardhat";

export const getTokenProvider = async (
  token0 = USDC_TOKEN,
  token1 = WRAPPED_NATIVE_TOKEN,
  fee = 500
) => {
  const chainId = hardhat.network.config.chainId;
  if (chainId === 1 || chainId === 10 || chainId === 42161) {
    const provider = await tokenProviderUniV3(token0, token1, fee);
    return provider === ethers.constants.AddressZero
      ? await tokenProviderUniV3(token0, token1, 3000)
      : provider;
  }
};

export const tokenProviderUniV3 = async (
  token0 = USDC_TOKEN,
  token1 = WRAPPED_NATIVE_TOKEN,
  fee = 500 // 0.05%
) => {
  if (token0 === WRAPPED_NATIVE_TOKEN) {
    token1 = USDC_TOKEN;
  }

  const uniswapV3Factory = await ethers.getContractAt(
    ["function getPool(address,address,uint24) view returns (address)"],
    UNISWAPV3_FACTORY
  );
  const pool = await uniswapV3Factory.getPool(token0, token1, fee);
  impersonateAndInjectEther(pool);

  return pool;
};

export const impersonateAndInjectEther = async (
  address: string,
  amount = "0xde0b6b3a7640000" // 1 ether
) => {
  await impersonate(address);
  // Inject ether
  await injectEther(address, amount);
};

async function impersonate(address: string) {
  // Impersonate address
  await waffle.provider.send("hardhat_impersonateAccount", [address]);
}

async function injectEther(
  address: string,
  amount = "0xde0b6b3a7640000" // 1 ether
) {
  // Inject ether
  await waffle.provider.send("hardhat_setBalance", [address, amount]);
}
