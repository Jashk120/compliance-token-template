export type HederaNetwork = "testnet" | "mainnet";

export type Credential = {
  subject: string;
  issuer: string;
  issuedAt: string;
  expiresAt: string;
  claims: {
    kycLevel: number;
  };
  signature: string;
};

export type AuditMessage = {
  action: string;
  account: string;
  operator: string;
  txId: string;
  timestamp: string;
  credentialHash?: string;
};

export type AuditEntry = AuditMessage & {
  sequenceNumber: number;
  consensusTimestamp: string;
};

export type PublicConfig = {
  configured: boolean;
  missing: string[];
  network: HederaNetwork;
  chainId: number;
  complianceTokenAddress: string | null;
  tokenSaleAddress: string | null;
  auditTopicId: string | null;
  issuerDid: string | null;
};

export type InvestorStatus = {
  evmAddress: string;
  hederaAccountId: string | null;
  associated: boolean;
  kycGranted: boolean;
  frozen: boolean;
  tokenId: string | null;
  tokenAddress: string | null;
  paused: boolean;
  capUsd8: string | null;
  spentUsd8: string | null;
  tokenPriceUsd8: string | null;
  tokenUnit: string | null;
};

export type ApiError = {
  code: string;
  message: string;
};
