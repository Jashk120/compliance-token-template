import * as fs from "fs";
import * as path from "path";

import { ethers, network } from "hardhat";

/**
 * Creates the HTS compliance token on a live network (DEPLOY-5).
 *
 * The local-only `05_create_compliance_token.ts` deploy script never runs off
 * localhost because it also associates/KYC-checks the deployer through MockHTS.
 * On a live network the token must be created against the real precompile, so
 * this one-shot script reads the deployed ComplianceToken, forwards exactly its
 * `creationFee`, and prints the created token address.
 */
const EXPLORER = "https://hashscan.io/testnet";

function resolveComplianceAddress(): string {
  const file = path.join(__dirname, "..", "deployments", network.name, "ComplianceToken.json");
  try {
    const json = JSON.parse(fs.readFileSync(file, "utf8")) as { address?: string };
    if (json.address) return json.address;
  } catch {
    /* fall through to env */
  }
  const env = process.env.COMPLIANCE_TOKEN_ADDRESS;
  if (!env) throw new Error("ComplianceToken address not found (deployments JSON or COMPLIANCE_TOKEN_ADDRESS)");
  return env;
}

async function main(): Promise<void> {
  const [deployer] = await ethers.getSigners();
  const compliance = await ethers.getContractAt("ComplianceToken", resolveComplianceAddress(), deployer);

  const existing: string = await compliance.tokenAddress();
  if (existing !== ethers.ZeroAddress) {
    console.log(`Token already created at ${existing}`);
    return;
  }

  const fee: bigint = await compliance.creationFee();
  // The contract's `creationFee` is tinybar (the unit of Hedera's EVM `msg.value`),
  // while the JSON-RPC `value` field is weibar and the relay converts to tinybar for
  // the EVM (`value / 1e10`). To deliver `fee` tinybar, send `fee * 1e10` weibar.
  const feeWei = fee * 10n ** 10n;
  // Explicit gasLimit: HTS operations cannot pay fees during eth_estimateGas, so
  // estimation reports INSUFFICIENT_TX_FEE (9) before the tx is ever broadcast.
  const tx = await compliance.createToken("Compliance Token", "CMP", 6, "1000000000000", {
    value: feeWei,
    gasLimit: 4_000_000n,
  });
  console.log(`createToken tx=${tx.hash}`);
  console.log(`hashscan=${EXPLORER}/tx/${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`status=${receipt?.status}`);

  const tokenAddress: string = await compliance.tokenAddress();
  console.log(`TOKEN_ADDRESS=${tokenAddress}`);
  console.log(`hashscan_token=${EXPLORER}/token/${tokenAddress}`);
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
