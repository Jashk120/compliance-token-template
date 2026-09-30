import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";

import { getDeployGasPrice } from "../utils/getDeployGasPrice";

const TOKEN_PRICE_USD8 = "100000000"; // $1.00 per whole token (8 decimals)
const TOKEN_UNIT = "1000000"; // 10 ** token decimals (token decimals = 6)
const PER_INVESTOR_CAP_USD8 = "100000000000"; // $1000.00 per investor (8 decimals)
const MAX_STALENESS = 86400; // 24h, the Chainlink HBAR/USD heartbeat

const deployTokenSale: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy, get } = hre.deployments;

  const complianceToken = await get("ComplianceToken");
  const priceFeed = await get("ChainlinkPriceFeedAdapter");

  await deploy("TokenSale", {
    from: deployer,
    args: [
      deployer,
      complianceToken.address,
      priceFeed.address,
      TOKEN_PRICE_USD8,
      TOKEN_UNIT,
      PER_INVESTOR_CAP_USD8,
      MAX_STALENESS,
    ],
    log: true,
    autoMine: true,
    gasLimit: "3000000",
    gasPrice: await getDeployGasPrice(hre),
  });
};

deployTokenSale.tags = ["TokenSale"];
export default deployTokenSale;
