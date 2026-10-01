import { encodeAuditMessage } from "./auditLog";
import { buildComplianceContractTransaction } from "./contractCall";
import { ComplianceActionError, describeSdkError } from "./errors";
import { BatchTransaction, Status, TopicMessageSubmitTransaction } from "@hiero-ledger/sdk";
import type { Client } from "@hiero-ledger/sdk";
import type { ComplianceAction } from "~~/utils/compliance/hts";
import type { AuditMessage } from "~~/utils/compliance/types";

export type AtomicAuditOutcome = {
  txId: string;
  auditTxId: string;
};

export type AtomicAuditRequest = {
  action: ComplianceAction;
  account: string | null;
  contractAddress: string;
  topicId: string;
  makeAuditMessage: (txId: string) => AuditMessage;
};

/**
 * Commits a compliance action and its HCS audit message in one HIP-551 atomic batch:
 * both land or neither does, so the audit trail cannot diverge from token state.
 *
 * Inner order is not cosmetic. Since September 2026 Hedera allows at most one contract
 * call per batch and requires it to be the final inner transaction, so the HCS submit
 * must come first and the contract call last.
 */
export async function submitActionWithAudit(client: Client, request: AtomicAuditRequest): Promise<AtomicAuditOutcome> {
  const batchKey = client.operatorPublicKey;
  if (batchKey === null) {
    throw new ComplianceActionError(0, "The operator public key is required to sign an atomic batch.");
  }

  // Freezing the contract transaction assigns its id, which the audit message links to.
  const contractTransaction = buildComplianceContractTransaction(
    request.action,
    request.account,
    request.contractAddress,
  );
  await contractTransaction.batchify(client, batchKey);
  const contractTxId = contractTransaction.transactionId?.toString();
  if (!contractTxId) {
    throw new ComplianceActionError(0, "The contract transaction id was not assigned before batching.");
  }

  const auditTransaction = new TopicMessageSubmitTransaction()
    .setTopicId(request.topicId)
    .setMaxChunks(1)
    .setMessage(Buffer.from(encodeAuditMessage(request.makeAuditMessage(contractTxId)), "base64"));
  await auditTransaction.batchify(client, batchKey);

  const batch = new BatchTransaction().addInnerTransaction(auditTransaction).addInnerTransaction(contractTransaction);

  try {
    const response = await batch.execute(client);
    const receipt = await response.getReceipt(client);
    if (receipt.status.toString() !== Status.Success.toString()) {
      throw new ComplianceActionError(
        0,
        `Atomic ${request.action} batch failed with status ${receipt.status.toString()}`,
      );
    }
    const [auditId, contractId] = batch.innerTransactionIds;
    return {
      txId: contractId?.toString() ?? contractTxId,
      auditTxId: auditId?.toString() ?? "",
    };
  } catch (error) {
    if (error instanceof ComplianceActionError) {
      throw error;
    }
    throw new ComplianceActionError(0, describeSdkError(error));
  }
}
