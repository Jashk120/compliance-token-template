import { createDID } from "@hiero-did-sdk/registrar";
import { PrivateKey } from "@hiero-ledger/sdk";

const PKCS8_ED25519_PREFIX = "302e020100300506032b657004220420";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

// @hiero-did-sdk/registrar accepts the issuer key as a DER/PKCS#8 string. The
// stored ISSUER_DID_PRIVATE_KEY is the raw 32-byte Ed25519 hex form, so convert
// it when needed.
function issuerDerKey(raw: string): string {
  return raw.startsWith(PKCS8_ED25519_PREFIX) ? raw : PrivateKey.fromStringED25519(raw).toStringDer();
}

async function main(): Promise<void> {
  const network = process.env.HEDERA_NETWORK === "mainnet" ? "mainnet" : "testnet";
  const operatorId = required("HEDERA_OPERATOR_ID");
  const operatorKey = required("HEDERA_OPERATOR_PRIVATE_KEY");
  const issuerKey = process.env.ISSUER_DID_PRIVATE_KEY;

  const result = await createDID(issuerKey ? { privateKey: issuerDerKey(issuerKey) } : {}, {
    clientOptions: { privateKey: operatorKey, accountId: operatorId, network },
  });

  const lines = [`ISSUER_DID=${result.did}`];
  const topicId = result.did.split("_").at(-1);
  if (topicId && /^\d+\.\d+\.\d+$/.test(topicId)) {
    lines.push(`ISSUER_TOPIC_ID=${topicId}`);
    lines.push(`TOPIC_EXPLORER=https://hashscan.io/${network}/topic/${topicId}`);
  }
  if (!issuerKey && result.privateKey) {
    lines.push(`ISSUER_DID_PRIVATE_KEY=${result.privateKey.toStringDer()}`);
  }

  // The registrar opens a Hedera client it does not expose, so exit explicitly
  // once the output is flushed.
  process.stdout.write(`${lines.join("\n")}\n`, () => process.exit(0));
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`, () => process.exit(1));
});
