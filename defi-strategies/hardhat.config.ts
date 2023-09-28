import * as dotenv from "dotenv";

import { HardhatUserConfig, task } from "hardhat/config";

import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-waffle";
import "@typechain/hardhat";
import "hardhat-gas-reporter";
import "solidity-coverage";
import "hardhat-deploy";
import "@nomiclabs/hardhat-ethers";
import "hardhat-dependency-compiler";
import { parseUnits } from "ethers/lib/utils";

dotenv.config();

const shouldRunInForkMode = !process.env.FORK_MODE;
// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

const config: HardhatUserConfig = {
  paths: {
    artifacts: "artifacts",
    cache: "cache",
    deploy: "src/deploy",
    sources: "contracts",
  },
  namedAccounts: {
    deployer: 0,
    verifiedSigner: 5,
  },
  solidity: {
    compilers: [
      {
        version: "0.8.17",
        settings: {
          optimizer: { enabled: true, runs: 800 },
          viaIR: true,
        },
      },
    ],
  },
  networks: {
    hardhat: {
      ...(shouldRunInForkMode
        ? {
            // Forking Config for Deployment Testing
            chainId: 1,
            forking: {
              url: process.env.MANTLE_MAINNET_URL || "https://rpc.ankr.com/eth",
              blockNumber: 18228258,
            },
            accounts: {
              mnemonic:
                "dice shove sheriff police boss indoor hospital vivid tenant method game matter",
              path: "m/44'/60'/0'/0",
              initialIndex: 0,
            },
            initialBaseFeePerGas: 0,
            gasPrice: 0,
            gas: 3000000,
          }
        : {
            // Normal Config
            accounts: {
              accountsBalance: "10000000000000000000000000",
              //   mnemonic: MNEMONIC,
            },
            allowUnlimitedContractSize: true,
            chainId: 31337,
          }),
    },
    hardhat_node: {
      live: false,
      saveDeployments: false,
      chainId: 31337,
      url: "http://localhost:8545",
    },
    local: {
      live: false,
      saveDeployments: false,
      chainId: 1337,
      url: "http://localhost:8545",
      accounts: {
        mnemonic:
          "garbage miracle journey siren inch method pulse learn month grid frame business",
        path: "m/44'/60'/0'/0",
        initialIndex: 0,
        count: 20,
      },
      gasPrice: parseUnits("1", "gwei").toNumber(),
    },
  },

  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    onlyCalledMethods: true,
  },
  dependencyCompiler: {
    paths: ["@account-abstraction/contracts/core/EntryPoint.sol"],
  },
  etherscan: {
    apiKey: {
      mainnet: process.env.ETHERSCAN_API_KEY || "",
    },
  },
};

export default config;
