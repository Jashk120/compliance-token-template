import { ContractExecuteTransaction, ContractFunctionParameters, ContractId } from "@hiero-ledger/sdk";
import type { ComplianceAction } from "~~/utils/compliance/hts";

/** Gas budget for a single role-gated compliance call (HTS precompile + event). */
export const CONTRACT_GAS = 800_000;

export function resolveContractId(address: string): ContractId {
  return address.startsWith("0x") ? ContractId.fromEvmAddress(0, 0, address) : ContractId.fromString(address);
}

/**
 * Builds (but does not freeze, sign or execute) the contract transaction for a compliance
 * action. Shared by the sequential and atomic audit paths so both call the same function.
 */
export function buildComplianceContractTransaction(
  action: ComplianceAction,
  account: string | null,
  contractAddress: string,
): ContractExecuteTransaction {
  return new ContractExecuteTransaction()
    .setContractId(resolveContractId(contractAddress))
    .setGas(CONTRACT_GAS)
    .setFunction(action, account ? new ContractFunctionParameters().addAddress(account) : undefined);
}
