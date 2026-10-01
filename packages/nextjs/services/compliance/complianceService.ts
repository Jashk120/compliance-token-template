import { submitActionWithAudit } from "./atomicAudit";
import { submitAuditMessage } from "./auditLog";
import { getServerConfig } from "./config";
import { buildComplianceContractTransaction } from "./contractCall";
import { ComplianceActionError, describeSdkError } from "./errors";
import { getOperatorClient } from "./hederaClient";
import { AccountId, Status } from "@hiero-ledger/sdk";
import type { ComplianceAction } from "~~/utils/compliance/hts";
import type { AuditMessage } from "~~/utils/compliance/types";

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

async function executeAction(action: ComplianceAction, account?: string): Promise<string> {
  const config = getServerConfig();
  const client = getOperatorClient();
  const transaction = buildComplianceContractTransaction(action, account ?? null, config.complianceTokenAddress);

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
  const config = getServerConfig();
  const operator = operatorEvmAddress();
  const timestamp = new Date().toISOString();
  const makeAuditMessage = (txId: string): AuditMessage => ({
    action,
    account: account ?? operator,
    operator,
    txId,
    timestamp,
    ...(credentialHash ? { credentialHash } : {}),
  });

  if (config.atomicAudit) {
    const { txId, auditTxId } = await submitActionWithAudit(getOperatorClient(), {
      action,
      account,
      contractAddress: config.complianceTokenAddress,
      topicId: config.auditTopicId,
      makeAuditMessage,
    });
    return { action, account, operator, txId, auditTxId, timestamp };
  }

  const txId = await executeAction(action, account ?? undefined);
  const auditTxId = await submitAuditMessage(makeAuditMessage(txId));
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
