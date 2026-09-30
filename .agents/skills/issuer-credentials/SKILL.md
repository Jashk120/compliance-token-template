---
name: issuer-credentials
description: Set up and validate the deployer, operator, issuer and admin credentials for the Compliance Token template. Use when configuration is missing or invalid, when asked how to run the demo, when a key or DID needs to be configured, or before any deploy/proof command.
---

# Credentials and setup

## Never handle secrets outside the scripts

- Never read, print, echo or cat `.env` / `.env.local`, and never log a resolved key.
- Never ask the user to paste a private key, mnemonic or admin token into chat.
- Never place a key on a command line (argv) — scripts pass keys through the environment only.
- Public values (contract addresses, account ids, DIDs, transaction hashes) are fine to print.

## Always start with `yarn doctor`

`yarn doctor` is read-only and prints an OK / MISSING / INVALID / UNSAFE checklist without any values.

- `yarn doctor` — human checklist, exits 0 only when everything required is OK.
- `yarn doctor --json` — machine-readable report.
- `yarn doctor --strict` — also fails on warnings (low balance, stale feed).

If it is not READY, run the `next:` command printed under each issue first.

## Fix issues with `yarn setup`

Direct the user to `yarn setup` rather than editing env files by hand. It is interactive and idempotent:

- asks only for what is missing or invalid;
- takes keys through hidden prompts (`@inquirer/password`), never chat;
- generates the issuer Ed25519 key and `ADMIN_API_TOKEN`;
- writes files with mode `0600` and refuses to write to a non-git-ignored file;
- validates each value and finishes by running doctor.

## Where credentials live

| File | Variables |
| --- | --- |
| `packages/hardhat/.env` | `DEPLOYER_PRIVATE_KEY` or `DEPLOYER_PRIVATE_KEY_ENCRYPTED`, `INVESTOR_PRIVATE_KEY` |
| `packages/nextjs/.env.local` | `HEDERA_OPERATOR_ID`, `HEDERA_OPERATOR_PRIVATE_KEY`, `ISSUER_DID_PRIVATE_KEY`, `ISSUER_DID` / `ISSUER_PUBLIC_KEY`, `ADMIN_API_TOKEN`, `AUDIT_TOPIC_ID`, contract addresses |

Both files are git-ignored. The deployer key must never appear under `packages/nextjs/` and no secret may use a `NEXT_PUBLIC_` prefix — doctor reports both as UNSAFE.

## Issuer modes

- **Live**: `ISSUER_DID` is set and resolved from its HCS topic. Preferred; `yarn deploy:testnet` registers it.
- **Reduced**: only `ISSUER_PUBLIC_KEY` is set. A documented fallback when registration is unavailable; it is never faked.

Run `yarn doctor` to see which mode is active.
