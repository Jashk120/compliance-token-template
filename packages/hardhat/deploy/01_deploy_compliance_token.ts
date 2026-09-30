import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";

import { getDeployGasPrice } from "../utils/getDeployGasPrice";

const DEFAULT_HTS = "0x0000000000000000000000000000000000000167";

// HBAR forwarded to the HTS precompile per token creation, in weibar (18 decimals).
// A Hedera TokenCreate costs about $1 USD in HBAR. At the HBAR price measured when
// this template was built (~$0.104, 2026-09-30) that is under 10 HBAR, so 15 HBAR is
// a deliberate buffer against price movement. The precompile does NOT refund unused
// value, so ComplianceToken.createToken forwards exactly this amount and refunds any
// surplus the caller sent.
const CREATION_FEE = "15000000000000000000";

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
