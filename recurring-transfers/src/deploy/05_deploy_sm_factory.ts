import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import {
  getStrategyModuleImplementation,
} from "../../test/utils/setupHelper";

const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const strategyModuleImplementation = await getStrategyModuleImplementation();

  await deploy("StrategyModuleFactory", {
    from: deployer,
    args: [strategyModuleImplementation.address],
    log: true,
    deterministicDeployment: true,
    autoMine: true,
  });

};

deploy.tags = ["strategy-module-factory", "main-suite"];
export default deploy;
