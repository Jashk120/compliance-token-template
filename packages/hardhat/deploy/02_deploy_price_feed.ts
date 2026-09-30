import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";

import { getDeployGasPrice } from "../utils/getDeployGasPrice";

// Chainlink HBAR/USD proxies (8 decimals). Source:
// https://docs.chain.link/data-feeds/price-feeds/addresses?network=hedera
const TESTNET_FEED = "0x59bC155EB6c6C415fE43255aF66EcF0523c92B4a";
const MAINNET_FEED = "0xAF685FB45C12b92b5054ccb9313e135525F9b5d5";

const deployPriceFeed: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const isLocal = hre.network.name === "hardhat" || hre.network.name === "localhost";
  let aggregatorAddress: string;

  if (isLocal) {
    const aggregator = await deploy("MockChainlinkAggregator", {
      from: deployer,
      args: [8, "100000000"], // 8 decimals, $1.00
      log: true,
      autoMine: true,
      gasLimit: "3000000",
      gasPrice: await getDeployGasPrice(hre),
    });
    aggregatorAddress = aggregator.address;
  } else {
    aggregatorAddress = hre.network.config.chainId === 295 ? MAINNET_FEED : TESTNET_FEED;
  }

  await deploy("ChainlinkPriceFeedAdapter", {
    from: deployer,
    args: [aggregatorAddress],
    log: true,
    autoMine: true,
    gasLimit: "1000000",
    gasPrice: await getDeployGasPrice(hre),
  });
};

deployPriceFeed.tags = ["ChainlinkPriceFeedAdapter"];
export default deployPriceFeed;
