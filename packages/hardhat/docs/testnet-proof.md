# Hedera testnet proof — Compliance Token template

Generated: 2026-09-30T08:22:36.817Z
Network: hederaTestnet (chain id 296) · Explorer: https://hashscan.io/testnet



| Step | Expected | Actual | Tx hash | HashScan | Notes |
| --- | --- | --- | --- | --- | --- |
| LIVE-1 buy unassociated | NotAssociated(184) | KycNotGranted(176) | - | - | eth_call |
| LIVE-2 associate | 22 | staticCall rc=22 | `0x1c696d910c4334744e4016d9bd707f4899dc0aa6a1dc6326270470744efb6f0e` | https://hashscan.io/testnet/tx/0x1c696d910c4334744e4016d9bd707f4899dc0aa6a1dc6326270470744efb6f0e | via 0x167 |
| LIVE-2 buy without KYC | KycNotGranted(176) | KycNotGranted(176) | - | - | eth_call |
| LIVE-3a grantKyc unassociated | HtsCallFailed(184) | HtsCallFailed(15) | - | - | real response code |
| LIVE-3b grantKyc associated | success | ProviderError: [Request ID: db7b6618-9d49-4e1d-96e0-0876731c54cd] Gas price '218' is below configured minimum gas price '1140000000000' | - | - |  |
| LIVE-3c SDK msg.sender | 0x000000000000000000000000000000000086790b | SKIPPED | - | - | needs HEDERA_OPERATOR_PRIVATE_KEY and a deployed CallerProbe |
| LIVE-4 buy within cap | success | KycNotGranted(176) | - | - |  |
| LIVE-5 buy over cap | PerInvestorCapExceeded | PerInvestorCapExceeded(0x1125A220766E1dC7897ebBb8951C35F77018645B,100000000001,100000000000) | - | - | eth_call |
| LIVE-6 freeze/pause | success | ProviderError: [Request ID: 9f7535b1-26b4-4b87-ad6e-07e2fd4cf75e] Gas price '218' is below configured minimum gas price '1140000000000' | - | - |  |
| LIVE-7 feed read | fresh answer | price8=10584126 | - | - | roundId=18446744073709596525 updatedAt=1790756295 age=260s |
| DEPLOY ComplianceToken | contract id | 0.0.10789465 | - | - | https://hashscan.io/testnet/contract/0x83cA87f6D85e46836338b4fEBeC3518c3a2Cb8DA |
| DEPLOY TokenSale | contract id | 0.0.10789467 | - | - | https://hashscan.io/testnet/contract/0xF964dCA4F31C0c09F4adC88DbFC0aaf54ab9592c |
| DEPLOY token keys | kyc/freeze/pause/supply = ComplianceToken | kyc=- freeze=- pause=- supply=- | - | - | https://hashscan.io/testnet/token/0x0000000000000000000000000000000000A4a25d |
