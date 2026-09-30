---
name: extending-compliance
description: Extend the Compliance Token template with new roles, HCS audit actions, a different Chainlink price feed, or new compliance rules. Use when asked to add a role, add an audit/admin action, swap the oracle feed, or change a compliance rule.
---

# Extending the template

Read the existing files before changing them; every change here is load-bearing.

## Add a role

1. Declare the role id in `packages/hardhat/contracts/ComplianceToken.sol` (`bytes32 public constant X_ROLE = keccak256("X_ROLE")`).
2. Gate the relevant function with `onlyRole(X_ROLE)`.
3. Grant it in `packages/hardhat/deploy/04_grant_roles.ts` (idempotent `hasRole` check), or add a new tagged deploy function.
4. Add a unit test in `packages/hardhat/test/ComplianceToken.test.ts`.
5. Re-run `yarn hardhat:test` and `yarn deploy:testnet` (resumes and grants).

## Add an HCS audit / admin action

1. Add the action to `COMPLIANCE_ACTIONS` in `packages/nextjs/utils/compliance/hts.ts` and map a route in `ADMIN_ROUTES`.
2. Add the operator call in `packages/nextjs/services/compliance/complianceService.ts` (`runComplianceAction` publishes the HCS audit message automatically via `submitAuditMessage`).
3. If it takes an account, it is covered by `app/api/admin/[action]/route.ts`; if it is account-less, add it to `ACTIONS_WITHOUT_ACCOUNT`.
4. Keep the `AuditMessage` shape in `utils/compliance/types.ts` and the zod schemas in `services/compliance/schemas.ts` in sync.
5. Test via `yarn next:test`.

## Swap the price feed

- The adapter is `ChainlinkPriceFeedAdapter` (`packages/hardhat/contracts/`), selected in `packages/hardhat/deploy/02_deploy_price_feed.ts`.
- Point `HBAR_USD_FEED` (or the `TESTNET_FEED` / `MAINNET_FEED` constants) at the new aggregator, then re-run `yarn deploy:testnet`.
- **Staleness matters**: `TokenSale.maxStaleness` (default 86400s) must exceed the feed's heartbeat or buys revert `StalePrice`. See `packages/hardhat/docs/architecture.md`.

## Add a compliance rule

- On-chain (preferred for enforcement): implement it in `ComplianceToken.sol` and expose a custom error; add a unit test and a live-proof row in `scripts/liveProof.ts`.
- Off-chain (policy/gating): implement it in the API layer and return a clear error code from `services/compliance/errors.ts`.
- Keep token keys as `contractId` keys — only the contract itself is authorised to call the HTS precompile.
