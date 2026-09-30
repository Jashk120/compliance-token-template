import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";

// The Ed25519 operator account 0.0.8812811 acts through the Hedera SDK, so contracts
// see it as this long-zero address. COMPLIANCE_OFFICER_ROLE is only granted to it when
// GRANT_OPERATOR_OFFICER=true, after LIVE-3 has proven the msg.sender assumption.
const OPERATOR_LONG_ZERO = "0x000000000000000000000000000000000086790b";

const grantRoles: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { get } = hre.deployments;
  const { ethers } = hre;

  const officerEnv = process.env.OFFICER_ADDRESS;
  const officer = officerEnv && ethers.isAddress(officerEnv) ? officerEnv : deployer;

  const complianceToken = await ethers.getContractAt("ComplianceToken", (await get("ComplianceToken")).address);
  const tokenSale = await ethers.getContractAt("TokenSale", (await get("TokenSale")).address);

  const officerRole = await complianceToken.COMPLIANCE_OFFICER_ROLE();
  const saleRole = await complianceToken.SALE_OPERATOR_ROLE();

  if (!(await complianceToken.hasRole(officerRole, officer))) {
    await (await complianceToken.grantRole(officerRole, officer)).wait();
    console.log(`Granted COMPLIANCE_OFFICER_ROLE to ${officer}`);
  }

  const saleAddress = await tokenSale.getAddress();
  if (!(await complianceToken.hasRole(saleRole, saleAddress))) {
    await (await complianceToken.grantRole(saleRole, saleAddress)).wait();
    console.log(`Granted SALE_OPERATOR_ROLE to ${saleAddress}`);
  }

  const operatorEnv = process.env.OPERATOR_ADDRESS;
  const operator = operatorEnv && ethers.isAddress(operatorEnv) ? operatorEnv : OPERATOR_LONG_ZERO;
  if (process.env.GRANT_OPERATOR_OFFICER === "true" && !(await complianceToken.hasRole(officerRole, operator))) {
    await (await complianceToken.grantRole(officerRole, operator)).wait();
    console.log(`Granted COMPLIANCE_OFFICER_ROLE to operator ${operator}`);
  }
};

grantRoles.tags = ["GrantRoles"];
export default grantRoles;
