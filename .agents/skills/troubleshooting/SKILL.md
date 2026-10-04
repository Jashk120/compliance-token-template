---
name: troubleshooting
description: Diagnose real failures in the Compliance Token template — DID SDK deep imports, key format errors, hanging scripts, missing configuration on boot, stale oracle prices, HTS response codes, tinybar vs weibar value units, HTS admin key and auto-renew period, network gas price, Hashio 403, git identity, and rate-limit fallback. Use when a command errors or the app misbehaves.
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

`@hiero-did-sdk/hcs@0.2.1` (transitive via `@hiero-did-sdk/registrar` and `@hiero-did-sdk/resolver`, the only direct DID deps) deep-imports an unexported subpath of `@hiero-ledger/sdk`; every 2.x release restricts `exports` to `"."`.

- Next.js: the webpack alias in `packages/nextjs/next.config.ts` maps the specifier to the physical file.
- CLI scripts under tsx: `packages/hardhat/...` does not use this SDK, but `yarn issuer:register` does. It is registered with `tsx --import ./scripts/registerHieroNodeClientLoader.mjs`, which patches both ESM and CommonJS resolution (`scripts/hieroNodeClientLoader.mjs`).

Do not remove either workaround; the frontend (`packages/nextjs`) pins `@hiero-ledger/sdk` to `2.89.1` while `packages/hardhat` allows `2.80.x+` for this reason.

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

## Helper script fails with "Missing required environment variable …"

`credential:issue`, `issuer:register` and `audit:create-topic` load
`packages/nextjs/.env.local` via `tsx --env-file`; if a variable is still missing, run
`yarn setup` first — the scripts read the file, they never prompt for a key.

## `credential:issue` prints "No investor address found"

Supply the subject with `--address 0x...`, set `INVESTOR_ADDRESS` in
`packages/nextjs/.env.local`, or set `INVESTOR_PRIVATE_KEY` in `packages/hardhat/.env`.
The credential is only printed, never stored.

## Admin action returns `alreadyInState`

Not an error: `/api/admin/[action]` pre-checks the token and account relationship and skips
the transaction when the action is already satisfied (e.g. freezing a frozen account). The
response carries `alreadyInState: true` and a human-readable `message`.

## `msg.value` is tinybar, JSON-RPC `value` is weibar

Symptom: token creation reverts `InsufficientCreationFee(value, fee)`, or `TokenSale.buy` amounts are off by 1e10.
Cause: inside the EVM `msg.value` is tinybar (1 HBAR = 1e8 tinybar); the JSON-RPC relay takes weibar (1 HBAR = 1e18 weibar) and converts `value / 1e10`. See `packages/hardhat/contracts/ComplianceToken.sol` (~53, 82, 132, 154), `packages/hardhat/contracts/TokenSale.sol` (~21-25, 139), `packages/hardhat/scripts/liveProof.ts` (~147-149), `packages/hardhat/docs/architecture.md` (~81-96), `packages/hardhat/scripts/createLiveToken.ts` (~41-43).
Fix: from any JSON-RPC client send `tinybar * 1e10` weibar; keep on-chain math in tinybar (`usd8 = msg.value * price8 / 1e8`). `TokenSale` already refunds dust in tinybar.

## HTS token creation needs an ADMIN key and a non-zero auto-renew period

Symptom: the token-create precompile call fails or reverts (e.g. `INVALID_RENEWAL_PERIOD` = 70, or an immutable token with no admin key).
Cause: HTS rejects a create whose `Expiry.autoRenewPeriod` is 0, and the ADMIN key is required (it also lets keys rotate). See `packages/hardhat/contracts/ComplianceToken.sol`: constructor expiry sets `autoRenewAccount: address(this), autoRenewPeriod: 7890000` (~line 143), the natspec states the ADMIN key is required (~219-220), and the HIP-358 creation fee is `msg.value` (~115).
Fix: always set an ADMIN key and a non-zero auto-renew period in the HTS `TokenCreate` struct; the template `createToken` already does.

## Deploy or state-changing tx rejected for low gas price

Symptom: a deploy or state-changing tx is rejected for a gas price below the network minimum.
Cause: Hedera rejects txs under `eth_gasPrice` (e.g. ~1.14e12 weibar on testnet); ethers fee estimation can pick a value below it. See `packages/hardhat/scripts/liveProof.ts` (~133-137), which pins `gasPrice` from `provider.getFeeData().gasPrice`, and `packages/hardhat/utils/getDeployGasPrice.ts`, used by every `packages/hardhat/deploy/*.ts`.
Fix: pin `gasPrice` from the provider on every state-changing tx (deploy scripts and the proof runner already do).

## Hashio returns HTTP 403

Symptom: `https://testnet.hashio.io/api` returns 403 (browser console or raw request) while the Mirror Node is fine; `yarn doctor` may show the Hashio reachability WARN.
Cause: Hashio is a shared public relay. It serves JSON-RPC only over POST (a bare GET returns 405, a different problem); a 403 usually comes from a corporate proxy, VPN, or firewall blocking the host, or from relay rate limiting, not from a bad key. See `packages/hardhat/scripts/dx/doctor.ts` Hashio check (~110-120) and `packages/nextjs/scaffold.config.ts` (~37-38); API routes call RPC server-side via `packages/nextjs/services/compliance/chainReads.ts` (the client never hits Hashio).
Fix: call it as `POST` with `Content-Type: application/json`; keep RPC and Mirror calls server-side (the Next.js API routes already do); allow `testnet.hashio.io` through the firewall, VPN, or proxy; if it persists, point `HEDERA_RPC_URL` (hardhat) or `NEXT_PUBLIC_HEDERA_TESTNET_RPC_URL` (frontend) at another Hedera JSON-RPC relay.

## `git commit` fails with "Please tell me who you are"

Symptom: `git commit` fails with "Please tell me who you are" or "unable to auto-detect email address", or the pre-commit hook errors, on a fresh machine, container, or CI.
Cause: `yarn install` runs `postinstall: husky`, and committing requires a configured Git identity; fresh sandboxes and CI images have none.
Fix: `git config --global user.name "Your Name"` and `git config --global user.email "you@example.com"` (omit `--global` for this repo only), then retry. This is unrelated to template code or keys.

## Rate-limit fallback for shared RPC and Mirror endpoints

Symptom: intermittent blank 500s or read failures under load from the shared Hashio RPC or the public Mirror Node (HTTP 429 or 5xx).
Cause: both are shared public endpoints with rate limits. See `packages/nextjs/services/compliance/upstream.ts`, which retries 429/5xx with exponential backoff and a timeout (used by `mirror.ts`, `auditLog.ts`, `chainReads.ts`, and `/api/hedera/account`); `packages/nextjs/services/web3/wagmiConfig.tsx` uses viem `fallback(...)` with `NEXT_PUBLIC_HEDERA_*_RPC_URL` then the default; routes answer 502 with a message instead of a blank 500.
Fix: set `NEXT_PUBLIC_HEDERA_TESTNET_RPC_URL` (or `HEDERA_RPC_URL`) to your own or another relay so the client falls back automatically; API reads already retry 429/5xx.

## Tests

- `yarn next:test` — vitest; the credential/DID tests mock the resolver (no network).
- `yarn hardhat:test` — offline contract tests plus the `dx` helper unit tests.
