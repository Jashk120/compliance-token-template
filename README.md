# Scaffold-HBAR — Compliance Token

A Scaffold-HBAR template for issuing a Hedera Token Service (HTS) **compliance
token** and selling it for HBAR at a fixed USD price.

The token's KYC, freeze, supply and pause keys are bound to the deploying contract, so
compliance state can only be changed by that contract. The sale prices tokens from a
[Chainlink HBAR/USD price feed](https://docs.chain.link/data-feeds/price-feeds/addresses?network=hedera)
and enforces a per-investor USD cap.

Create a project from this template:

```bash
npm create scaffold-hbar@latest -- --template <owner>/<this-repo>
```

## What's in this template

- `ComplianceToken` — creates the HTS fungible token with `treasury = address(this)`
  and `KYC`, `FREEZE`, `SUPPLY`, `PAUSE` keys as `contractId` keys, then exposes
  role-gated `grantKyc` / `revokeKyc` / `freeze` / `unfreeze` / `pause` / `unpause`.
- `TokenSale` — buys tokens with HBAR using a Chainlink HBAR/USD feed, with a
  per-investor USD cap, oracle staleness/round checks, dust refunds and a reentrancy
  guard.
- `ChainlinkPriceFeedAdapter` — swappable `IPriceFeed` wrapper around a Chainlink
  aggregator.
- `MockHTS` / `MockChainlinkAggregator` — local stand-ins for the `0x167` precompile
  and a price feed.
- Next.js App Router frontend (wallet connect, Debug Contracts, block explorer).

See [`packages/hardhat/docs/architecture.md`](packages/hardhat/docs/architecture.md)
for the treasury/key design and unit handling.

## Prerequisites

- [Node.js](https://nodejs.org/) ≥ 20.18.3
- [Yarn](https://yarnpkg.com/) via Corepack: `corepack enable && corepack prepare yarn@3.2.3 --activate`
- A funded Hedera testnet account for live deploys ([faucet](https://portal.hedera.com/faucet))

## Quick start

```bash
yarn install

# Terminal 1: local Hedera node
yarn hardhat:chain

# Terminal 2: deploy + create the token locally
yarn hardhat:deploy --network localhost

# Terminal 3: frontend
yarn next:dev
```

Open http://localhost:3000 and use the **Debug Contracts** page.

## Contracts, tests and lint

```bash
yarn hardhat:compile
yarn hardhat:test    # 29 unit tests against MockHTS / MockChainlinkAggregator
yarn lint
```

Contract tests run on the in-process Hardhat network using the mocks — no network
access required. `yarn hardhat:test:forking` runs the same suite against a forked
Hedera testnet.

## Environment variables

Contracts (`packages/hardhat/.env`, copy from `.env.example`):

| Variable | Purpose |
| --- | --- |
| `HEDERA_RPC_URL` | Hedera JSON-RPC endpoint (testnet by default). |
| `DEPLOYER_PRIVATE_KEY_ENCRYPTED` | Encrypted deployer key; set via `yarn hardhat:account:generate`. |

Frontend + API (`packages/nextjs/.env.local`, copy from `.env.example`). Addresses are
read from `packages/nextjs/contracts/deployedContracts.ts` first and fall back to env:

| Variable | Purpose |
| --- | --- |
| `HEDERA_NETWORK` | `testnet` (default) or `mainnet`. |
| `HEDERA_OPERATOR_ID` / `HEDERA_OPERATOR_PRIVATE_KEY` | Operator that signs compliance transactions (holds `COMPLIANCE_OFFICER_ROLE`). |
| `ISSUER_DID` | `did:hedera` identifier whose Ed25519 key signs investor credentials. Resolved on-chain by default. |
| `ISSUER_DID_PRIVATE_KEY` | Issuer key, used only by `credential:issue` and `issuer:register`. |
| `ISSUER_PUBLIC_KEY` | Optional reduced mode (see below). Unset by default. |
| `AUDIT_TOPIC_ID` | HCS topic for the audit log (create with `audit:create-topic`). |
| `COMPLIANCE_TOKEN_ADDRESS` / `TOKEN_SALE_ADDRESS` | Contract addresses when not in `deployedContracts.ts`. |
| `ADMIN_API_TOKEN` | Bearer token for `/api/admin/*`. |

> **Demo-grade guard.** `ADMIN_API_TOKEN` is a single shared secret compared
> server-side; it is fine for a template but is not production authentication.

> **DID resolution is the default.** The server resolves `ISSUER_DID` from its HCS topic
> and verifies credentials against the DID document's Ed25519 `#did-root-key`. Register the
> issuer once with `yarn workspace @sh/nextjs issuer:register`.
>
> **Reduced issuer mode (fallback).** If `ISSUER_PUBLIC_KEY` is set (multibase `z...` or
> base58), the server verifies against that key instead of resolving `ISSUER_DID`. This is
> an explicit fallback for environments where DID registration is unavailable; resolution
> is never faked.

**Never commit `.env`/`.env.local` or private keys** — both are gitignored. With no env
file the app still boots; the pages show an explicit "Missing configuration" state.

## Compliance dApp (API + pages)

The documented order is: associate the token → present a signed credential → server
verifies it at the issuer DID → the operator grants KYC through the contract → the
investor buys through `TokenSale`. Every compliance action is published to HCS.

| Page | What it does |
| --- | --- |
| `/investor` | Associate, submit a credential, buy HBAR with a live USD estimate and stale-price warning. |
| `/admin` | Revoke KYC, freeze/unfreeze an account, pause/unpause the token (requires `ADMIN_API_TOKEN`). |
| `/audit` | HCS timeline with HashScan links and an indexing-lag note. |

| API route | Purpose |
| --- | --- |
| `POST /api/kyc/request` | Verify a credential, then grant KYC and log to HCS. |
| `POST /api/admin/{revoke-kyc,freeze,unfreeze,pause,unpause}` | Bearer-guarded compliance actions. |
| `GET /api/audit` | Paginated HCS messages from the Mirror Node. |
| `GET /api/config`, `GET /api/token`, `GET /api/investor/status` | Read-only helpers for the UI. |

Helper scripts (run from `packages/nextjs`):

```bash
yarn workspace @sh/nextjs issuer:register       # register the issuer did:hedera
yarn workspace @sh/nextjs audit:create-topic     # create the HCS audit topic
yarn workspace @sh/nextjs credential:issue --address 0x...   # sign a demo credential
```

Tests for the API layer run with `yarn next:test` (vitest).


## Deploy and verify on Hedera

```bash
yarn hardhat:account:generate          # create + fund the deployer
yarn hardhat:deploy --network hederaTestnet
yarn hardhat:verify:testnet
```

The price feed resolves automatically per network: Chainlink HBAR/USD on
[testnet](https://docs.chain.link/data-feeds/price-feeds/addresses?network=hedera)
(`0x59bC155EB6c6C415fE43255aF66EcF0523c92B4a`) or mainnet
(`0xAF685FB45C12b92b5054ccb9313e135525F9b5d5`).

## Project layout

- `packages/hardhat` — Hardhat config, contracts, `deploy/` scripts, tests
- `packages/nextjs` — Next.js app (RainbowKit, wagmi, scaffold config)

## Links

- [Scaffold HBAR docs](https://docs.hedera.com/solutions/tools/scaffold-hbar/index)
- [HTS system contract](https://docs.hedera.com/evm/hedera-services/system-contracts/hts)
- [HBAR decimals](https://docs.hedera.com/evm/differences/hbar-decimals)
- [HTS KYC tutorial](https://docs.hedera.com/evm/tutorials/hedera/hts-evm/part2-kyc-update)
- [HashScan](https://hashscan.io/)
