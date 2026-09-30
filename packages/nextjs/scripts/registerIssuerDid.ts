import { createDID } from "@hiero-did-sdk/registrar";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

async function main(): Promise<void> {
  const network = process.env.HEDERA_NETWORK === "mainnet" ? "mainnet" : "testnet";
  const operatorId = required("HEDERA_OPERATOR_ID");
  const operatorKey = required("HEDERA_OPERATOR_PRIVATE_KEY");
  const issuerKey = process.env.ISSUER_DID_PRIVATE_KEY;

  const result = await createDID(issuerKey ? { privateKey: issuerKey } : {}, {
    clientOptions: { privateKey: operatorKey, accountId: operatorId, network },
  });

  process.stdout.write(`ISSUER_DID=${result.did}\n`);
  if (!issuerKey && result.privateKey) {
    process.stdout.write(`ISSUER_DID_PRIVATE_KEY=${result.privateKey.toString()}\n`);
  }
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
