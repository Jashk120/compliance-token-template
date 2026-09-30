import { submitAuditMessage } from "./auditLog";
import { getServerConfig } from "./config";
import { ComplianceActionError } from "./errors";
import { getOperatorClient } from "./hederaClient";
import {
  AccountId,
  ContractExecuteTransaction,
  ContractFunctionParameters,
  ContractId,
  Status,
} from "@hiero-ledger/sdk";
import type { ComplianceAction } from "~~/utils/compliance/hts";
import type { AuditMessage } from "~~/utils/compliance/types";

const CONTRACT_GAS = 800_000;

export type ComplianceActionResult = {
  action: ComplianceAction;
  account: string | null;
  operator: string;
  txId: string | null;
  auditTxId: string | null;
  timestamp: string;
  alreadyInState?: boolean;
  message?: string;
};

export function operatorEvmAddress(): string {
  return `0x${AccountId.fromString(getServerConfig().operatorId).toEvmAddress()}`;
}

export function alreadyInStateResult(
  action: ComplianceAction,
  account: string | null,
  message: string,
): ComplianceActionResult {
  return {
    action,
    account,
    operator: operatorEvmAddress(),
    txId: null,
    auditTxId: null,
    timestamp: new Date().toISOString(),
    alreadyInState: true,
    message,
  };
}

function describeSdkError(error: unknown): string {
  if (
    error !== null &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }
  return "The contract call failed.";
}

function resolveContractId(address: string): ContractId {
  return address.startsWith("0x") ? ContractId.fromEvmAddress(0, 0, address) : ContractId.fromString(address);
}

async function executeAction(action: ComplianceAction, account?: string): Promise<string> {
  const config = getServerConfig();
  const client = getOperatorClient();
  const transaction = new ContractExecuteTransaction()
    .setContractId(resolveContractId(config.complianceTokenAddress))
    .setGas(CONTRACT_GAS)
    .setFunction(action, account ? new ContractFunctionParameters().addAddress(account) : undefined);

  try {
    const response = await transaction.execute(client);
    const receipt = await response.getReceipt(client);
    if (receipt.status.toString() !== Status.Success.toString()) {
      throw new ComplianceActionError(0, `HTS action ${action} failed with status ${receipt.status.toString()}`);
    }
    return response.transactionId.toString();
  } catch (error) {
    if (error instanceof ComplianceActionError) {
      throw error;
    }
    throw new ComplianceActionError(0, describeSdkError(error));
  }
}

export async function runComplianceAction(
  action: ComplianceAction,
  account: string | null,
  credentialHash?: string,
): Promise<ComplianceActionResult> {
  const txId = await executeAction(action, account ?? undefined);
  const operator = operatorEvmAddress();
  const timestamp = new Date().toISOString();
  const message: AuditMessage = {
    action,
    account: account ?? operator,
    operator,
    txId,
    timestamp,
    ...(credentialHash ? { credentialHash } : {}),
  };
  const auditTxId = await submitAuditMessage(message);
  return { action, account, operator, txId, auditTxId, timestamp };
}

export function grantKyc(account: string, credentialHash?: string): Promise<ComplianceActionResult> {
  return runComplianceAction("grantKyc", account, credentialHash);
}

export function revokeKyc(account: string): Promise<ComplianceActionResult> {
  return runComplianceAction("revokeKyc", account);
}

export function freeze(account: string): Promise<ComplianceActionResult> {
  return runComplianceAction("freeze", account);
}

export function unfreeze(account: string): Promise<ComplianceActionResult> {
  return runComplianceAction("unfreeze", account);
}

export function pause(): Promise<ComplianceActionResult> {
  return runComplianceAction("pause", null);
}

export function unpause(): Promise<ComplianceActionResult> {
  return runComplianceAction("unpause", null);
}
