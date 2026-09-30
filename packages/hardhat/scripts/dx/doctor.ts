import { execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import {
  type Check,
  type DoctorReport,
  type Network,
  type Status,
  HASHIO,
  MIRROR,
  PACKAGES,
  activeNetwork,
  compareVersions,
  evmCode,
  feedAddressForNetwork,
  formatHbarFromWeibar,
  gitCheckIgnore,
  listTrackedFiles,
  mirror,
  parseDeployerKey,
  parseEd25519PrivateKey,
  readEnvFile,
  readFeed,
  readMaxStaleness,
  rpc,
  scanSecretShapes,
} from "./lib";

export type DoctorOptions = { repoRoot: string; strict?: boolean; network?: Network };

const MIN_NODE = "20.18.3";
const MIN_DEPLOYER_HBAR = 100;
const MIN_OPERATOR_HBAR = 20;

function textInTrackedFiles(repoRoot: string, needle: string): string[] {
  return listTrackedFiles(repoRoot).filter(file => {
    try {
      return fs.readFileSync(path.join(repoRoot, file), "utf8").includes(needle);
    } catch {
      return false;
    }
  });
}

function envFileCheck(repoRoot: string, rel: string, label: string): Check {
  if (!fs.existsSync(path.join(repoRoot, rel))) {
    return {
      id: `${label}-env`,
      title: `${rel} exists`,
      status: "MISSING",
      detail: "file not found",
      next: "yarn setup",
    };
  }
  if (!gitCheckIgnore(repoRoot, rel)) {
    return {
      id: `${label}-env`,
      title: `${rel} is git-ignored`,
      status: "UNSAFE",
      detail: "file is tracked or not matched by .gitignore",
      next: `add ${rel} to .gitignore`,
    };
  }
  return { id: `${label}-env`, title: `${rel} exists and is git-ignored`, status: "OK", detail: "ignored by git" };
}

function deployedContractsAddress(
  repoRoot: string,
  network: Network,
  name: "ComplianceToken" | "TokenSale",
): string | undefined {
  const file = path.join(repoRoot, PACKAGES.nextDeployedContracts);
  if (!fs.existsSync(file)) return undefined;
  const chainId = network === "mainnet" ? "295" : "296";
  const content = fs.readFileSync(file, "utf8");
  const match = content.match(
    new RegExp(`${chainId}\\s*:\\s*\\{[\\s\\S]*?${name}\\s*:\\s*\\{[\\s\\S]*?address:\\s*"(0x[0-9a-fA-F]{40})"`),
  );
  return match?.[1];
}

async function checkDeployer(repoRoot: string, network: Network): Promise<Check> {
  const env = readEnvFile(path.join(repoRoot, PACKAGES.hardhatEnv));
  const secret = env.DEPLOYER_PRIVATE_KEY || env.DEPLOYER_PRIVATE_KEY_ENCRYPTED;
  if (!secret) {
    return {
      id: "deployer",
      title: "Deployer key present",
      status: "MISSING",
      detail: "neither DEPLOYER_PRIVATE_KEY nor DEPLOYER_PRIVATE_KEY_ENCRYPTED is set",
      next: "yarn setup",
    };
  }
  let info;
  try {
    info = parseDeployerKey(secret);
  } catch (error) {
    return {
      id: "deployer",
      title: "Deployer key parses",
      status: "INVALID",
      detail: error instanceof Error ? error.message : String(error),
      next: "yarn setup",
    };
  }
  try {
    const weibar = BigInt((await rpc(HASHIO[network], "eth_getBalance", [info.address, "latest"])) as string);
    const low = weibar < BigInt(MIN_DEPLOYER_HBAR) * 10n ** 18n;
    return {
      id: "deployer",
      title: `Deployer address (${info.kind})`,
      status: low ? "WARN" : "OK",
      detail: `${info.address}, ${formatHbarFromWeibar(weibar)} HBAR`,
      next: low ? `fund ${info.address} at https://portal.hedera.com/faucet` : undefined,
    };
  } catch {
    return {
      id: "deployer",
      title: `Deployer address (${info.kind})`,
      status: "OK",
      detail: `${info.address} (balance unavailable)`,
    };
  }
}

async function checkOperator(repoRoot: string, network: Network): Promise<Check> {
  const env = readEnvFile(path.join(repoRoot, PACKAGES.nextEnv));
  const operatorId = env.HEDERA_OPERATOR_ID?.trim();
  const operatorKey = env.HEDERA_OPERATOR_PRIVATE_KEY?.trim();
  if (!operatorId || !operatorKey) {
    return {
      id: "operator",
      title: "Operator account configured",
      status: "MISSING",
      detail: `HEDERA_OPERATOR_ID and HEDERA_OPERATOR_PRIVATE_KEY required in ${PACKAGES.nextEnv}`,
      next: "yarn setup",
    };
  }
  let info;
  try {
    info = parseEd25519PrivateKey(operatorKey);
  } catch (error) {
    return {
      id: "operator",
      title: "Operator key parses as Ed25519",
      status: "INVALID",
      detail: error instanceof Error ? error.message : String(error),
      next: "yarn setup",
    };
  }
  const account = await mirror<{
    key?: { _type?: string; key?: string };
    balance?: { balance?: number };
  }>(MIRROR[network], `/api/v1/accounts/${operatorId}`);
  if (!account) {
    return {
      id: "operator",
      title: "Operator key matches Mirror Node",
      status: "INVALID",
      detail: `${operatorId} not found on ${network} mirror node`,
      next: "check HEDERA_OPERATOR_ID",
    };
  }
  const mirrorType = account.key?._type;
  const mirrorKey = account.key?.key?.toLowerCase();
  if (mirrorType && mirrorType !== "ED25519") {
    return {
      id: "operator",
      title: "Operator key matches Mirror Node",
      status: "INVALID",
      detail: `account key is ${mirrorType}, expected ED25519`,
      next: "yarn setup",
    };
  }
  if (mirrorKey && mirrorKey !== info.publicKeyRaw) {
    return {
      id: "operator",
      title: "Operator key matches Mirror Node",
      status: "INVALID",
      detail: `derived public key does not match ${operatorId}`,
      next: "yarn setup",
    };
  }
  const tinybar = account.balance?.balance ?? 0;
  const low = tinybar < MIN_OPERATOR_HBAR * 1e8;
  return {
    id: "operator",
    title: "Operator key matches Mirror Node",
    status: low ? "WARN" : "OK",
    detail: `${operatorId}, ${(tinybar / 1e8).toFixed(2)} HBAR`,
    next: low ? `fund ${operatorId} at https://portal.hedera.com/faucet` : undefined,
  };
}

function checkIssuer(repoRoot: string): Check[] {
  const env = readEnvFile(path.join(repoRoot, PACKAGES.nextEnv));
  const checks: Check[] = [];
  if (!env.ISSUER_DID_PRIVATE_KEY?.trim()) {
    checks.push({
      id: "issuer-key",
      title: "ISSUER_DID_PRIVATE_KEY present",
      status: "MISSING",
      detail: "not set",
      next: "yarn setup",
    });
  } else {
    try {
      const info = parseEd25519PrivateKey(env.ISSUER_DID_PRIVATE_KEY.trim());
      checks.push({ id: "issuer-key", title: "Issuer key is Ed25519", status: "OK", detail: info.publicKeyRaw });
    } catch (error) {
      checks.push({
        id: "issuer-key",
        title: "ISSUER_DID_PRIVATE_KEY is Ed25519",
        status: "INVALID",
        detail: error instanceof Error ? error.message : String(error),
        next: "yarn setup",
      });
    }
  }
  if (!env.ISSUER_DID?.trim() && !env.ISSUER_PUBLIC_KEY?.trim()) {
    checks.push({
      id: "issuer-mode",
      title: "Issuer mode configured",
      status: "MISSING",
      detail: "set ISSUER_DID (live) or ISSUER_PUBLIC_KEY (reduced)",
      next: "yarn setup",
    });
  } else {
    checks.push({
      id: "issuer-mode",
      title: "Issuer mode",
      status: "OK",
      detail: env.ISSUER_DID?.trim() ? "live (did:hedera resolution)" : "reduced (configured public key)",
    });
  }
  return checks;
}

async function checkTopic(repoRoot: string, network: Network): Promise<Check> {
  const topicId = readEnvFile(path.join(repoRoot, PACKAGES.nextEnv)).AUDIT_TOPIC_ID?.trim();
  if (!topicId) {
    return {
      id: "audit-topic",
      title: "AUDIT_TOPIC_ID set",
      status: "MISSING",
      detail: "not set",
      next: "yarn deploy:testnet",
    };
  }
  const topic = await mirror<{ created_timestamp?: string }>(MIRROR[network], `/api/v1/topics/${topicId}`);
  return {
    id: "audit-topic",
    title: "AUDIT_TOPIC_ID exists on Mirror Node",
    status: topic ? "OK" : "INVALID",
    detail: topic ? topicId : `${topicId} not found`,
    next: topic ? undefined : "yarn deploy:testnet",
  };
}

async function checkContracts(repoRoot: string, network: Network): Promise<Check[]> {
  const env = readEnvFile(path.join(repoRoot, PACKAGES.nextEnv));
  const entries: Array<[string, string, string | undefined]> = [
    [
      "compliance-token",
      "COMPLIANCE_TOKEN_ADDRESS",
      env.COMPLIANCE_TOKEN_ADDRESS?.trim() || deployedContractsAddress(repoRoot, network, "ComplianceToken"),
    ],
    [
      "token-sale",
      "TOKEN_SALE_ADDRESS",
      env.TOKEN_SALE_ADDRESS?.trim() || deployedContractsAddress(repoRoot, network, "TokenSale"),
    ],
  ];
  const checks: Check[] = [];
  for (const [id, label, address] of entries) {
    if (!address) {
      checks.push({ id, title: `${label} set`, status: "MISSING", detail: "not set", next: "yarn deploy:testnet" });
      continue;
    }
    try {
      const code = await evmCode(HASHIO[network], address);
      const hasCode = Boolean(code) && code !== "0x";
      checks.push({
        id,
        title: `${label} has contract code`,
        status: hasCode ? "OK" : "INVALID",
        detail: hasCode ? address : `${address} has no code on ${network}`,
        next: hasCode ? undefined : "yarn deploy:testnet",
      });
    } catch (error) {
      checks.push({
        id,
        title: `${label} has contract code`,
        status: "INVALID",
        detail: error instanceof Error ? error.message : String(error),
        next: "yarn deploy:testnet",
      });
    }
  }
  return checks;
}

async function checkPriceFeed(repoRoot: string, network: Network): Promise<Check> {
  const env = readEnvFile(path.join(repoRoot, PACKAGES.nextEnv));
  const tokenSale = env.TOKEN_SALE_ADDRESS?.trim() || deployedContractsAddress(repoRoot, network, "TokenSale");
  const feedAddress = feedAddressForNetwork(network);
  try {
    const round = await readFeed(HASHIO[network], feedAddress);
    const staleness = (tokenSale ? await readMaxStaleness(HASHIO[network], tokenSale) : undefined) ?? 86400;
    const age = Math.floor(Date.now() / 1000) - round.updatedAt;
    const fresh = age >= 0 && age <= staleness;
    return {
      id: "price-feed",
      title: "Chainlink HBAR/USD feed is fresh",
      status: fresh ? "OK" : "WARN",
      detail: `${feedAddress}, answer ${round.answer.toString()}, age ${age}s (max ${staleness}s)`,
      next: fresh ? undefined : "feed is stale; buys revert with StalePrice",
    };
  } catch (error) {
    return {
      id: "price-feed",
      title: "Chainlink HBAR/USD feed is fresh",
      status: "INVALID",
      detail: error instanceof Error ? error.message : String(error),
      next: "check HBAR_USD_FEED / RPC",
    };
  }
}

export async function runDoctor(options: DoctorOptions): Promise<DoctorReport> {
  const { repoRoot } = options;
  const network = options.network ?? activeNetwork();
  const checks: Check[] = [];

  const nodeOk = compareVersions(process.version.replace(/^v/, ""), MIN_NODE) >= 0;
  checks.push({
    id: "node",
    title: `Node >= ${MIN_NODE}`,
    status: nodeOk ? "OK" : "INVALID",
    detail: process.version,
    next: nodeOk ? undefined : `install Node >= ${MIN_NODE}`,
  });

  let packageManager = "";
  try {
    packageManager = `yarn ${execFileSync("yarn", ["--version"], { encoding: "utf8" }).trim()}`;
  } catch {
    try {
      packageManager = `npm ${execFileSync("npm", ["--version"], { encoding: "utf8" }).trim()}`;
    } catch {
      packageManager = "";
    }
  }
  checks.push({
    id: "package-manager",
    title: "yarn (or npm) available",
    status: packageManager ? "OK" : "MISSING",
    detail: packageManager || "neither yarn nor npm found on PATH",
    next: packageManager ? undefined : "corepack enable",
  });

  checks.push(envFileCheck(repoRoot, PACKAGES.hardhatEnv, "hardhat"));
  checks.push(envFileCheck(repoRoot, PACKAGES.nextEnv, "nextjs"));

  const hits = scanSecretShapes(repoRoot, listTrackedFiles(repoRoot));
  checks.push({
    id: "tracked-secrets",
    title: "No secret-shaped strings in tracked files",
    status: hits.length === 0 ? "OK" : "UNSAFE",
    detail: hits.length === 0 ? "clean" : hits.map(h => `${h.file}:${h.line} (${h.kind})`).join(", "),
    next: hits.length === 0 ? undefined : "remove the secret and rotate it",
  });

  const nextEnv = readEnvFile(path.join(repoRoot, PACKAGES.nextEnv));
  const nextjsDeployerLeak = textInTrackedFiles(repoRoot, "DEPLOYER_PRIVATE_KEY").filter(f =>
    f.startsWith("packages/nextjs/"),
  );
  const nextEnvHasDeployerKey = Object.keys(nextEnv).some(k => k.toUpperCase().includes("DEPLOYER_PRIVATE_KEY"));
  const publicSecretKeys = Object.entries(nextEnv).filter(
    ([key, value]) => key.startsWith("NEXT_PUBLIC_") && /^(0x)?[0-9a-fA-F]{64}$/.test(value.trim()),
  );
  const leaks = [
    ...nextjsDeployerLeak.map(f => `DEPLOYER_PRIVATE_KEY in ${f}`),
    ...(nextEnvHasDeployerKey ? [`${PACKAGES.nextEnv} defines DEPLOYER_PRIVATE_KEY`] : []),
    ...publicSecretKeys.map(([k]) => `${k} holds a secret-shaped value`),
  ];
  checks.push({
    id: "nextjs-secret-leak",
    title: "No deployer key / NEXT_PUBLIC_ secret under packages/nextjs",
    status: leaks.length === 0 ? "OK" : "UNSAFE",
    detail: leaks.length === 0 ? "clean" : leaks.join(", "),
    next: leaks.length === 0 ? undefined : "remove DEPLOYER_PRIVATE_KEY from packages/nextjs/.env.local",
  });

  checks.push(await checkDeployer(repoRoot, network));
  checks.push(await checkOperator(repoRoot, network));
  checks.push(...checkIssuer(repoRoot));

  const adminToken = nextEnv.ADMIN_API_TOKEN?.trim() ?? "";
  checks.push({
    id: "admin-token",
    title: "ADMIN_API_TOKEN >= 32 chars",
    status: !adminToken ? "MISSING" : adminToken.length >= 32 ? "OK" : "INVALID",
    detail: !adminToken ? "not set" : `length ${adminToken.length}`,
    next: adminToken.length >= 32 ? undefined : "yarn setup",
  });

  checks.push(await checkTopic(repoRoot, network));
  checks.push(...(await checkContracts(repoRoot, network)));
  checks.push(await checkPriceFeed(repoRoot, network));

  const hardIssues = checks.filter(c => c.status === "MISSING" || c.status === "INVALID" || c.status === "UNSAFE");
  const warnings = checks.filter(c => c.status === "WARN");
  const issues = options.strict ? hardIssues.length + warnings.length : hardIssues.length;
  return { checks, issues, warnings: warnings.length, ready: issues === 0 };
}

const STATUS_MARK: Record<Status, string> = {
  OK: "[ OK ]",
  MISSING: "[MISSING]",
  INVALID: "[INVALID]",
  UNSAFE: "[UNSAFE ]",
  WARN: "[ WARN ]",
};

export function renderDoctor(report: DoctorReport): void {
  for (const check of report.checks) {
    console.log(`${STATUS_MARK[check.status]} ${check.title} — ${check.detail}`);
    if (check.next && check.status !== "OK") {
      console.log(`         next: ${check.next}`);
    }
  }
  console.log(report.ready ? "\nREADY" : `\nNOT READY: ${report.issues} issue${report.issues === 1 ? "" : "s"}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const repoRoot = path.resolve(__dirname, "../../../..");
  const report = await runDoctor({ repoRoot, strict: args.includes("--strict") });
  if (args.includes("--json")) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    renderDoctor(report);
  }
  process.exit(report.ready ? 0 : 1);
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
