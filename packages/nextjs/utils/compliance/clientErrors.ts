import { ApiRequestError } from "./api";
import { getParsedError } from "~~/utils/scaffold-hbar";

const REVERT_REASONS: Record<string, string> = {
  KycNotGranted: "This account has not been granted KYC.",
  Frozen: "This account is frozen for the token.",
  Paused: "The token is paused.",
  NotAssociated: "This account is not associated with the token.",
  PerInvestorCapExceeded: "This purchase would exceed the per-investor USD cap.",
  StalePrice: "The oracle price is stale, so buying is disabled.",
  InvalidPrice: "The oracle returned an invalid price.",
  IncompleteRound: "The oracle round is incomplete.",
  ZeroTokenAmount: "The HBAR amount is too small to buy a whole token.",
  TransferFailed: "The token transfer failed inside the Hedera Token Service.",
  ReentrancyGuardReentrantCall: "The transaction was rejected by the reentrancy guard.",
  AccessControlUnauthorizedAccount: "The connected account is not authorised for this action.",
};

function revertName(error: unknown): string | undefined {
  const walked = (error as { walk?: () => unknown }).walk?.() ?? error;
  const data = (walked as { data?: { errorName?: string } }).data;
  return data?.errorName;
}

export function describeError(error: unknown): string {
  if (error instanceof ApiRequestError) {
    return error.message;
  }
  const name = revertName(error);
  if (name && REVERT_REASONS[name]) {
    return REVERT_REASONS[name];
  }
  return getParsedError(error);
}
