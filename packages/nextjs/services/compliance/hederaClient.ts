import { getServerConfig } from "./config";
import { Client } from "@hiero-ledger/sdk";

let cachedClient: Client | null = null;
let cachedKey = "";

export function getOperatorClient(): Client {
  const config = getServerConfig();
  const key = `${config.network}:${config.operatorId}`;
  if (cachedClient && cachedKey === key) {
    return cachedClient;
  }
  const client = config.network === "mainnet" ? Client.forMainnet() : Client.forTestnet();
  client.setOperator(config.operatorId, config.operatorKey);
  cachedClient = client;
  cachedKey = key;
  return client;
}
