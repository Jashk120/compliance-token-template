import { complianceErrorMessage, htsCodeToComplianceError } from "~~/utils/compliance/hts";
import type { ApiError } from "~~/utils/compliance/types";

export class ConfigurationError extends Error {
  readonly missing: string[];
  constructor(missing: string[]) {
    super(`Missing configuration: ${missing.join(", ")}`);
    this.name = "ConfigurationError";
    this.missing = missing;
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export type CredentialFailure =
  | "MALFORMED"
  | "WRONG_ISSUER"
  | "INVALID_SIGNATURE"
  | "EXPIRED"
  | "NOT_YET_VALID"
  | "SUBJECT_MISMATCH";

export class CredentialError extends Error {
  readonly reason: CredentialFailure;
  constructor(reason: CredentialFailure, message: string) {
    super(message);
    this.name = "CredentialError";
    this.reason = reason;
  }
}

export class UnauthorizedError extends Error {
  constructor(message = "Missing or invalid admin token") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ComplianceActionError extends Error {
  readonly htsCode: number;
  constructor(htsCode: number, message?: string) {
    super(message ?? `HTS returned response code ${htsCode}`);
    this.name = "ComplianceActionError";
    this.htsCode = htsCode;
  }
}

export function describeSdkError(error: unknown): string {
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

export class UpstreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UpstreamError";
  }
}

const CREDENTIAL_HTTP: Record<CredentialFailure, { status: number; code: string; message: string }> = {
  MALFORMED: { status: 400, code: "CREDENTIAL_MALFORMED", message: "The credential is malformed." },
  WRONG_ISSUER: {
    status: 403,
    code: "CREDENTIAL_WRONG_ISSUER",
    message: "The credential was issued by an unknown issuer.",
  },
  INVALID_SIGNATURE: {
    status: 401,
    code: "CREDENTIAL_INVALID_SIGNATURE",
    message: "The credential signature is invalid.",
  },
  EXPIRED: { status: 401, code: "CREDENTIAL_EXPIRED", message: "The credential has expired." },
  NOT_YET_VALID: { status: 401, code: "CREDENTIAL_NOT_YET_VALID", message: "The credential is not yet valid." },
  SUBJECT_MISMATCH: {
    status: 403,
    code: "CREDENTIAL_SUBJECT_MISMATCH",
    message: "The credential subject does not match the connected address.",
  },
};

export function toApiError(error: unknown): { status: number; body: ApiError } {
  if (error instanceof ConfigurationError) {
    return { status: 500, body: { code: "CONFIGURATION_ERROR", message: error.message } };
  }
  if (error instanceof ValidationError) {
    return { status: 400, body: { code: "VALIDATION_ERROR", message: error.message } };
  }
  if (error instanceof UnauthorizedError) {
    return { status: 401, body: { code: "UNAUTHORIZED", message: error.message } };
  }
  if (error instanceof CredentialError) {
    const mapped = CREDENTIAL_HTTP[error.reason];
    return { status: mapped.status, body: { code: mapped.code, message: mapped.message } };
  }
  if (error instanceof ComplianceActionError) {
    if (error.htsCode > 0) {
      const code = htsCodeToComplianceError(error.htsCode);
      return { status: 422, body: { code, message: complianceErrorMessage(code) } };
    }
    return { status: 422, body: { code: "COMPLIANCE_ACTION_FAILED", message: error.message } };
  }
  if (error instanceof UpstreamError) {
    return { status: 502, body: { code: "UPSTREAM_ERROR", message: error.message } };
  }
  console.error("[compliance] unhandled error", error);
  return { status: 500, body: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." } };
}
