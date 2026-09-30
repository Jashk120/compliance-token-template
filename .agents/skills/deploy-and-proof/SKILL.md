---
name: deploy-and-proof
description: Deploy the Compliance Token template to Hedera testnet and produce the live proof. Use when asked to deploy, create the token, grant roles, create the audit topic, register the issuer DID, or regenerate docs/testnet-proof.md.
---

# Deploy and proof

## Order of operations

1. `yarn setup` — create/normalise credentials (only if `yarn doctor` is not READY).
2. `yarn doctor --strict` — deploy gate; exit 0 required.
3. `yarn deploy:testnet` — contracts, token, roles, audit topic, issuer DID.
4. `yarn proof` — runs the live proof and writes `packages/hardhat/docs/testnet-proof.md`.
5. `yarn next:dev` — boot the app.

`yarn deploy:testnet` is resumable: it detects work already done from the chain / Mirror Node and prints what it skipped.

## What deploy:testnet does

- Deploys with `hardhat-deploy` (re-running `yarn hardhat deploy` reuses existing deployments).
- Creates the HTS token with the HIP-358 creation fee (`createToken`, forwarded with a ~20 HBAR buffer).
- Grants `COMPLIANCE_OFFICER_ROLE` to the configured operator's long-zero address
  (derived from `HEDERA_OPERATOR_ID`) **only after the CallerProbe proof** confirms `msg.sender`.
- Creates the HCS audit topic if `AUDIT_TOPIC_ID` is empty.
- Registers the issuer DID (live). On failure it falls back to reduced mode with an explicit warning.
- Writes ids **only** to `packages/nextjs/.env.local` (never `deployedContracts.ts`; the deploy task is run with `DX_SKIP_TS_ABI=true`).
- Prints HashScan links.

## Units (get this wrong and amounts are off by 1e10)

- Solidity/ABI amounts are **tinybar** (1 HBAR = 1e8 tinybar).
- Hedera JSON-RPC transaction values are **weibar** (1 HBAR = 1e18 weibar).
- Convert: `weibar = tinybar * 10n ** 10n` (see `scripts/createLiveToken.ts`).

## Expected HTS / contract response codes

| Code | Meaning |
| --- | --- |
| 22 | SUCCESS |
| 184 | `NotAssociated` — account not associated with the token |
| 176 | `KycNotGranted` |
| 165 | `Frozen` |
| 265 | `Paused` |
| 15 | invalid/nonexistent token |

These are asserted live in `scripts/liveProof.ts` (`LIVE-1` … `LIVE-7`).

## If a balance is low

Doctor prints the faucet link (`https://portal.hedera.com/faucet`). Fund the deployer (>= 100 HBAR recommended) and the operator (>= 20 HBAR), then re-run.
