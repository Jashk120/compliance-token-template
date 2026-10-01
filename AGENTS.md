# Agent instructions

Briefing for coding agents in this app (Cursor, Claude Code, Codex, opencode). Claude
Code loads it through `CLAUDE.md`.

## Never read, print or persist secrets — read this first

- **Never** read, `cat`, `echo`, `grep`, or otherwise print the contents of `.env` or
  `.env.local` files, or any private key, mnemonic or admin token.
- **Never** ask the user to paste a private key or token into chat.
- **Never** put a secret on a command line (argv); scripts read from the environment.
- Direct the user to **`yarn setup`** to create or fix credentials — it uses hidden
  prompts, writes `0600`, and validates without echoing values.
- **Always run `yarn doctor` first** to see what is missing; it prints no values. Report
  its **Prerequisites** group (git, Node, Yarn/Corepack, npm, Hashio/Mirror reachability,
  OS) and the `next:` fix for each item to the user before doing anything else.
- Contract addresses, account ids, DIDs and transaction hashes are public and fine to
  print.

## Agent skills

Task-focused guidance lives in `.agents/skills/` (mirrored into `.claude/skills/`).
Load the one that matches the task:

| Skill                                                                  | Use when                                                                                                                     |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| [`issuer-credentials`](.agents/skills/issuer-credentials/SKILL.md)     | configuring/validating deployer, operator, issuer or admin credentials; anything about secrets or `yarn setup`/`yarn doctor` |
| [`deploy-and-proof`](.agents/skills/deploy-and-proof/SKILL.md)         | deploying to testnet, creating the token/topic, granting roles, registering the DID, running `yarn proof`                    |
| [`extending-compliance`](.agents/skills/extending-compliance/SKILL.md) | adding a role, an HCS/admin action, swapping the price feed, or adding a compliance rule                                     |
| [`troubleshooting`](.agents/skills/troubleshooting/SKILL.md)           | a command errors or the app misbehaves                                                                                       |
| `solidity-security`                                                    | writing or auditing contracts                                                                                                |

Scaffold-HBAR installs the upstream Hedera skills with `--skip-hedera-skills` to opt out.

## Developer experience commands

| Command                                      | What it does                                                                                                     |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `yarn doctor`                                | Read-only checklist (`--json`, `--strict`); exits 0 only when READY.                                             |
| `yarn setup`                                 | Interactive, idempotent, secret-safe credential setup.                                                           |
| `yarn deploy:testnet`                        | Resumable deploy: contracts, token, roles, audit topic, issuer DID → `packages/nextjs/.env.local`.               |
| `yarn proof`                                 | Runs the live proof, writes `packages/hardhat/docs/testnet-proof.md`.                                            |
| `yarn workspace @sh/nextjs credential:issue` | Prints a signed investor credential (`--address` → `INVESTOR_ADDRESS` → `INVESTOR_PRIVATE_KEY`); writes nothing. |

The documented order is `yarn setup` → `yarn doctor` → `yarn deploy:testnet` → `yarn dev`.

The helper scripts (`issuer:register`, `audit:create-topic`, `credential:issue`) load
`packages/nextjs/.env.local` automatically; `credential:issue` also reads
`packages/hardhat/.env`.

## Prerequisites (from zero)

Run `yarn doctor` first; its **Prerequisites** group reports each of these with a fix:

- **Git** — required to clone/scaffold.
- **Node ≥ 20.18.3** — `nvm install 20 && nvm use 20` (or fnm). `node -v`.
- **Yarn 3 via Corepack** — `corepack enable` (Corepack ships with Node). `yarn -v`
  must print `3.x`, not `1.x`. Never `npm i -g yarn`.
- **npm** — ships with Node; the alternative runner.
- **Network** — `https://testnet.hashio.io/api` and
  `https://testnet.mirrornode.hedera.com` must be reachable (WARN on firewall/VPN).
- **OS** — native Windows is not tested; use **WSL2 (Ubuntu)**.

Hardhat is a **local dependency** installed by `yarn install` (no global install);
Foundry and Docker are not needed. Full walkthrough (macOS/Linux/Windows-WSL2, testnet
accounts, WalletConnect ID): see the **Starting from zero** section of `README.md`.

Wallets the frontend configures: **MetaMask**, **WalletConnect**, plus a development
burner wallet on local networks (`packages/nextjs/services/web3/wagmiConnectors.tsx`).

## This template (Compliance Token)

The Solidity package is `packages/hardhat`:

- `ComplianceToken` — creates the HTS fungible token with `treasury = address(this)` and
  KYC/FREEZE/SUPPLY/PAUSE `contractId` keys, exposes role-gated compliance controls.
- `TokenSale` — Chainlink HBAR/USD-priced sale with a per-investor USD cap.
- `ChainlinkPriceFeedAdapter`, plus `MockHTS` / `MockChainlinkAggregator` in `contracts/test`.

The HTS address is injected through the `ComplianceToken` constructor, so tests pass a
deployed `MockHTS` instead of the `0x167` precompile. Contract tests run offline
(`yarn hardhat:test`); see `packages/hardhat/docs/architecture.md`.

Compliance actions and their HCS audit messages are committed in one HIP-551 atomic batch
(`packages/nextjs/services/compliance/atomicAudit.ts`): the HCS submit is inner first and the
single contract call inner last, per Hedera's September 2026 rule. Set `HEDERA_ATOMIC_AUDIT=false`
to use the legacy sequential path, which is not atomic.

Use the package manager this project was created with (`packageManager` in the root
`package.json`, or the lockfile). Examples use `yarn`.

The frontend drives `/investor` as a guided **associate → verify → buy** stepper. `/admin`
pre-checks each action against on-chain state and returns a no-op message when the action is
already satisfied; `/audit` renders the HCS timeline with friendly action labels and
HashScan links.

## Commands

```bash
# Setup and deploy (secret-safe)
yarn setup
yarn doctor
yarn deploy:testnet
yarn proof

# Local chain + deploy + frontend (separate terminals)
yarn hardhat:chain    # Hedera-forked Hardhat node on 8545
yarn hardhat:deploy --network localhost
yarn dev              # http://localhost:3000

# Quality / build
yarn lint
yarn format
yarn next:build
yarn next:test
yarn hardhat:test
yarn hardhat:compile
```

`yarn hardhat:deploy` without `--network localhost` targets the in-process `hardhat`
network, not the long-running fork.

## Layout

- Contracts: `packages/hardhat/contracts/`
- Deploy scripts: `packages/hardhat/deploy/` (all idempotent; `04_grant_roles.ts` grants roles)
- Tests: `packages/hardhat/test/` (unit) and `test/dx/` (helper tests)
- DX scripts: `packages/hardhat/scripts/dx/`
- Docs: `packages/hardhat/docs/`
- Frontend: `packages/nextjs` — App Router pages under `app/`, services under `services/compliance/`

ABIs and addresses are normally written to `packages/nextjs/contracts/deployedContracts.ts`
by the deploy task; `yarn deploy:testnet` sets `DX_SKIP_TS_ABI=true` so ids stay in
`.env.local` instead. Do not hand-edit `deployedContracts.ts`.

## Frontend contract interaction

Hooks live in `packages/nextjs/hooks/scaffold-hbar`: `useScaffoldReadContract`,
`useScaffoldWriteContract`, `useScaffoldWatchContractEvent`, `useScaffoldEventHistory`,
`useDeployedContractInfo`, `useScaffoldContract`, `useTransactor`.

UI uses `@scaffold-hbar-ui/components` and DaisyUI classes. Next.js imports use the `~~`
alias; add `"use client"` for hook-using pages.

## Style

| Style            | Use                                      |
| ---------------- | ---------------------------------------- |
| `UpperCamelCase` | types, components                        |
| `lowerCamelCase` | variables, functions                     |
| `CONSTANT_CASE`  | constants                                |
| `snake_case`     | Hardhat deploy files and Foundry scripts |

Prefer `type` over `interface`. No `T` prefix on types. Comments should add information.
