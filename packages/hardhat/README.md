# Hardhat package (Hedera)

Hardhat config, contracts, deploy scripts, tests, and HashScan verification for the
Compliance Token template.

## Contracts

| Contract | Purpose |
| --- | --- |
| `contracts/ComplianceToken.sol` | Creates the HTS fungible token and manages KYC / freeze / pause. |
| `contracts/TokenSale.sol` | Sells treasury tokens for HBAR at a Chainlink-priced USD rate. |
| `contracts/ChainlinkPriceFeedAdapter.sol` | Swappable price-feed wrapper. |
| `contracts/interfaces/IHederaTokenService.sol` | Minimal HTS precompile interface (`0x167`). |
| `contracts/test/MockHTS.sol` | Local HTS stand-in (injected via constructor). |
| `contracts/test/MockChainlinkAggregator.sol` | Settable price feed for tests. |

## Local development

From the repo root:

1. **Start the local chain** (Hedera testnet fork):
   ```bash
   yarn hardhat:chain
   ```
2. **Deploy + create the demo token** (separate terminal):
   ```bash
   yarn hardhat:deploy --network localhost
   ```
3. **Run the tests** (offline, against the mocks):
   ```bash
   yarn hardhat:test
   ```
   `yarn hardhat:test:forking` runs the same suite against a forked Hedera testnet.

## Deploy and verify on Hedera testnet/mainnet

1. Generate or import a deployer account:
   ```bash
   yarn hardhat:account:generate
   ```
2. Fund it on testnet: <https://portal.hedera.com/faucet>.
3. Deploy and verify:
   ```bash
   yarn hardhat:deploy --network hederaTestnet
   yarn hardhat:verify:testnet
   ```

## Layout

- `contracts/` — Solidity sources (production contracts and `test/` mocks)
- `deploy/` — hardhat-deploy scripts (`00`–`05`)
- `scripts/` — account helpers, ABI generation, and `liveProof.ts` (testnet proof runner)
- `test/` — unit tests (`yarn hardhat:test`)
- `docs/architecture.md` — treasury/key and unit design
