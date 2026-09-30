import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";

import { getDeployGasPrice } from "../utils/getDeployGasPrice";

const DEFAULT_HTS = "0x0000000000000000000000000000000000000167";

// HBAR forwarded to the HTS precompile per token creation, in tinybar (8 decimals,
// the unit of Hedera's EVM `msg.value`).
// HIP-358 prices a precompile TokenCreate at the HAPI fee plus a 20% premium. The
// HAPI TokenCreate fee is about $1 USD in HBAR (~13 HBAR at ~$0.077/HBAR on testnet),
// so the precompile needs ~15.5 HBAR; 20 HBAR is a deliberate buffer against price
// movement. The precompile consumes the value (no refund), so ComplianceToken.createToken
// forwards exactly this amount and refunds any surplus the caller sent.
const CREATION_FEE = "2000000000";

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
