import { execFileSync } from "child_process";
import * as path from "path";
import { PACKAGES, readEnvFile, resolveDeployerKey } from "./lib";

const repoRoot = path.resolve(__dirname, "../../../..");
const hardhatRoot = path.join(repoRoot, "packages/hardhat");
const proofPath = path.join(hardhatRoot, "docs/testnet-proof.md");

async function main(): Promise<void> {
  const deployerKey = await resolveDeployerKey(repoRoot);
  const hardhatEnv = readEnvFile(path.join(repoRoot, PACKAGES.hardhatEnv));
  const env: NodeJS.ProcessEnv = { ...process.env, ...hardhatEnv, __RUNTIME_DEPLOYER_PRIVATE_KEY: deployerKey };
  const out = execFileSync("yarn", ["hardhat", "run", "scripts/liveProof.ts", "--network", "hederaTestnet"], {
    cwd: hardhatRoot,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  process.stdout.write(out);
  console.log(`\nProof written to ${path.relative(repoRoot, proofPath)}`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
