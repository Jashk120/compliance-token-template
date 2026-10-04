# Hedera testnet proof — Compliance Token template

Generated: 2026-09-30T11:08:05.131Z
Network: hederaTestnet (chain id 296) · Explorer: https://hashscan.io/testnet



| Step | Expected | Actual | Tx hash | HashScan | Notes |
| --- | --- | --- | --- | --- | --- |
| LIVE-1 buy unassociated | KycNotGranted(176) | KycNotGranted(176) | - | - | eth_call |
| LIVE-2 associate | 22 (SUCCESS) | staticCall rc=194 (TOKEN_ALREADY_ASSOCIATED_TO_ACCOUNT) | `0x9ff6a089812bdff22ad61a4bd6eea307a38db00a05e73ce5932f9b32fda8dc9b` | https://hashscan.io/testnet/tx/0x9ff6a089812bdff22ad61a4bd6eea307a38db00a05e73ce5932f9b32fda8dc9b | Not a failure: the account was already associated from an earlier run, so `associateToken` via the `0x167` precompile returned 194 (`TOKEN_ALREADY_ASSOCIATED_TO_ACCOUNT`) instead of 22. The association is in place — every later row (buy/KYC/freeze) depends on it. |
| LIVE-2 buy without KYC | KycNotGranted(176) | KycNotGranted(176) | - | - | eth_call |
| LIVE-3a grantKyc unassociated | HtsCallFailed(184) | HtsCallFailed(184) | - | - | real response code |
| LIVE-3a2 grantKyc nonexistent | HtsCallFailed(15) | HtsCallFailed(15) | - | - | real response code |
| LIVE-3b grantKyc associated | success | success | `0x818bbc37338a74ec8b81caaa06d911b09a1415af9c644455fb7e7fb7cb8d956d` | https://hashscan.io/testnet/tx/0x818bbc37338a74ec8b81caaa06d911b09a1415af9c644455fb7e7fb7cb8d956d |  |
| LIVE-3c SDK msg.sender | 0x000000000000000000000000000000000086790b | 0x000000000000000000000000000000000086790b | - | - | match; CallerProbe record() from Mirror Node https://hashscan.io/testnet/contract/0x9a31480Cb8c57e40101ED07b3D5b64F33b42150A |
| LIVE-4 buy within cap | success | sent=4668472182721760366 tokens=499999 | `0xfc378533efa2d4019248bc4a79101bbc0b0655ae945ac9c25f3e5960e4af8cfe` | https://hashscan.io/testnet/tx/0xfc378533efa2d4019248bc4a79101bbc0b0655ae945ac9c25f3e5960e4af8cfe | usd8=50000000 answer=10710142 updatedAt=1790766345 age=106s |
| LIVE-5 buy over cap | PerInvestorCapExceeded | PerInvestorCapExceeded(0x1125A220766E1dC7897ebBb8951C35F77018645B,100000000001,100000000000) | - | - | eth_call |
| LIVE-6 frozen buy | Frozen(165) | Frozen(165) | - | - | eth_call |
| LIVE-6 paused buy | Paused(265) | Paused(265) | - | - | eth_call |
| LIVE-7 feed read | fresh answer | price8=10710142 | - | - | roundId=18446744073709596531 updatedAt=1790766345 age=139s |
| DEPLOY ComplianceToken | contract id | 0.0.10789465 | - | - | https://hashscan.io/testnet/contract/0x83cA87f6D85e46836338b4fEBeC3518c3a2Cb8DA |
| DEPLOY TokenSale | contract id | 0.0.10789467 | - | - | https://hashscan.io/testnet/contract/0xF964dCA4F31C0c09F4adC88DbFC0aaf54ab9592c |
| DEPLOY token keys | admin/kyc/freeze/pause/supply = ComplianceToken | admin=0.0.10789465 kyc=0.0.10789465 freeze=0.0.10789465 pause=0.0.10789465 supply=0.0.10789465 | - | - | https://hashscan.io/testnet/token/0x0000000000000000000000000000000000A4a25d |

## Deploy transactions (hederaTestnet)

| Step | Tx | HashScan |
| --- | --- | --- |
| DEPLOY-4 ComplianceToken -> 0.0.10789465 | `0x1544a35923016fd289dd3ee389d3a040724ab61c56b23d2d5702fe794df3355e` | https://hashscan.io/testnet/tx/0x1544a35923016fd289dd3ee389d3a040724ab61c56b23d2d5702fe794df3355e |
| DEPLOY-4 ChainlinkPriceFeedAdapter -> 0.0.10789466 | `0x1c69d14eb1fa71216211572eeebc53b5b17b15e148a233c9830d09903592fc0d` | https://hashscan.io/testnet/tx/0x1c69d14eb1fa71216211572eeebc53b5b17b15e148a233c9830d09903592fc0d |
| DEPLOY-4 TokenSale -> 0.0.10789467 | `0x4d708d758174a72bfba545f9597a56c50d8b13c256096c11bc191b60409bbc34` | https://hashscan.io/testnet/tx/0x4d708d758174a72bfba545f9597a56c50d8b13c256096c11bc191b60409bbc34 |
| DEPLOY-5 createToken -> token 0.0.10789469 | `0x2b1aeb4fb089b9dfa9e0409b3794e7077530751612dae523dfe35a9c4a029630` | https://hashscan.io/testnet/tx/0x2b1aeb4fb089b9dfa9e0409b3794e7077530751612dae523dfe35a9c4a029630 |
| Deploy CallerProbe 0.0.10789486 | `0x01c6d69ebbcd2c683586cbba20b1b07e684da67bad178f295482c5ea4477fe6c` | https://hashscan.io/testnet/tx/0x01c6d69ebbcd2c683586cbba20b1b07e684da67bad178f295482c5ea4477fe6c |
| Fund investor 0x1125...645B (0.0.10788949) with 60 HBAR | `0x8003d325924486925e106d2e4c5da65d1f23a1beef5c825661f168224bbb5cd9` | https://hashscan.io/testnet/tx/0x8003d325924486925e106d2e4c5da65d1f23a1beef5c825661f168224bbb5cd9 |

## Integration (API layer)

| Step | Expected | Actual | Tx hash | HashScan | Notes |
| --- | --- | --- | --- | --- | --- |
| LIVE-3c -> grant COMPLIANCE_OFFICER_ROLE to operator | role granted | granted to 0x000000000000000000000000000000000086790b (GRANT_OPERATOR_OFFICER=true) | - | - | precedes D |
| D1 createAuditTopic (operator) | topic id | 0.0.10791318 | - | https://hashscan.io/testnet/topic/0.0.10791318 | HCS audit topic |
| D1 registerIssuerDid (operator) | did:hedera | did:hedera:testnet:8itErCqgyMUu7DrE17rQh5xQoufYWM7uNpgmVtJrLW6_0.0.10791688 | `0.0.8812811-1790768482-496168544` | https://hashscan.io/testnet/transaction/0.0.8812811-1790768482-496168544 | HCS topic 0.0.10791688; create tx 0.0.8812811-1790768481-546962800 |
| D1 resolveIssuerKey(DID) | issuer public key from DID document | `#did-root-key` Ed25519VerificationKey2020 `z6Mkeayvq6TH2Wqx1c4Yua5hFndxEPBWxPbUbPjcbmrKmZHU` | - | https://hashscan.io/testnet/topic/0.0.10791688 | matches ISSUER_DID_PRIVATE_KEY; verifier accepts its signature |
| D3 issueDemoCredential (investor) | signed credential | credentialHash 46f9c5c9000f7b1d065286965ba10b089e68801b057fbe3cd5a8880b6e2b0081 | - | - | issuer = live DID |
| D3 POST /api/kyc/request | 200 grantKyc | 200 grantKyc (operator 0x000000000000000000000000000000000086790b) with ISSUER_PUBLIC_KEY unset | `0.0.8812811-1790768770-836567586` | https://hashscan.io/testnet/transaction/0.0.8812811-1790768770-836567586 | HCS auditTxId 0.0.8812811@1790768768.830953756 |
| D3 on-chain KYC (Mirror Node) | kyc_status GRANTED | kyc=GRANTED freeze=UNFROZEN on token 0.0.10789469 | - | https://hashscan.io/testnet/account/0.0.10788949 | |
| D3 investor buys | success | success (50000000000 usd8 slice) | `0x4c00a62cae9bd3cbe846c2808b947f7174a0079afe2ae0091107f087d29b78d0` | https://hashscan.io/testnet/tx/0x4c00a62cae9bd3cbe846c2808b947f7174a0079afe2ae0091107f087d29b78d0 | |
| D3 GET /api/audit | HCS entries within 30 s | 3 entries: freeze, unfreeze, grantKyc | - | https://hashscan.io/testnet/topic/0.0.10791318 | HCS msgs 0.0.8812811@1790767359.722755900 / @1790767360.907285214 / @1790767394.831220810 |
| D3 negative: tampered credential | rejected | CREDENTIAL_INVALID_SIGNATURE (HTTP 401) | - | - | |
| D3 negative: expired credential | rejected | CREDENTIAL_EXPIRED (HTTP 401) | - | - | |
| D3 negative: wrong subject | rejected | CREDENTIAL_SUBJECT_MISMATCH (HTTP 403) | - | - | |
| D3 negative: admin route without Bearer | 401 | UNAUTHORIZED (HTTP 401) | - | - | |
| D5 integration | merge feature -> main | merged; yarn lint/build/next:test/hardhat:test green | - | - | generic deployedContracts.ts kept |

## Atomic audit path (live, HIP-551)

Verified 2026-10-01 on hederaTestnet with `HEDERA_ATOMIC_AUDIT` unset, so the default
atomic path was used (not the sequential fallback). Each row is one HIP-551 batch: the
HCS submit is inner first and the contract call inner last, and both commit together.
Every batch and both inner transactions returned `SUCCESS` on the Mirror Node.

| Action | Expected | Actual | Outer batch id | Inner contract id | Inner HCS id | HashScan |
| --- | --- | --- | --- | --- | --- | --- |
| A1 POST /api/kyc/request (grantKyc) | 200, batch SUCCESS | 200 `grantKyc`; batch + 2 inner SUCCESS | `0.0.8812811-1790855582-766675287` | `0.0.8812811-1790855582-189303575` | `0.0.8812811-1790855584-464999160` | [batch](https://hashscan.io/testnet/transaction/0.0.8812811-1790855582-766675287) · [contract](https://hashscan.io/testnet/transaction/0.0.8812811-1790855582-189303575) · [audit](https://hashscan.io/testnet/transaction/0.0.8812811-1790855584-464999160) |
| A2 POST /api/admin/freeze | 200, batch SUCCESS | 200 `freeze`; batch + 2 inner SUCCESS | `0.0.8812811-1790855621-506805474` | `0.0.8812811-1790855619-187611825` | `0.0.8812811-1790855618-447707543` | [batch](https://hashscan.io/testnet/transaction/0.0.8812811-1790855621-506805474) · [contract](https://hashscan.io/testnet/transaction/0.0.8812811-1790855619-187611825) · [audit](https://hashscan.io/testnet/transaction/0.0.8812811-1790855618-447707543) |
| A3 POST /api/admin/unfreeze | 200, batch SUCCESS | 200 `unfreeze`; batch + 2 inner SUCCESS | `0.0.8812811-1790855627-264806279` | `0.0.8812811-1790855629-482666241` | `0.0.8812811-1790855630-566807803` | [batch](https://hashscan.io/testnet/transaction/0.0.8812811-1790855627-264806279) · [contract](https://hashscan.io/testnet/transaction/0.0.8812811-1790855629-482666241) · [audit](https://hashscan.io/testnet/transaction/0.0.8812811-1790855630-566807803) |

Post-run Mirror Node state for investor `0.0.10788949` on token `0.0.10789469`:
`kyc_status = GRANTED`, `freeze_status = UNFROZEN` (the freeze and unfreeze both took
effect in order) — <https://hashscan.io/testnet/account/0.0.10788949>. Full transaction
ids (outer · contract inner · HCS inner): `0.0.8812811-1790855582-766675287` ·
`0.0.8812811-1790855582-189303575` · `0.0.8812811-1790855584-464999160`;
`0.0.8812811-1790855621-506805474` · `0.0.8812811-1790855619-187611825` ·
`0.0.8812811-1790855618-447707543`; `0.0.8812811-1790855627-264806279` ·
`0.0.8812811-1790855629-482666241` · `0.0.8812811-1790855630-566807803`.
