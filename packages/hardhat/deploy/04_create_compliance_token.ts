import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";

const CREATION_FEE = "1000000000000000000"; // 1 HBAR in weibar
const DECIMALS = 6;
const INITIAL_SUPPLY = "1000000000000"; // 1,000,000 tokens with 6 decimals

// Local-only demo: authorise the sale, create the token and KYC the deployer so the
// app has something to call immediately after `yarn hardhat:deploy --network localhost`.
const createComplianceToken: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    return;
  }

  const { deployer } = await hre.getNamedAccounts();
  const { get } = hre.deployments;

  const complianceToken = await hre.ethers.getContractAt("ComplianceToken", (await get("ComplianceToken")).address);
  const tokenSale = await hre.ethers.getContractAt("TokenSale", (await get("TokenSale")).address);

  await (
    await complianceToken.grantRole(await complianceToken.SALE_OPERATOR_ROLE(), await tokenSale.getAddress())
  ).wait();
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
