import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";

import { getDeployGasPrice } from "../utils/getDeployGasPrice";

// Test helper used by the live proof (LIVE-3c) to record the `msg.sender` the EVM
// sees when the Hedera SDK operator calls a contract. Skipped on mainnet.
const deployCallerProbe: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (hre.network.name === "hederaMainnet") {
    return;
  }

  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  await deploy("CallerProbe", {
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
    gasLimit: "1000000",
    gasPrice: await getDeployGasPrice(hre),
    contract: "contracts/test/CallerProbe.sol:CallerProbe",
  });
};

deployCallerProbe.tags = ["CallerProbe"];
export default deployCallerProbe;
