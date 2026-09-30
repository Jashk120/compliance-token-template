import { execFileSync } from "child_process";
import { randomBytes } from "crypto";
import * as fs from "fs";
import * as path from "path";
import { ethers } from "ethers";
import { PrivateKey } from "@hiero-ledger/sdk";
import password from "@inquirer/password";
import { parse as parseEnv, stringify as stringifyEnv } from "envfile";

export const HASHIO: Record<"testnet" | "mainnet", string> = {
  testnet: "https://testnet.hashio.io/api",
  mainnet: "https://mainnet.hashio.io/api",
};
export const MIRROR: Record<"testnet" | "mainnet", string> = {
  testnet: "https://testnet.mirrornode.hedera.com",
  mainnet: "https://mainnet.mirrornode.hedera.com",
};
export const HASHSCAN: Record<"testnet" | "mainnet", string> = {
  testnet: "https://hashscan.io/testnet",
  mainnet: "https://hashscan.io/mainnet",
};
export const TESTNET_FEED = "0x59bC155EB6c6C415fE43255aF66EcF0523c92B4a";
export const MAINNET_FEED = "0xAF685FB45C12b92b5054ccb9313e135525F9b5d5";
export const OPERATOR_LONG_ZERO = "0x000000000000000000000000000000000086790b";
export const FAUCET_URL = "https://portal.hedera.com/faucet";
export const PACKAGES = {
  hardhatEnv: "packages/hardhat/.env",
  nextEnv: "packages/nextjs/.env.local",
  nextDeployedContracts: "packages/nextjs/contracts/deployedContracts.ts",
};

export type Network = "testnet" | "mainnet";
export type Status = "OK" | "MISSING" | "INVALID" | "UNSAFE" | "WARN";

export type Check = {
  id: string;
  group?: string;
  title: string;
  status: Status;
  detail: string;
  next?: string;
};

export type DoctorReport = {
  checks: Check[];
  issues: number;
  warnings: number;
  ready: boolean;
};

export function activeNetwork(): Network {
  return process.env.HEDERA_NETWORK === "mainnet" ? "mainnet" : "testnet";
}

export function compareVersions(a: string, b: string): number {
  const parse = (value: string) =>
    value
      .trim()
      .replace(/^v/, "")
      .split(".")
      .map(n => parseInt(n, 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

export function majorVersion(value: string): number {
  return parseInt(value.trim().replace(/^v/, "").split(".")[0], 10) || 0;
}

const PKCS8_ED25519_PREFIX = "302e020100300506032b657004220420";

export function isRawEd25519Hex(value: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(value.trim());
}

export function isDerPrivateKey(value: string): boolean {
  const v = value.trim();
  return /^30[0-9a-fA-F]+$/.test(v) && v.length % 2 === 0 && v.length > 64;
}

export function isEcdsaHexKey(value: string): boolean {
  return /^(0x)?[0-9a-fA-F]{64}$/.test(value.trim());
}

export function normalizeHexKey(value: string): `0x${string}` {
  const v = value.trim().replace(/^0x/i, "");
  if (!/^[0-9a-fA-F]{64}$/.test(v)) {
    throw new Error("Expected a 32-byte hex private key");
  }
  return `0x${v.toLowerCase()}` as `0x${string}`;
}

export function longZeroAddress(accountId: string): string {
  const parts = accountId.trim().split(".");
  const num = BigInt(parts[parts.length - 1] || "0");
  return `0x${num.toString(16).padStart(40, "0")}`;
}

export type Ed25519KeyInfo = {
  der: string;
  rawHex: string;
  publicKeyDer: string;
  publicKeyRaw: string;
};

export function parseEd25519PrivateKey(value: string): Ed25519KeyInfo {
  const v = value.trim();
  let key: PrivateKey;
  if (isRawEd25519Hex(v)) {
    key = PrivateKey.fromStringED25519(v);
  } else if (isDerPrivateKey(v)) {
    key = PrivateKey.fromStringDer(v);
  } else {
    throw new Error("Not an Ed25519 private key (expected raw 64-hex or DER)");
  }
  if (key.type !== "ED25519") {
    throw new Error(`Key is ${key.type}, expected ED25519`);
  }
  return {
    der: key.toStringDer(),
    rawHex: v.length === 64 ? v.toLowerCase() : key.toStringRaw().toLowerCase(),
    publicKeyDer: key.publicKey.toStringDer(),
    publicKeyRaw: key.publicKey.toStringRaw().toLowerCase(),
  };
}

export type DeployerKeyInfo = { address: string; kind: "plain" | "keystore"; privateKey?: string };

export function parseDeployerKey(secret: string): DeployerKeyInfo {
  const v = secret.trim();
  if (v.startsWith("{")) {
    let parsed: { address?: string };
    try {
      parsed = JSON.parse(v);
    } catch {
      throw new Error("Keystore value is not valid JSON");
    }
    if (!parsed.address || !/^(0x)?[0-9a-fA-F]{40}$/.test(parsed.address)) {
      throw new Error("Keystore JSON is missing a valid address");
    }
    return {
      address: ethers.getAddress(parsed.address.startsWith("0x") ? parsed.address : `0x${parsed.address}`),
      kind: "keystore",
    };
  }
  const privateKey = normalizeHexKey(v);
  return { address: new ethers.Wallet(privateKey).address, kind: "plain", privateKey };
}

export function isPkcs8Ed25519(value: string): boolean {
  return value.trim().startsWith(PKCS8_ED25519_PREFIX);
}

export async function resolveDeployerKey(repoRoot: string): Promise<string> {
  const env = readEnvFile(path.join(repoRoot, PACKAGES.hardhatEnv));
  if (env.DEPLOYER_PRIVATE_KEY) return normalizeHexKey(env.DEPLOYER_PRIVATE_KEY);
  if (env.DEPLOYER_PRIVATE_KEY_ENCRYPTED) {
    const pass = await password({ message: "Deployer password: " });
    const wallet = await ethers.Wallet.fromEncryptedJson(env.DEPLOYER_PRIVATE_KEY_ENCRYPTED, pass);
    return wallet.privateKey;
  }
  throw new Error(`No deployer key in ${PACKAGES.hardhatEnv} — run \`yarn setup\``);
}

export function readEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};
  return parseEnv(fs.readFileSync(filePath, "utf8"));
}

export function writeEnvFile(
  filePath: string,
  values: Record<string, string | undefined>,
  options: { merge?: boolean } = {},
): void {
  const existing = options.merge === false ? {} : readEnvFile(filePath);
  const merged: Record<string, string> = { ...existing };
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete merged[key];
    else merged[key] = value;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, stringifyEnv(merged), { mode: 0o600 });
  fs.chmodSync(filePath, 0o600);
}

export function gitCheckIgnore(repoRoot: string, relPath: string): boolean {
  try {
    execFileSync("git", ["-C", repoRoot, "check-ignore", "-q", "--", relPath], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function listTrackedFiles(repoRoot: string): string[] {
  try {
    return execFileSync("git", ["-C", repoRoot, "ls-files"], { encoding: "utf8" }).split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

export type SecretHit = { file: string; line: number; kind: string };

const SKIP_EXT = new Set([".md", ".map", ".lock"]);
const SKIP_PREFIX = [
  "deployments/",
  "artifacts/",
  "cache/",
  "typechain-types/",
  "node_modules/",
  "dist/",
  ".next/",
  "coverage/",
];
// Well-known development keys that are intentionally public (Hardhat's default account).
const BENIGN_VALUES = new Set(["0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"]);
const isTestPath = (file: string) => file.startsWith("test/") || file.includes("/test/") || file.includes("/tests/");

export function scanSecretShapes(repoRoot: string, files: string[]): SecretHit[] {
  const hits: SecretHit[] = [];
  for (const file of files) {
    if (
      file === "yarn.lock" ||
      isTestPath(file) ||
      SKIP_EXT.has(path.extname(file)) ||
      SKIP_PREFIX.some(p => file.startsWith(p))
    )
      continue;
    let content: string;
    try {
      content = fs.readFileSync(path.join(repoRoot, file), "utf8");
    } catch {
      continue;
    }
    if (content.includes("\u0000")) continue;
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.length > 2000) continue;
      if ([...BENIGN_VALUES].some(value => line.includes(value))) continue;
      if (/302e020100300506032b657004220420[0-9a-fA-F]{64}/.test(line)) {
        hits.push({ file, line: i + 1, kind: "Ed25519 DER key" });
        continue;
      }
      if (
        /"ciphertext"\s*:/.test(line) ||
        /"cipher"\s*:\s*"aes-/.test(line) ||
        /"kdf"\s*:\s*"(scrypt|pbkdf2)"/.test(line)
      ) {
        hits.push({ file, line: i + 1, kind: "keystore JSON" });
        continue;
      }
      if (/(_KEY|SECRET|MNEMONIC|SEED|TOKEN)\s*[:=]/i.test(line) && /(0x)?[0-9a-fA-F]{64}\b/.test(line)) {
        hits.push({ file, line: i + 1, kind: "secret assignment" });
        continue;
      }
      if (/(?<![0-9a-fA-Fx])[0-9a-fA-F]{64}(?![0-9a-fA-F])/.test(line)) {
        hits.push({ file, line: i + 1, kind: "64-hex value" });
      }
    }
  }
  return hits;
}

async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>, ms = 15000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

export async function rpc(url: string, method: string, params: unknown[] = []): Promise<any> {
  return withTimeout(async signal => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal,
    });
    if (!res.ok) throw new Error(`JSON-RPC ${method} HTTP ${res.status}`);
    const json = (await res.json()) as { result?: unknown; error?: { message?: string } };
    if (json.error) throw new Error(`JSON-RPC ${method}: ${json.error.message ?? "unknown error"}`);
    return json.result;
  });
}

export async function evmBalance(url: string, address: string): Promise<bigint> {
  const hex = (await rpc(url, "eth_getBalance", [address, "latest"])) as string;
  return BigInt(hex);
}

export async function evmCode(url: string, address: string): Promise<string> {
  return (await rpc(url, "eth_getCode", [address, "latest"])) as string;
}

export async function mirror<T = any>(base: string, apiPath: string): Promise<T | undefined> {
  return withTimeout(async signal => {
    const res = await fetch(`${base}${apiPath}`, { signal });
    if (!res.ok) return undefined;
    return (await res.json()) as T;
  });
}

const FEED_ABI = [
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
];
const SALE_ABI = ["function maxStaleness() view returns (uint256)"];

export type FeedRound = { answer: bigint; updatedAt: number };

export async function readFeed(url: string, feedAddress: string): Promise<FeedRound> {
  const iface = new ethers.Interface(FEED_ABI);
  const data = iface.encodeFunctionData("latestRoundData");
  const raw = (await rpc(url, "eth_call", [{ to: feedAddress, data }, "latest"])) as string;
  const decoded = iface.decodeFunctionResult("latestRoundData", raw);
  return { answer: decoded[1] as bigint, updatedAt: Number(decoded[3]) };
}

export async function readMaxStaleness(url: string, saleAddress: string): Promise<number | undefined> {
  try {
    const iface = new ethers.Interface(SALE_ABI);
    const raw = (await rpc(url, "eth_call", [
      { to: saleAddress, data: iface.encodeFunctionData("maxStaleness") },
      "latest",
    ])) as string;
    return Number(iface.decodeFunctionResult("maxStaleness", raw)[0]);
  } catch {
    return undefined;
  }
}

export function formatHbarFromWeibar(weibar: bigint): string {
  return (Number(weibar) / 1e18).toFixed(4);
}

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function toBase58(bytes: Uint8Array): string {
  let value = 0n;
  for (const byte of bytes) value = value * 256n + BigInt(byte);
  let out = "";
  while (value > 0n) {
    out = BASE58_ALPHABET[Number(value % 58n)] + out;
    value /= 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    out = `1${out}`;
  }
  return out;
}

export function randomHex(byteLength: number): string {
  return randomBytes(byteLength).toString("hex");
}

export function generateEd25519Issuer(): { der: string; publicKeyBase58: string; publicKeyRaw: string } {
  const key = PrivateKey.generateED25519();
  return {
    der: key.toStringDer(),
    publicKeyBase58: toBase58(key.publicKey.toBytes()),
    publicKeyRaw: key.publicKey.toStringRaw(),
  };
}

export function feedAddressForNetwork(network: Network): string {
  return (process.env.HBAR_USD_FEED || (network === "mainnet" ? MAINNET_FEED : TESTNET_FEED)).trim();
}
