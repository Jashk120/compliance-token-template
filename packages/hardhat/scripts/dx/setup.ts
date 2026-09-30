import * as path from "path";
import * as readline from "readline/promises";
import password from "@inquirer/password";
import { ethers } from "ethers";
import {
  FAUCET_URL,
  MIRROR,
  PACKAGES,
  generateEd25519Issuer,
  gitCheckIgnore,
  mirror,
  normalizeHexKey,
  parseDeployerKey,
  parseEd25519PrivateKey,
  randomHex,
  readEnvFile,
  toBase58,
  writeEnvFile,
} from "./lib";
import { renderDoctor, runDoctor } from "./doctor";

const repoRoot = path.resolve(__dirname, "../../../..");
const hardhatEnvPath = path.join(repoRoot, PACKAGES.hardhatEnv);
const nextEnvPath = path.join(repoRoot, PACKAGES.nextEnv);

const PLAIN_KEY_WARNING =
  "⚠️  Plain keys are readable by anyone with filesystem access and are only acceptable on testnet.";

async function askLine(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

async function askYesNo(question: string): Promise<boolean> {
  const answer = (await askLine(question)).toLowerCase();
  return answer === "y" || answer === "yes";
}

async function askHidden(message: string): Promise<string> {
  return (await password({ message })).trim();
}

async function askNewPassword(): Promise<string> {
  for (;;) {
    const first = await password({ message: "Choose a password to encrypt the deployer key:" });
    const second = await password({ message: "Confirm password:" });
    if (first === second) return first;
    console.log("Passwords do not match, try again.");
  }
}

function statusOf(report: Awaited<ReturnType<typeof runDoctor>>, id: string): string {
  return report.checks.find(check => check.id === id)?.status ?? "MISSING";
}

async function main(): Promise<void> {
  for (const rel of [PACKAGES.hardhatEnv, PACKAGES.nextEnv]) {
    if (!gitCheckIgnore(repoRoot, rel)) {
      console.error(`Refusing to write: ${rel} is not git-ignored.`);
      process.exit(1);
    }
  }

  let report = await runDoctor({ repoRoot });
  const hardhatUpdate: Record<string, string | undefined> = {};
  const nextUpdate: Record<string, string | undefined> = {};

  const deployerStatus = statusOf(report, "deployer");
  if (deployerStatus !== "OK" && deployerStatus !== "WARN") {
    console.log("\nDeployer key is missing or invalid.");
    const choice = await askLine("Key type — [1] encrypted keystore (recommended), [2] plain testnet key: ");
    const raw = await askHidden("Paste deployer private key (hidden input): ");
    const info = parseDeployerKey(raw);
    if (choice.trim() === "2") {
      console.log(PLAIN_KEY_WARNING);
      hardhatUpdate.DEPLOYER_PRIVATE_KEY = normalizeHexKey(raw);
      hardhatUpdate.DEPLOYER_PRIVATE_KEY_ENCRYPTED = undefined;
    } else {
      if (!info.privateKey) throw new Error("Expected a plain private key to encrypt");
      const pass = await askNewPassword();
      hardhatUpdate.DEPLOYER_PRIVATE_KEY_ENCRYPTED = await new ethers.Wallet(info.privateKey).encrypt(pass);
      hardhatUpdate.DEPLOYER_PRIVATE_KEY = undefined;
    }
    console.log(`Deployer address: ${info.address}`);
  }

  const operatorStatus = statusOf(report, "operator");
  if (operatorStatus !== "OK" && operatorStatus !== "WARN") {
    console.log("\nOperator account is missing or invalid.");
    const accountId = await askLine("Hedera operator account id (e.g. 0.0.12345): ");
    if (!/^\d+\.\d+\.\d+$/.test(accountId)) {
      throw new Error("Operator account id must look like 0.0.12345");
    }
    const raw = await askHidden("Paste operator Ed25519 private key (hidden input): ");
    const info = parseEd25519PrivateKey(raw);
    const account = await mirror<{ key?: { key?: string } }>(MIRROR.testnet, `/api/v1/accounts/${accountId}`);
    if (account?.key?.key && account.key.key.toLowerCase() !== info.publicKeyRaw) {
      throw new Error(`Provided key does not match the Mirror Node key for ${accountId}`);
    }
    nextUpdate.HEDERA_OPERATOR_ID = accountId;
    nextUpdate.HEDERA_OPERATOR_PRIVATE_KEY = info.der;
    console.log(`Operator public key: ${info.publicKeyRaw}`);
  }

  if (statusOf(report, "issuer-key") !== "OK") {
    const generated = generateEd25519Issuer();
    nextUpdate.ISSUER_DID_PRIVATE_KEY = generated.der;
    nextUpdate.ISSUER_PUBLIC_KEY = generated.publicKeyBase58;
    console.log(
      `\nGenerated issuer Ed25519 key (public key ${generated.publicKeyBase58}); reduced mode enabled until a DID is registered.`,
    );
  } else if (statusOf(report, "issuer-mode") !== "OK") {
    const issuerKey = readEnvFile(nextEnvPath).ISSUER_DID_PRIVATE_KEY;
    if (issuerKey) {
      const info = parseEd25519PrivateKey(issuerKey);
      nextUpdate.ISSUER_PUBLIC_KEY = toBase58(Buffer.from(info.publicKeyRaw, "hex"));
      console.log("\nEnabled issuer reduced mode from the existing key.");
    }
  }

  if (statusOf(report, "admin-token") !== "OK") {
    nextUpdate.ADMIN_API_TOKEN = randomHex(32);
    console.log("\nGenerated a new ADMIN_API_TOKEN (32 random bytes).");
  }

  if (!readEnvFile(hardhatEnvPath).INVESTOR_PRIVATE_KEY) {
    if (await askYesNo("\nGenerate a throwaway investor key for `yarn proof`? [y/N]: ")) {
      const wallet = ethers.Wallet.createRandom();
      hardhatUpdate.INVESTOR_PRIVATE_KEY = wallet.privateKey;
      console.log(`Investor address: ${wallet.address}`);
    }
  }

  if (Object.keys(hardhatUpdate).length > 0) writeEnvFile(hardhatEnvPath, hardhatUpdate, { merge: true });
  if (readEnvFile(nextEnvPath).DEPLOYER_PRIVATE_KEY) nextUpdate.DEPLOYER_PRIVATE_KEY = undefined;
  if (Object.keys(nextUpdate).length > 0) writeEnvFile(nextEnvPath, nextUpdate, { merge: true });

  report = await runDoctor({ repoRoot });
  console.log("");
  renderDoctor(report);

  const lowBalance = report.checks.some(
    check => check.status === "WARN" && (check.id === "deployer" || check.id === "operator"),
  );
  if (lowBalance) {
    console.log(`\nFund the account at the testnet faucet: ${FAUCET_URL}`);
  }
  console.log("\nNext: yarn deploy:testnet");
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
