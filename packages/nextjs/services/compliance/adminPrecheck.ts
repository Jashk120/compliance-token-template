import { readComplianceTokenAddress } from "./chainReads";
import { getTokenInfo, getTokenRelationship } from "./mirror";
import type { ComplianceAction } from "~~/utils/compliance/hts";

export type ComplianceState = { frozen: boolean; kycGranted: boolean; paused: boolean };

/** Returns a human message when the requested action is already satisfied, else null. */
export function alreadyInStateMessage(action: ComplianceAction, state: ComplianceState): string | null {
  switch (action) {
    case "freeze":
      return state.frozen ? "This account is already frozen." : null;
    case "unfreeze":
      return state.frozen ? null : "This account is not frozen.";
    case "revokeKyc":
      return state.kycGranted ? null : "This account has no KYC to revoke.";
    case "pause":
      return state.paused ? "This token is already paused." : null;
    case "unpause":
      return state.paused ? null : "This token is not paused.";
    default:
      return null;
  }
}

/** Best-effort pre-check; returns a message when the action is already satisfied. Never throws. */
export async function precheckAdminAction(action: ComplianceAction, account: string | null): Promise<string | null> {
  try {
    const tokenAddress = await readComplianceTokenAddress();
    const tokenInfo = await getTokenInfo(tokenAddress);
    const paused = tokenInfo?.paused ?? false;
    if (action === "pause" || action === "unpause") {
      return alreadyInStateMessage(action, { frozen: false, kycGranted: false, paused });
    }
    if (!account || !tokenInfo) {
      return null;
    }
    const relationship = await getTokenRelationship(account, tokenInfo.tokenId);
    return alreadyInStateMessage(action, { frozen: relationship.frozen, kycGranted: relationship.kycGranted, paused });
  } catch (error) {
    // Best-effort: a mirror/RPC blip must not block the action, but log it so the skipped
    // pre-check is visible in server logs instead of silently changing behaviour.
    console.warn("[compliance] admin pre-check skipped", error);
    return null;
  }
}
