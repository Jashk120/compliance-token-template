import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";

// Must match CREATION_FEE in 01_deploy_compliance_token.ts (20 HBAR, in tinybar).
const CREATION_FEE = "2000000000";
const DECIMALS = 6;
const INITIAL_SUPPLY = "1000000000000"; // 1,000,000 tokens with 6 decimals

// Local-only demo: create the token and KYC the deployer so the app has something to
// call immediately after `yarn hardhat:deploy --network localhost`. Roles are granted
// by 04_grant_roles.ts, which runs on every network.
const createComplianceToken: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    return;
  }

  const { deployer } = await hre.getNamedAccounts();
  const { get } = hre.deployments;

  const complianceToken = await hre.ethers.getContractAt("ComplianceToken", (await get("ComplianceToken")).address);

  await (
    await complianceToken.createToken("Compliance Token", "CMP", DECIMALS, INITIAL_SUPPLY, { value: CREATION_FEE })
  ).wait();

  const tokenAddress = await complianceToken.tokenAddress();
  const hts = await hre.ethers.getContractAt("MockHTS", (await get("MockHTS")).address);
  await (await hts.associateToken(deployer, tokenAddress)).wait();
  await (await complianceToken.grantKyc(deployer)).wait();

  console.log(`Compliance token ready at ${tokenAddress}`);
};

createComplianceToken.tags = ["CreateComplianceToken"];
export default createComplianceToken;
