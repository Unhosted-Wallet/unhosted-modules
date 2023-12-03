import hre, { deployments, ethers } from "hardhat";
import { BytesLike } from "ethers";
import { EntryPoint__factory } from "../../typechain";

export const getEntryPoint = async () => {
  const EntryPointDeployment = await deployments.get("EntryPoint");
  return EntryPoint__factory.connect(
    EntryPointDeployment.address,
    ethers.provider.getSigner()
  );
};

export const getSmartAccountImplementation = async () => {
  const SmartAccountImplDeployment = await deployments.get("SmartAccount");
  const SmartAccountImpl = await hre.ethers.getContractFactory("SmartAccount");
  return SmartAccountImpl.attach(SmartAccountImplDeployment.address);
};

export const getSmartAccountFactory = async () => {
  const SAFactoryDeployment = await deployments.get("SmartAccountFactory");
  const SmartAccountFactory = await hre.ethers.getContractFactory(
    "SmartAccountFactory"
  );
  const smartAccountFactory = SmartAccountFactory.attach(
    SAFactoryDeployment.address
  );
  return smartAccountFactory;
};

export const getEcdsaOwnershipRegistryModule = async () => {
  const EcdsaOwnershipRegistryModuleDeployment = await deployments.get(
    "EcdsaOwnershipRegistryModule"
  );
  const EcdsaOwnershipRegistryModule = await hre.ethers.getContractFactory(
    "EcdsaOwnershipRegistryModule"
  );
  return EcdsaOwnershipRegistryModule.attach(
    EcdsaOwnershipRegistryModuleDeployment.address
  );
};

export const getSmartAccountWithModule = async (
  moduleSetupContract: string,
  moduleSetupData: BytesLike,
  index: number
) => {
  const factory = await getSmartAccountFactory();
  const expectedSmartAccountAddress =
    await factory.getAddressForCounterFactualAccount(
      moduleSetupContract,
      moduleSetupData,
      index
    );
  await factory.deployCounterFactualAccount(
    moduleSetupContract,
    moduleSetupData,
    index
  );
  return await hre.ethers.getContractAt(
    "SmartAccount",
    expectedSmartAccountAddress
  );
};

export const getStrategyModuleImplementation = async () => {
  const StrategyModuleImplDeployment = await deployments.get("StrategyModule");
  const StrategyModuleImpl = await hre.ethers.getContractFactory(
    "StrategyModule"
  );
  return StrategyModuleImpl.attach(StrategyModuleImplDeployment.address);
};

export const getStrategyModuleFactory = async () => {
  const SMFactoryDeployment = await deployments.get("StrategyModuleFactory");
  const StrategyModuleFactory = await hre.ethers.getContractFactory(
    "StrategyModuleFactory"
  );
  const strategyModuleFactory = StrategyModuleFactory.attach(
    SMFactoryDeployment.address
  );
  return strategyModuleFactory;
};

export const getStrategyModule = async (
  beneficiary: string,
  handler: BytesLike,
  index: number
) => {
  const factory = await getStrategyModuleFactory();
  const expectedStrategyModuleAddress =
    await factory.getAddressForStrategyModule(beneficiary, handler, index);
  await factory.deployStrategyModule(beneficiary, handler, index);
  return await hre.ethers.getContractAt(
    "StrategyModule",
    expectedStrategyModuleAddress
  );
};
