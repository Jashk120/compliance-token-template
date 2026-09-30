---
name: troubleshooting
description: Diagnose real failures in the Compliance Token template — DID SDK deep imports, key format errors, hanging scripts, missing configuration on boot, stale oracle prices, and HTS response codes. Use when a command errors or the app misbehaves.
---

# Troubleshooting

These are failures actually hit while building the template, with the fix.

## First run: check prerequisites before anything else

Run `yarn doctor` and read its **Prerequisites** group (it prints no values). Report each
item and its `next:` fix to the user:

- **Git** missing → install from <https://git-scm.com/downloads>.
- **Node < 20.18.3** → `nvm install 20 && nvm use 20` (or `fnm`); verify with `node -v`.
- **`yarn` missing or `1.x`** → `corepack enable` (Corepack ships with Node). `yarn -v`
  must print `3.x`; never `npm i -g yarn` globally.
- **npm missing** (alternative runner) → ships with Node; install Node.
- **Hashio/Mirror unreachable** → allow `testnet.hashio.io` and
  `testnet.mirrornode.hedera.com` through the firewall/VPN/proxy.
- **Native Windows** → use WSL2 (Ubuntu): `wsl --install -d Ubuntu`.

Hardhat is a local dependency (installed by `yarn install`); Foundry and Docker are not
needed. Then: `yarn setup` → `yarn doctor` → `yarn deploy:testnet` → `yarn dev`.

## `ERR_PACKAGE_PATH_NOT_EXPORTED: ./lib/client/NodeClient`

`@hiero-did-sdk/hcs@0.2.1` deep-imports an unexported subpath of `@hiero-ledger/sdk`; every 2.x release restricts `exports` to `"."`.

- Next.js: the webpack alias in `packages/nextjs/next.config.ts` maps the specifier to the physical file.
- CLI scripts under tsx: `packages/hardhat/...` does not use this SDK, but `yarn workspace @sh/nextjs issuer:register` does. It is registered with `tsx --import ./scripts/registerHieroNodeClientLoader.mjs`, which patches both ESM and CommonJS resolution (`scripts/hieroNodeClientLoader.mjs`).

Do not remove either workaround; `@hiero-ledger/sdk` is pinned to `2.89.1` for this reason.

## `Invalid private key format. Expected DER`

The DID SDK signer only accepts a DER/PKCS#8 Ed25519 string, but `.env` stores the raw 32-byte hex form. `registerIssuerDid.ts` converts raw → DER before calling `createDID`. Keep that conversion if you change the script.

## `issuer:register` hangs after printing the DID

The registrar opens a Hedera client it does not expose. `registerIssuerDid.ts` calls `process.exit(0)` after flushing stdout. Keep that exit.

## App boots but every page says "Missing configuration"

Expected with no env files: the app is designed to boot without secrets. Run `yarn setup` then `yarn doctor`, or copy `.env.example` files.

## `yarn doctor` is NOT READY on a fresh clone

Expected: `yarn doctor` reports MISSING until `yarn setup` and `yarn deploy:testnet` have run. Re-run it after each step.

## Buys revert `StalePrice`

The Chainlink HBAR/USD answer is older than `TokenSale.maxStaleness`. `yarn doctor` prints the feed age; check `HBAR_USD_FEED` and the feed heartbeat.

## HTS returns 184 / 176 / 165 / 265 / 15

`NotAssociated` / `KycNotGranted` / `Frozen` / `Paused` / invalid token. See `packages/hardhat/docs/architecture.md` and the `liveProof.ts` expectations. Associate the account, grant KYC, or unfreeze before retrying.

## `yarn deploy:testnet` re-runs everything

It is resumable by design: `hardhat-deploy` reuses deployed contracts and the script skips work already visible on-chain / the Mirror Node, printing a `Resumed — skipped: …` line. It never rewrites `deployedContracts.ts`.

## Tests

- `yarn next:test` — vitest; the credential/DID tests mock the resolver (no network).
- `yarn hardhat:test` — offline contract tests plus the `dx` helper unit tests.
