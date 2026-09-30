import { Client, PrivateKey, Status, TopicCreateTransaction } from "@hiero-ledger/sdk";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

async function main(): Promise<void> {
  const network = process.env.HEDERA_NETWORK === "mainnet" ? "mainnet" : "testnet";
  const client = network === "mainnet" ? Client.forMainnet() : Client.forTestnet();
  client.setOperator(required("HEDERA_OPERATOR_ID"), PrivateKey.fromString(required("HEDERA_OPERATOR_PRIVATE_KEY")));

  const response = await new TopicCreateTransaction().execute(client);
  const receipt = await response.getReceipt(client);
  if (receipt.status.toString() !== Status.Success.toString() || !receipt.topicId) {
    throw new Error(`Topic creation failed with status ${receipt.status.toString()}`);
  }

  process.stdout.write(`AUDIT_TOPIC_ID=${receipt.topicId.toString()}\n`);
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
