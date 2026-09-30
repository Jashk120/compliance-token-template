import { execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { Client, ContractExecuteTransaction, ContractId, PrivateKey, TopicCreateTransaction } from "@hiero-ledger/sdk";
import { ethers } from "ethers";
import {
  HASHIO,
  HASHSCAN,
  MIRROR,
  OPERATOR_LONG_ZERO,
  PACKAGES,
  generateEd25519Issuer,
  mirror,
  parseEd25519PrivateKey,
  readEnvFile,
  resolveDeployerKey,
  toBase58,
  writeEnvFile,
} from "./lib";
import { renderDoctor, runDoctor } from "./doctor";

const repoRoot = path.resolve(__dirname, "../../../..");
const hardhatRoot = path.join(repoRoot, "packages/hardhat");
const nextEnvPath = path.join(repoRoot, PACKAGES.nextEnv);
const deploymentsDir = path.join(hardhatRoot, "deployments/hederaTestnet");

function cleanEnv(extra: Record<string, string | undefined>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const [key, value] of Object.entries(extra)) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
  return env;
}

function runHardhat(args: string[], extraEnv: Record<string, string | undefined>, label: string): string {
  console.log(`\n▶ ${label}`);
  try {
    const out = execFileSync("yarn", ["hardhat", ...args], {
      cwd: hardhatRoot,
      env: cleanEnv(extraEnv),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    process.stdout.write(out);
    return out;
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string };
    if (err.stdout) process.stdout.write(err.stdout);
    if (err.stderr) process.stderr.write(err.stderr);
    throw new Error(`${label} failed`);
  }
}

function deployment(name: string): { address: string; abi: any[] } | undefined {
  const file = path.join(deploymentsDir, `${name}.json`);
  if (!fs.existsSync(file)) return undefined;
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  return { address: parsed.address, abi: parsed.abi };
}

async function operatorHasOfficerRole(compliance: { address: string; abi: any[] }): Promise<boolean> {
  const provider = new ethers.JsonRpcProvider(HASHIO.testnet);
  const contract = new ethers.Contract(compliance.address, compliance.abi, provider);
  const role = await contract.COMPLIANCE_OFFICER_ROLE();
  return Boolean(await contract.hasRole(role, OPERATOR_LONG_ZERO));
}

async function probeOperatorCaller(): Promise<boolean> {
  const probe = deployment("CallerProbe");
  if (!probe) {
    console.log("⚠️  CallerProbe not deployed — cannot grant the operator role yet");
    return false;
  }
  const nextEnv = readEnvFile(nextEnvPath);
  const operatorId = nextEnv.HEDERA_OPERATOR_ID;
  const operatorKey = nextEnv.HEDERA_OPERATOR_PRIVATE_KEY;
  if (!operatorId || !operatorKey) {
    console.log("⚠️  Operator account missing — cannot run the CallerProbe proof");
    return false;
  }
  const client = Client.forTestnet().setOperator(
    operatorId,
    PrivateKey.fromString(parseEd25519PrivateKey(operatorKey).der),
  );
  try {
    const response = await new ContractExecuteTransaction()
      .setContractId(ContractId.fromEvmAddress(0, 0, probe.address))
      .setGas(100_000)
      .setFunction("record")
      .execute(client);
    const receipt = await response.getReceipt(client);
    if (receipt.status.toString() !== "SUCCESS") {
      console.log(`⚠️  CallerProbe.record() returned ${receipt.status.toString()}`);
      return false;
    }
    const txId = response.transactionId.toString();
    const mirrorId = txId.replace("@", "-").replace(/\.(\d+)$/, "-$1");
    for (let attempt = 0; attempt < 6; attempt++) {
      const result = await mirror<{ logs?: Array<{ topics?: string[] }> }>(
        MIRROR.testnet,
        `/api/v1/contracts/results/${mirrorId}`,
      );
      const caller = result?.logs?.map(log => log.topics?.[1]).find(Boolean);
      if (caller) {
        const address = `0x${caller.slice(26).toLowerCase()}`;
        console.log(`   CallerProbe recorded msg.sender ${address}`);
        return address === OPERATOR_LONG_ZERO;
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    console.log("⚠️  Could not read the CallerProbe result from the Mirror Node");
    return false;
  } finally {
    client.close();
  }
}

async function createAuditTopic(): Promise<string> {
  const nextEnv = readEnvFile(nextEnvPath);
  const client = Client.forTestnet().setOperator(
    nextEnv.HEDERA_OPERATOR_ID,
    PrivateKey.fromString(parseEd25519PrivateKey(nextEnv.HEDERA_OPERATOR_PRIVATE_KEY).der),
  );
  try {
    const receipt = await (await new TopicCreateTransaction().execute(client)).getReceipt(client);
    if (receipt.status.toString() !== "SUCCESS" || !receipt.topicId) {
      throw new Error(`Topic creation failed: ${receipt.status.toString()}`);
    }
    return receipt.topicId.toString();
  } finally {
    client.close();
  }
}

function registerIssuerDid(): string | undefined {
  const nextEnv = readEnvFile(nextEnvPath);
  console.log("\n▶ registering the issuer DID (live)");
  try {
    const out = execFileSync("yarn", ["workspace", "@sh/nextjs", "issuer:register"], {
      cwd: repoRoot,
      env: cleanEnv({ ...nextEnv, HEDERA_NETWORK: "testnet" }),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const match = out.match(/ISSUER_DID=(\S+)/);
    if (!match) throw new Error("issuer:register did not print ISSUER_DID");
    return match[1];
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string };
    const detail = `${err.stdout ?? ""}${err.stderr ?? ""}`.trim().split("\n").pop();
    console.log(`⚠️  Live DID registration failed: ${detail ?? "unknown error"}`);
    return undefined;
  }
}

async function main(): Promise<void> {
  const report = await runDoctor({ repoRoot, strict: true });
  if (!report.ready) {
    renderDoctor(report);
    console.error("\nNOT READY for deploy:testnet. Fix the issues above (start with `yarn setup`).");
    process.exit(1);
  }

  const deployerKey = await resolveDeployerKey(repoRoot);
  const nextUpdate: Record<string, string | undefined> = {};
  const skipped: string[] = [];

  const deploymentEnv = { __RUNTIME_DEPLOYER_PRIVATE_KEY: deployerKey, DX_SKIP_TS_ABI: "true" };
  const deployOutput = runHardhat(
    ["deploy", "--network", "hederaTestnet"],
    deploymentEnv,
    "deploying contracts (hardhat-deploy resumes)",
  );
  if (/reusing|already deployed/i.test(deployOutput)) skipped.push("contracts (already deployed)");

  const compliance = deployment("ComplianceToken");
  const sale = deployment("TokenSale");
  if (!compliance || !sale) throw new Error("Deployment JSON missing after deploy");

  const tokenOutput = runHardhat(
    ["run", "scripts/createLiveToken.ts", "--network", "hederaTestnet"],
    deploymentEnv,
    "creating the HTS compliance token",
  );
  if (/already (created|exists)|tokenAddress\(\) != 0|0x0{40}/i.test(tokenOutput))
    skipped.push("HTS token (already created)");

  if (await operatorHasOfficerRole(compliance)) {
    skipped.push("operator COMPLIANCE_OFFICER_ROLE (already granted)");
    console.log("\n• operator already holds COMPLIANCE_OFFICER_ROLE — skipped");
  } else if (await probeOperatorCaller()) {
    runHardhat(
      ["deploy", "--network", "hederaTestnet", "--tags", "GrantRoles"],
      { ...deploymentEnv, GRANT_OPERATOR_OFFICER: "true" },
      "granting COMPLIANCE_OFFICER_ROLE to the operator (CallerProbe proven)",
    );
  } else {
    console.log("⚠️  CallerProbe did not confirm the operator long-zero address; operator role left ungranted");
  }

  let topicId = readEnvFile(nextEnvPath).AUDIT_TOPIC_ID?.trim();
  if (topicId) {
    skipped.push(`audit topic (${topicId})`);
    console.log(`\n• AUDIT_TOPIC_ID already set (${topicId}) — skipped`);
  } else {
    console.log("\n▶ creating the HCS audit topic");
    topicId = await createAuditTopic();
    nextUpdate.AUDIT_TOPIC_ID = topicId;
  }

  const existingDid = readEnvFile(nextEnvPath).ISSUER_DID?.trim();
  if (existingDid) {
    skipped.push(`issuer DID (${existingDid})`);
    console.log(`\n• ISSUER_DID already set — skipped`);
  } else {
    const did = registerIssuerDid();
    if (did) {
      nextUpdate.ISSUER_DID = did;
      nextUpdate.ISSUER_PUBLIC_KEY = undefined;
    } else {
      const issuerKey = readEnvFile(nextEnvPath).ISSUER_DID_PRIVATE_KEY?.trim();
      if (issuerKey) {
        const info = parseEd25519PrivateKey(issuerKey);
        nextUpdate.ISSUER_PUBLIC_KEY = toBase58(Buffer.from(info.publicKeyRaw, "hex"));
      } else {
        const generated = generateEd25519Issuer();
        nextUpdate.ISSUER_DID_PRIVATE_KEY = generated.der;
        nextUpdate.ISSUER_PUBLIC_KEY = generated.publicKeyBase58;
      }
      console.log("⚠️  Falling back to reduced issuer mode (ISSUER_PUBLIC_KEY). Live DID resolution is NOT enabled.");
    }
  }

  nextUpdate.COMPLIANCE_TOKEN_ADDRESS = compliance.address;
  nextUpdate.TOKEN_SALE_ADDRESS = sale.address;
  nextUpdate.DEPLOYER_PRIVATE_KEY = undefined;
  writeEnvFile(nextEnvPath, nextUpdate, { merge: true });

  const finalEnv = readEnvFile(nextEnvPath);
  const explorer = HASHSCAN.testnet;
  console.log("\n── HashScan ─────────────────────────────────────────────");
  console.log(`ComplianceToken  ${explorer}/contract/${compliance.address}`);
  console.log(`TokenSale        ${explorer}/contract/${sale.address}`);
  if (finalEnv.AUDIT_TOPIC_ID) console.log(`Audit topic      ${explorer}/topic/${finalEnv.AUDIT_TOPIC_ID}`);
  const didTopic = finalEnv.ISSUER_DID?.split("_").pop();
  if (didTopic) console.log(`Issuer DID topic ${explorer}/topic/${didTopic}`);
  if (skipped.length > 0) console.log(`\nResumed — skipped: ${skipped.join(", ")}`);
  console.log("\nNext: yarn doctor && yarn next:dev");
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
