import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";

import { getDeployGasPrice } from "../utils/getDeployGasPrice";

const deployMockHts: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    return;
  }

  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  await deploy("MockHTS", {
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
    gasLimit: "5000000",
    gasPrice: await getDeployGasPrice(hre),
  });
};

deployMockHts.tags = ["MockHTS"];
export default deployMockHts;
