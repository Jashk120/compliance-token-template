# Next.js package (`@sh/nextjs`)

Next.js App Router dApp for the compliance token: investor / admin / audit
pages backed by a compliance API that verifies signed investor credentials
against a `did:hedera` issuer. See the root [README](../../README.md) for the
full walkthrough (`yarn setup` → `yarn doctor` → `yarn deploy:testnet` →
`yarn dev`).

## Env vars

Copy `.env.example` to `.env.local` (or run `yarn setup` from the repo root).
Key vars: `HEDERA_NETWORK`, `HEDERA_OPERATOR_ID`,
`HEDERA_OPERATOR_PRIVATE_KEY`, `ISSUER_DID` / `ISSUER_DID_PRIVATE_KEY`
(`ISSUER_PUBLIC_KEY` is the reduced-mode fallback), `AUDIT_TOPIC_ID`,
`COMPLIANCE_TOKEN_ADDRESS`, `TOKEN_SALE_ADDRESS`, `ADMIN_API_TOKEN`, plus
`NEXT_PUBLIC_*` wallet/RPC ids. Never put a secret under `NEXT_PUBLIC_`.

## Scripts

| Script             | What it does                                        |
| ------------------ | --------------------------------------------------- |
| `dev`              | Start the app (`yarn dev` from the root).           |
| `build`            | Production build (`yarn next:build` from the root). |
| `test`             | Vitest suite, resolver mocked (`yarn next:test`).   |
| `lint`             | Next.js lint (`yarn next:lint` from the root).      |
| `credential:issue` | Print a signed investor credential; writes nothing. |

Helper scripts (`issuer:register`, `audit:create-topic`, `credential:issue`)
load `.env.local` automatically; `credential:issue` also reads
`packages/hardhat/.env` and resolves its subject from `--address`, else
`INVESTOR_ADDRESS`, else `INVESTOR_PRIVATE_KEY`.

## Routes

Pages: `/` (landing), `/investor` (associate → verify → buy stepper),
`/admin` (role-gated actions, Bearer-guarded), `/audit` (HCS timeline).

API: `/api/kyc/request` (verify + grantKyc), `/api/admin/[action]`
(revoke-kyc, freeze, unfreeze, pause, unpause), `/api/audit`,
`/api/config`, `/api/token`, `/api/investor/status`,
`/api/hedera/account`.

## Services

Business logic lives in `services/compliance/` (`credential.ts`,
`issuerDid.ts`, `adminActions.ts`, `adminPrecheck.ts`, `auditLog.ts`,
`mirror.ts`, `chainReads.ts`, `config.ts`). Contract hooks live in
`hooks/scaffold-hbar/`.

## Audit atomicity (HIP-551)

Every compliance action and its HCS audit message commit in one HIP-551 atomic
batch (`services/compliance/atomicAudit.ts`): HCS submit inner first, the
single contract call inner last. Set `HEDERA_ATOMIC_AUDIT=false` only as an
escape hatch; the sequential path is not atomic.
