export const HTS_ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN = 176;
export const HTS_ACCOUNT_FROZEN_FOR_TOKEN = 165;
export const HTS_TOKEN_IS_PAUSED = 265;
export const HTS_TOKEN_NOT_ASSOCIATED_TO_ACCOUNT = 184;

export const COMPLIANCE_ACTIONS = ["grantKyc", "revokeKyc", "freeze", "unfreeze", "pause", "unpause"] as const;

export type ComplianceAction = (typeof COMPLIANCE_ACTIONS)[number];

export const ADMIN_ROUTES: Record<string, ComplianceAction> = {
  "revoke-kyc": "revokeKyc",
  freeze: "freeze",
  unfreeze: "unfreeze",
  pause: "pause",
  unpause: "unpause",
};

export const COMPLIANCE_ERROR_CODES = {
  NOT_ASSOCIATED: "NOT_ASSOCIATED",
  KYC_NOT_GRANTED: "KYC_NOT_GRANTED",
  FROZEN: "FROZEN",
  PAUSED: "PAUSED",
  OVER_CAP: "OVER_CAP",
  STALE_PRICE: "STALE_PRICE",
  TRANSFER_FAILED: "TRANSFER_FAILED",
} as const;

export type ComplianceErrorCode = (typeof COMPLIANCE_ERROR_CODES)[keyof typeof COMPLIANCE_ERROR_CODES];

export function htsCodeToComplianceError(code: number): ComplianceErrorCode {
  switch (code) {
    case HTS_TOKEN_NOT_ASSOCIATED_TO_ACCOUNT:
      return COMPLIANCE_ERROR_CODES.NOT_ASSOCIATED;
    case HTS_ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN:
      return COMPLIANCE_ERROR_CODES.KYC_NOT_GRANTED;
    case HTS_ACCOUNT_FROZEN_FOR_TOKEN:
      return COMPLIANCE_ERROR_CODES.FROZEN;
    case HTS_TOKEN_IS_PAUSED:
      return COMPLIANCE_ERROR_CODES.PAUSED;
    default:
      return COMPLIANCE_ERROR_CODES.TRANSFER_FAILED;
  }
}

export function complianceErrorMessage(code: ComplianceErrorCode): string {
  switch (code) {
    case COMPLIANCE_ERROR_CODES.NOT_ASSOCIATED:
      return "This account is not associated with the token. Associate it before transacting.";
    case COMPLIANCE_ERROR_CODES.KYC_NOT_GRANTED:
      return "This account has not been granted KYC. Submit a verified credential first.";
    case COMPLIANCE_ERROR_CODES.FROZEN:
      return "This account is frozen for the token. Ask a compliance officer to unfreeze it.";
    case COMPLIANCE_ERROR_CODES.PAUSED:
      return "The token is paused. All transfers are disabled until it is unpaused.";
    case COMPLIANCE_ERROR_CODES.OVER_CAP:
      return "This purchase would exceed the per-investor USD cap.";
    case COMPLIANCE_ERROR_CODES.STALE_PRICE:
      return "The oracle price is stale. Buying is disabled until the feed updates.";
    case COMPLIANCE_ERROR_CODES.TRANSFER_FAILED:
      return "The token transfer failed inside the Hedera Token Service.";
    default:
      return "The operation failed.";
  }
}
