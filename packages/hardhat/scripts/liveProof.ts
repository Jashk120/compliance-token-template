import * as fs from "fs";
import * as path from "path";

import { ethers, network } from "hardhat";

const HTS_ADDRESS = "0x0000000000000000000000000000000000000167";
const OPERATOR_LONG_ZERO = "0x000000000000000000000000000000000086790b";
const DEFAULT_FEED = "0x59bC155EB6c6C415fE43255aF66EcF0523c92B4a"; // Chainlink HBAR/USD testnet
const EXPLORER = "https://hashscan.io/testnet";
const MIRROR = "https://testnet.mirrornode.hedera.com";
const PROOF_PATH = path.join(__dirname, "..", "docs", "testnet-proof.md");

type ProofRow = { step: string; expected: string; actual: string; tx: string; link: string; notes: string };

const rows: ProofRow[] = [];

function record(step: string, expected: string, actual: string, tx = "-", notes = ""): void {
  const clean = (s: string) => s.replace(/\|/g, "\\|");
  rows.push({
    step,
    expected,
    actual,
    tx,
    link: tx && tx !== "-" ? `${EXPLORER}/tx/${tx}` : "-",
    notes: clean(notes),
  });
  console.log(`[${step}] expected=${expected} | actual=${actual}${tx !== "-" ? ` | ${EXPLORER}/tx/${tx}` : ""}`);
}

function writeProof(status: "ok" | "blocked" | "partial", blocked?: string): void {
  const header = [
    "# Hedera testnet proof — Compliance Token template",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Network: hederaTestnet (chain id 296) · Explorer: ${EXPLORER}`,
    "",
    status === "blocked" ? `> **BLOCKED:** ${blocked}` : "",
    "",
    "| Step | Expected | Actual | Tx hash | HashScan | Notes |",
    "| --- | --- | --- | --- | --- | --- |",
  ].join("\n");
  const body = rows
    .map(
      r =>
        `| ${r.step} | ${r.expected} | ${r.actual} | ${r.tx === "-" ? "-" : `\`${r.tx}\``} | ${r.link} | ${r.notes} |`,
    )
    .join("\n");
  fs.mkdirSync(path.dirname(PROOF_PATH), { recursive: true });
  fs.writeFileSync(PROOF_PATH, `${header}\n${body}\n`, "utf8");
  console.log(`Wrote ${PROOF_PATH}`);
}

function resolveDeployment(name: string, envKey: string): string | undefined {
  const file = path.join(__dirname, "..", "deployments", network.name, `${name}.json`);
  try {
    const json = JSON.parse(fs.readFileSync(file, "utf8")) as { address?: string };
    if (json.address) return json.address;
  } catch {
    /* fall through to env */
  }
  return process.env[envKey];
}

function decodeError(contract: any, err: any): { name?: string; code?: string; raw?: string } {
  const data = err?.data ?? err?.error?.data ?? err?.info?.error?.data ?? err?.info?.error?.error?.data;
  if (typeof data === "string" && data.startsWith("0x")) {
    try {
      const parsed = contract.interface.parseError(data);
      if (parsed) {
        const args: any[] = parsed.args ? Array.from(parsed.args) : [];
        const code = args.length
          ? args.map(a => (typeof a === "bigint" ? a.toString() : String(a))).join(",")
          : undefined;
        return { name: parsed.name, code, raw: data };
      }
    } catch {
      /* not decodable with this ABI */
    }
    return { raw: data };
  }
  return { raw: err?.shortMessage };
}

function describe(contract: any, err: any): string {
  const d = decodeError(contract, err);
  if (d.name) return d.code ? `${d.name}(${d.code})` : d.name;
  if (d.raw) return `raw ${d.raw.slice(0, 42)}`;
  return err?.shortMessage ?? String(err);
}

const ceilDiv = (a: bigint, b: bigint): bigint => (a + b - 1n) / b;

async function main(): Promise<void> {
  const feedAddress = process.env.HBAR_USD_FEED || DEFAULT_FEED;
  const investorKey = process.env.INVESTOR_PRIVATE_KEY;
  const complianceAddress = resolveDeployment("ComplianceToken", "COMPLIANCE_TOKEN_ADDRESS");
  const saleAddress = resolveDeployment("TokenSale", "TOKEN_SALE_ADDRESS");
  const probeAddress = resolveDeployment("CallerProbe", "CALLER_PROBE_ADDRESS");

  if (!complianceAddress || !saleAddress) {
    record("setup", "deployments present", "missing", "-", "run yarn hardhat:deploy --network hederaTestnet first");
    writeProof("blocked", "ComplianceToken/TokenSale deployment JSON not found.");
    return;
  }
  if (!investorKey) {
    record("setup", "INVESTOR_PRIVATE_KEY set", "missing", "-", "required to run LIVE-1..LIVE-7");
    writeProof("blocked", "INVESTOR_PRIVATE_KEY is not set. Provide the funded investor ECDSA key.");
    return;
  }

  const investor = new ethers.Wallet(investorKey, ethers.provider);
  const officerKey =
    process.env.OFFICER_PRIVATE_KEY ?? process.env.__RUNTIME_DEPLOYER_PRIVATE_KEY ?? process.env.DEPLOYER_PRIVATE_KEY;
  const officer = officerKey ? new ethers.Wallet(officerKey, ethers.provider) : (await ethers.getSigners())[0];

  const compliance = await ethers.getContractAt("ComplianceToken", complianceAddress, officer);
  const complianceAsOfficer: any = compliance;
  const sale: any = await ethers.getContractAt("TokenSale", saleAddress, investor);
  const tokenAddress: string = await compliance.tokenAddress();

  const erc20 = await ethers.getContractAt(
    ["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)"],
    tokenAddress,
  );
  const feed = await ethers.getContractAt(
    ["function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)"],
    feedAddress,
  );
  const htsInterface = new ethers.Interface([
    "function associateToken(address account, address token) returns (int64)",
  ]);

  const priceRead = async () => {
    const [roundId, answer, , updatedAt] = await feed.latestRoundData();
    const now = BigInt(Math.floor(Date.now() / 1000));
    return { roundId, answer, updatedAt, price8: BigInt(answer), age: now - BigInt(updatedAt) };
  };

  const { price8 } = await priceRead();
  const targetUsd8 = BigInt(process.env.BUY_USD8 || "50000000"); // $0.50
  const buyValue = ceilDiv(targetUsd8 * 10n ** 18n, price8);

  // LIVE-1: buy while not associated.
  try {
    await sale.buy.staticCall({ value: buyValue });
    record("LIVE-1 buy unassociated", "NotAssociated(184)", "SUCCEEDED (unexpected)", "-", "eth_call");
  } catch (err) {
    record("LIVE-1 buy unassociated", "NotAssociated(184)", describe(sale, err), "-", "eth_call");
  }

  // LIVE-2: associate via the precompile, then buy without KYC.
  try {
    const data = htsInterface.encodeFunctionData("associateToken", [investor.address, tokenAddress]);
    const [rc] = htsInterface.decodeFunctionResult(
      "associateToken",
      await ethers.provider.call({ from: investor.address, to: HTS_ADDRESS, data }),
    );
    const tx = await investor.sendTransaction({ to: HTS_ADDRESS, data });
    await tx.wait();
    record("LIVE-2 associate", "22", `staticCall rc=${rc}`, tx.hash, "via 0x167");
  } catch (err) {
    record("LIVE-2 associate", "22", describe(sale, err), "-", "precompile association failed");
  }
  try {
    await sale.buy.staticCall({ value: buyValue });
    record("LIVE-2 buy without KYC", "KycNotGranted(176)", "SUCCEEDED (unexpected)", "-", "eth_call");
  } catch (err) {
    record("LIVE-2 buy without KYC", "KycNotGranted(176)", describe(sale, err), "-", "eth_call");
  }

  // LIVE-3a: grant KYC to an account that is NOT associated.
  const stranger = ethers.Wallet.createRandom().address;
  try {
    await complianceAsOfficer.grantKyc.staticCall(stranger);
    record("LIVE-3a grantKyc unassociated", "HtsCallFailed(184)", "SUCCEEDED (unexpected)", "-", "eth_call");
  } catch (err) {
    record(
      "LIVE-3a grantKyc unassociated",
      "HtsCallFailed(184)",
      describe(complianceAsOfficer, err),
      "-",
      "real response code",
    );
  }

  // LIVE-3b: grant KYC to the associated investor.
  try {
    const tx = await complianceAsOfficer.grantKyc(investor.address);
    await tx.wait();
    record("LIVE-3b grantKyc associated", "success", "success", tx.hash);
  } catch (err) {
    record("LIVE-3b grantKyc associated", "success", describe(complianceAsOfficer, err), "-");
  }

  // LIVE-3c: prove the SDK operator's msg.sender.
  await sdkCallerProof(probeAddress);

  // LIVE-4: buy within the USD cap.
  let tokensReceived = 0n;
  try {
    const before = await erc20.balanceOf(investor.address);
    const tx = await sale.buy({ value: buyValue });
    await tx.wait();
    const after = await erc20.balanceOf(investor.address);
    tokensReceived = BigInt(after) - BigInt(before);
    const p = await priceRead();
    record(
      "LIVE-4 buy within cap",
      "success",
      `sent=${buyValue} tokens=${tokensReceived}`,
      tx.hash,
      `usd8=${(buyValue * p.price8) / 10n ** 18n} answer=${p.price8} updatedAt=${p.updatedAt} age=${p.age}s`,
    );
  } catch (err) {
    record("LIVE-4 buy within cap", "success", describe(sale, err), "-");
  }

  // LIVE-5: one USD unit over the cap.
  try {
    const cap: bigint = await sale.perInvestorCapUsd();
    const spent: bigint = await sale.usdSpent(investor.address);
    const overValue = ceilDiv((cap - spent + 2n) * 10n ** 18n, price8);
    await sale.buy.staticCall({ value: overValue });
    record("LIVE-5 buy over cap", "PerInvestorCapExceeded", "SUCCEEDED (unexpected)", "-", "eth_call");
  } catch (err) {
    record("LIVE-5 buy over cap", "PerInvestorCapExceeded", describe(sale, err), "-", "eth_call");
  }

  // LIVE-6: freeze -> 165, unfreeze; pause -> 265, unpause.
  try {
    await (await complianceAsOfficer.freeze(investor.address)).wait();
    try {
      await sale.buy.staticCall({ value: buyValue });
      record("LIVE-6 frozen buy", "Frozen(165)", "SUCCEEDED (unexpected)", "-", "eth_call");
    } catch (err) {
      record("LIVE-6 frozen buy", "Frozen(165)", describe(sale, err), "-", "eth_call");
    }
    await (await complianceAsOfficer.unfreeze(investor.address)).wait();

    await (await complianceAsOfficer.pause()).wait();
    try {
      await sale.buy.staticCall({ value: buyValue });
      record("LIVE-6 paused buy", "Paused(265)", "SUCCEEDED (unexpected)", "-", "eth_call");
    } catch (err) {
      record("LIVE-6 paused buy", "Paused(265)", describe(sale, err), "-", "eth_call");
    }
    await (await complianceAsOfficer.unpause()).wait();
  } catch (err) {
    record("LIVE-6 freeze/pause", "success", describe(complianceAsOfficer, err), "-");
  }

  // LIVE-7: oracle reading at purchase time.
  try {
    const p = await priceRead();
    record(
      "LIVE-7 feed read",
      "fresh answer",
      `price8=${p.price8}`,
      "-",
      `roundId=${p.roundId} updatedAt=${p.updatedAt} age=${p.age}s`,
    );
  } catch (err) {
    record("LIVE-7 feed read", "fresh answer", describe(feed, err), "-");
  }

  // Mirror-node metadata: contract ids and token keys.
  await recordMirrorMetadata(complianceAddress, saleAddress, tokenAddress);

  writeProof("partial");
}

async function sdkCallerProof(probeAddress?: string): Promise<void> {
  const operatorId = process.env.HEDERA_OPERATOR_ID;
  const operatorKey = process.env.HEDERA_OPERATOR_PRIVATE_KEY;
  if (!probeAddress || !operatorId || !operatorKey) {
    record(
      "LIVE-3c SDK msg.sender",
      OPERATOR_LONG_ZERO,
      "SKIPPED",
      "-",
      "needs HEDERA_OPERATOR_PRIVATE_KEY and a deployed CallerProbe",
    );
    return;
  }
  try {
    const sdk: any = await import("@hiero-ledger/sdk");
    const client = sdk.Client.forTestnet();
    client.setOperator(operatorId, sdk.PrivateKey.fromString(operatorKey));
    const resp = await new sdk.ContractExecuteTransaction()
      .setContractId(probeAddress)
      .setGas(200000)
      .setFunction("record()")
      .execute(client);
    const rec = await resp.getRecord(client);
    const topic = rec?.contractFunctionResult?.logs?.[0]?.topics?.[1];
    const caller = topic ? `0x${Buffer.from(topic).subarray(12).toString("hex")}` : "unknown";
    record(
      "LIVE-3c SDK msg.sender",
      OPERATOR_LONG_ZERO,
      caller,
      "-",
      caller === OPERATOR_LONG_ZERO ? "match" : "MISMATCH",
    );
  } catch (err) {
    record("LIVE-3c SDK msg.sender", OPERATOR_LONG_ZERO, `error: ${(err as Error).message}`, "-");
  }
}

async function recordMirrorMetadata(
  complianceAddress: string,
  saleAddress: string,
  tokenAddress: string,
): Promise<void> {
  const get = async (url: string): Promise<any> => {
    const res = await fetch(`${MIRROR}${url}`);
    return res.ok ? res.json() : undefined;
  };
  try {
    for (const [label, addr] of [
      ["ComplianceToken", complianceAddress],
      ["TokenSale", saleAddress],
    ] as const) {
      const c = await get(`/api/v1/contracts/${addr}`);
      record(`DEPLOY ${label}`, "contract id", c?.contract_id ?? "unknown", "-", `${EXPLORER}/contract/${addr}`);
    }
    const token = await get(`/api/v1/tokens/${tokenAddress}`);
    const keys = token?.keys ?? {};
    record(
      "DEPLOY token keys",
      "kyc/freeze/pause/supply = ComplianceToken",
      `kyc=${keys.kyc?.contract_id ?? "-"} freeze=${keys.freeze?.contract_id ?? "-"} pause=${keys.pause?.contract_id ?? "-"} supply=${keys.supply?.contract_id ?? "-"}`,
      "-",
      `${EXPLORER}/token/${tokenAddress}`,
    );
  } catch (err) {
    record("mirror metadata", "fetched", `error: ${(err as Error).message}`, "-");
  }
}

main().catch(err => {
  writeProof("blocked", `script error: ${err?.message ?? err}`);
  process.exitCode = 1;
});
