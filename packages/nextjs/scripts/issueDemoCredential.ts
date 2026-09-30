import { canonicalJson } from "../utils/compliance/canonical";
import { PrivateKey } from "@hiero-ledger/sdk";
import { privateKeyToAccount } from "viem/accounts";

const PKCS8_ED25519_PREFIX = "302e020100300506032b657004220420";

function readFlag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index !== -1 ? process.argv[index + 1] : undefined;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

function issuerPrivateKey(): PrivateKey {
  const raw = required("ISSUER_DID_PRIVATE_KEY");
  return raw.startsWith(PKCS8_ED25519_PREFIX) ? PrivateKey.fromStringDer(raw) : PrivateKey.fromStringED25519(raw);
}

function resolveSubject(): string {
  const explicit = readFlag("--address") ?? process.env.INVESTOR_ADDRESS;
  if (explicit) {
    return explicit;
  }
  const investorKey = process.env.INVESTOR_PRIVATE_KEY?.trim();
  if (investorKey) {
    return privateKeyToAccount(investorKey as `0x${string}`).address;
  }
  throw new Error(
    "No investor address found. Pass --address 0x..., set INVESTOR_ADDRESS, or set INVESTOR_PRIVATE_KEY in packages/hardhat/.env",
  );
}

function main(): void {
  const subject = resolveSubject();
  const issuerDid = required("ISSUER_DID");
  const days = Number(readFlag("--days") ?? "30");

  const issuedAt = new Date();
  const unsigned = {
    subject,
    issuer: issuerDid,
    issuedAt: issuedAt.toISOString(),
    expiresAt: new Date(issuedAt.getTime() + days * 24 * 60 * 60 * 1000).toISOString(),
    claims: { kycLevel: 1 },
  };
  const signature = Buffer.from(issuerPrivateKey().sign(new TextEncoder().encode(canonicalJson(unsigned)))).toString(
    "base64",
  );

  process.stdout.write(`${JSON.stringify({ ...unsigned, signature }, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
