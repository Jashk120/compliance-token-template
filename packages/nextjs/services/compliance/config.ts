import { ConfigurationError } from "./errors";
import deployedContracts from "~~/contracts/deployedContracts";
import type { HederaNetwork, PublicConfig } from "~~/utils/compliance/types";

const NETWORK_CHAIN_ID: Record<HederaNetwork, number> = { testnet: 296, mainnet: 295 };
const MIRROR_BASE: Record<HederaNetwork, string> = {
  testnet: "https://testnet.mirrornode.hedera.com",
  mainnet: "https://mainnet.mirrornode.hedera.com",
};
const RPC_URL: Record<HederaNetwork, string> = {
  testnet: "https://testnet.hashio.io/api",
  mainnet: "https://mainnet.hashio.io/api",
};

export type ServerConfig = {
  network: HederaNetwork;
  chainId: number;
  mirrorBaseUrl: string;
  rpcUrl: string;
  operatorId: string;
  operatorKey: string;
  issuerDid: string;
  auditTopicId: string;
  adminApiToken: string;
  complianceTokenAddress: string;
  tokenSaleAddress: string;
};

export function activeNetwork(): HederaNetwork {
  return process.env.HEDERA_NETWORK === "mainnet" ? "mainnet" : "testnet";
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function deployedAddress(chainId: number, name: "ComplianceToken" | "TokenSale"): string | undefined {
  const entry = (deployedContracts as Record<number, Record<string, { address?: string }>>)[chainId]?.[name];
  const address = entry?.address;
  if (typeof address === "string" && /^0x[0-9a-fA-F]{40}$/.test(address) && !/^0x0+$/.test(address)) {
    return address;
  }
  return undefined;
}

function resolveAddress(chainId: number, name: "ComplianceToken" | "TokenSale", envKey: string): string | undefined {
  return deployedAddress(chainId, name) ?? clean(process.env[envKey]);
}

export function getServerConfig(): ServerConfig {
  const network = activeNetwork();
  const chainId = NETWORK_CHAIN_ID[network];
  const missing: string[] = [];

  const operatorId = clean(process.env.HEDERA_OPERATOR_ID);
  if (!operatorId) missing.push("HEDERA_OPERATOR_ID");
  const operatorKey = clean(process.env.HEDERA_OPERATOR_PRIVATE_KEY);
  if (!operatorKey) missing.push("HEDERA_OPERATOR_PRIVATE_KEY");
  const issuerDid = clean(process.env.ISSUER_DID);
  if (!issuerDid) missing.push("ISSUER_DID");
  const auditTopicId = clean(process.env.AUDIT_TOPIC_ID);
  if (!auditTopicId) missing.push("AUDIT_TOPIC_ID");
  const complianceTokenAddress = resolveAddress(chainId, "ComplianceToken", "COMPLIANCE_TOKEN_ADDRESS");
  if (!complianceTokenAddress) missing.push("COMPLIANCE_TOKEN_ADDRESS");
  const tokenSaleAddress = resolveAddress(chainId, "TokenSale", "TOKEN_SALE_ADDRESS");
  if (!tokenSaleAddress) missing.push("TOKEN_SALE_ADDRESS");

  if (missing.length > 0) {
    throw new ConfigurationError(missing);
  }

  return {
    network,
    chainId,
    mirrorBaseUrl: clean(process.env.HEDERA_MIRROR_URL) ?? MIRROR_BASE[network],
    rpcUrl: clean(process.env.HEDERA_RPC_URL) ?? RPC_URL[network],
    operatorId: operatorId as string,
    operatorKey: operatorKey as string,
    issuerDid: issuerDid as string,
    auditTopicId: auditTopicId as string,
    adminApiToken: clean(process.env.ADMIN_API_TOKEN) ?? "",
    complianceTokenAddress: complianceTokenAddress as string,
    tokenSaleAddress: tokenSaleAddress as string,
  };
}

// Audit needs only a topic id and a mirror URL, so it stays usable without operator/issuer credentials.
export type AuditConfig = {
  network: HederaNetwork;
  mirrorBaseUrl: string;
  auditTopicId: string;
};

export function getAuditConfig(): AuditConfig {
  const network = activeNetwork();
  const auditTopicId = clean(process.env.AUDIT_TOPIC_ID);
  if (!auditTopicId) {
    throw new ConfigurationError(["AUDIT_TOPIC_ID"]);
  }
  return {
    network,
    mirrorBaseUrl: clean(process.env.HEDERA_MIRROR_URL) ?? MIRROR_BASE[network],
    auditTopicId,
  };
}

export function requireAdminToken(): string {
  const token = clean(process.env.ADMIN_API_TOKEN);
  if (!token) {
    throw new ConfigurationError(["ADMIN_API_TOKEN"]);
  }
  return token;
}

export function getIssuerDid(): string {
  const issuerDid = clean(process.env.ISSUER_DID);
  if (!issuerDid) {
    throw new ConfigurationError(["ISSUER_DID"]);
  }
  return issuerDid;
}

export function getPublicConfig(): PublicConfig {
  const network = activeNetwork();
  const chainId = NETWORK_CHAIN_ID[network];
  const missing: string[] = [];
  const operatorId = clean(process.env.HEDERA_OPERATOR_ID);
  if (!operatorId) missing.push("HEDERA_OPERATOR_ID");
  if (!clean(process.env.HEDERA_OPERATOR_PRIVATE_KEY)) missing.push("HEDERA_OPERATOR_PRIVATE_KEY");
  const issuerDid = clean(process.env.ISSUER_DID);
  if (!issuerDid) missing.push("ISSUER_DID");
  const auditTopicId = clean(process.env.AUDIT_TOPIC_ID);
  if (!auditTopicId) missing.push("AUDIT_TOPIC_ID");
  const complianceTokenAddress = resolveAddress(chainId, "ComplianceToken", "COMPLIANCE_TOKEN_ADDRESS");
  if (!complianceTokenAddress) missing.push("COMPLIANCE_TOKEN_ADDRESS");
  const tokenSaleAddress = resolveAddress(chainId, "TokenSale", "TOKEN_SALE_ADDRESS");
  if (!tokenSaleAddress) missing.push("TOKEN_SALE_ADDRESS");

  return {
    configured: missing.length === 0,
    missing,
    network,
    chainId,
    complianceTokenAddress: complianceTokenAddress ?? null,
    tokenSaleAddress: tokenSaleAddress ?? null,
    auditTopicId: auditTopicId ?? null,
    issuerDid: issuerDid ?? null,
  };
}
