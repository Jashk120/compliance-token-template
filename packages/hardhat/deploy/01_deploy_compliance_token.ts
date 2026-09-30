import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";

import { getDeployGasPrice } from "../utils/getDeployGasPrice";

const DEFAULT_HTS = "0x0000000000000000000000000000000000000167";
const CREATION_FEE = "1000000000000000000"; // 1 HBAR in weibar (18 decimals)

const deployComplianceToken: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy, getOrNull } = hre.deployments;

  const mockHts = await getOrNull("MockHTS");
  const htsAddress = mockHts?.address ?? DEFAULT_HTS;

  await deploy("ComplianceToken", {
    from: deployer,
    args: [deployer, htsAddress, CREATION_FEE],
    log: true,
    autoMine: true,
    gasLimit: "3000000",
    gasPrice: await getDeployGasPrice(hre),
  });
};

deployComplianceToken.tags = ["ComplianceToken"];
export default deployComplianceToken;
