# Architecture

This template shows one production-shaped pattern for a Hedera Token Service (HTS)
compliance token with a USD-priced sale. It is deliberately small: two contracts, two
interfaces and a mock of the HTS precompile.

## Contracts

| Contract | Role |
| --- | --- |
| `ComplianceToken` | Creates the HTS fungible token, owns its compliance keys, and holds the treasury. Exposes role-gated KYC / freeze / pause controls and a `saleTransfer` hook for an authorised sale. |
| `TokenSale` | Prices the token in USD via a Chainlink HBAR/USD feed, enforces a per-investor USD cap, and asks the token contract to move treasury tokens. |
| `ChainlinkPriceFeedAdapter` | Thin `IPriceFeed` wrapper over a Chainlink `AggregatorV3` proxy so the feed can be swapped. |
| `MockHTS` | Local, stateful stand-in for the `0x167` precompile. |
| `MockChainlinkAggregator` | Settable `AggregatorV3` feed for tests. |

## Who holds the treasury, and why

The deciding constraint is Hedera's **contractId key** rule and the fact that a token
transfer must be authorised by the account that holds the tokens.

- In HTS, when a token key is a contract ID, *the contract that makes the precompile
  call is the one authorised by that key* — there is no proxy or `msg.sender`
  forwarding. See [Hedera docs on the `KeyValue` struct](https://docs.hedera.com/evm/hedera-services/system-contracts)
  and the [HTS key overview](https://docs.hedera.com/evm/hedera-services/hts-solidity/create-tokens).
- Therefore the keyed contract and the caller of `grantTokenKyc` / `freezeToken` /
  `pauseToken` must be identical.
- Moving tokens out of the treasury requires the treasury holder itself to be the
  caller of `transferToken`; no other contract can move those tokens.

The simplest design that satisfies both rules is to keep the treasury **and** the keys
in the same contract:

1. `ComplianceToken.createToken` creates the token with `treasury = address(this)` and
   `ADMIN`, `KYC`, `FREEZE`, `SUPPLY` and `PAUSE` keys whose `contractId` is
   `address(this)`. There is no proxy and no external key manager.
2. The initial supply is credited to `address(this)`, so the treasury holder is the
   token contract.
3. `TokenSale` never touches the precompile. It calls
   `ComplianceToken.saleTransfer(to, amount)`, which is gated by `SALE_OPERATOR_ROLE`
   and makes the `transferToken` precompile call with `sender = address(this)`.

A token **must** have an admin key for the precompile create to succeed: a token created
from a contract with only KYC/FREEZE/SUPPLY/PAUSE keys (no admin key) reverts without
data. The admin key here is the contract itself, so it is used only to rotate the token's
keys; day-to-day administration stays with `COMPLIANCE_OFFICER_ROLE`.

### Paying for token creation

HIP-358 charges the precompile create the HAPI `TokenCreate` fee plus a 20% premium, and
the value is paid from the caller's HBAR (`msg.value`), not by gas. `createToken` is
payable and forwards a `creationFee` buffer (20 HBAR); the exact cost is about $1 USD in
HBAR (~13 HBAR at testnet prices), so the buffer covers the premium and price movement.
The precompile does not refund surplus, so `createToken` forwards exactly `creationFee`
and refunds any further surplus to the caller.

This keeps the strict contractId key rule intact (one contract signs for its keys and
for its treasury) while still separating sale pricing from token administration. The
alternative — making `TokenSale` the treasury — would force the sale contract to also
hold the compliance keys, mixing two responsibilities.

## KYC of the treasury

A KYC-enforced token requires the treasury account to be KYC-granted before it can hold
or move tokens. `createToken` therefore calls `grantTokenKyc(token, address(this))`
immediately after creation, mirroring the official tutorial:
<https://docs.hedera.com/evm/tutorials/hedera/hts-evm/part2-kyc-update>.
The test `grants KYC to the treasury after creation` locks this in.

## Roles

`ComplianceToken` uses OpenZeppelin `AccessControl` and nothing else:

- `DEFAULT_ADMIN_ROLE` — manages roles and the creation fee. No other owner powers.
- `COMPLIANCE_OFFICER_ROLE` — `grantKyc`, `revokeKyc`, `freeze`, `unfreeze`, `pause`,
  `unpause`.
- `SALE_OPERATOR_ROLE` — `saleTransfer`; grant it to the deployed `TokenSale`.

## Pricing and units

`msg.value` inside a contract on Hedera is denominated in **8-decimal tinybar**,
while the JSON-RPC relay accepts 18-decimal weibar from callers and converts to
tinybar for the EVM: `1 HBAR = 1e18 weibar = 1e8 tinybar`
([decimals docs](https://docs.hedera.com/evm/differences/hbar-decimals),
[msg.value docs](https://docs.hedera.com/evm/development/deploying)). `TokenSale`
normalises the feed to 8 decimals and converts with:

```
usd8  = msg.value * price8 / 1e8      // 8-decimal USD
tokens = usd8 * tokenUnit / tokenPriceUsd
```

`tokenPriceUsd` is the USD (8-decimal) price of one whole token and `tokenUnit` is
`10 ** tokenDecimals`. Rounding dust is refunded to the buyer in HBAR. Token math
is unchanged — only the HBAR unit moved from 18-decimal weibar to 8-decimal
tinybar.

## Failure handling

`TokenSale.buy` does not pre-check KYC, freeze or association in Solidity. It lets HTS
decide and maps the response code to a typed error: `KycNotGranted` (176), `Frozen`
(165), `Paused` (265), `NotAssociated` (184), otherwise `TransferFailed`. This keeps
on-chain enforcement authoritative and avoids duplicated policy.

## Testing the precompile locally

Hardhat cannot etch bytecode onto the `0x167` precompile the way Foundry does with
`vm.etch`, so the HTS address is injected: `ComplianceToken` takes an `htsAddress`
constructor argument, and tests pass the deployed `MockHTS` address. `MockHTS` stores
token keys, only lets the keyed contract mutate compliance state, tracks
association/KYC/frozen state and balances, and returns response codes (not reverts).
`transferToken` checks in the order paused → frozen → KYC → association.
