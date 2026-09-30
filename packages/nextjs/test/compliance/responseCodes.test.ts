import { describe, expect, it } from "vitest";
import { ComplianceActionError, ConfigurationError, ValidationError, toApiError } from "~~/services/compliance/errors";
import { COMPLIANCE_ERROR_CODES, htsCodeToComplianceError } from "~~/utils/compliance/hts";

describe("HTS response code mapping", () => {
  it("maps each known HTS code to a compliance error code", () => {
    expect(htsCodeToComplianceError(184)).toBe(COMPLIANCE_ERROR_CODES.NOT_ASSOCIATED);
    expect(htsCodeToComplianceError(176)).toBe(COMPLIANCE_ERROR_CODES.KYC_NOT_GRANTED);
    expect(htsCodeToComplianceError(165)).toBe(COMPLIANCE_ERROR_CODES.FROZEN);
    expect(htsCodeToComplianceError(265)).toBe(COMPLIANCE_ERROR_CODES.PAUSED);
    expect(htsCodeToComplianceError(999)).toBe(COMPLIANCE_ERROR_CODES.TRANSFER_FAILED);
  });

  it("turns an HTS action error into a 422 API error", () => {
    const { status, body } = toApiError(new ComplianceActionError(184));
    expect(status).toBe(422);
    expect(body.code).toBe(COMPLIANCE_ERROR_CODES.NOT_ASSOCIATED);
    expect(body.message.length).toBeGreaterThan(0);
  });

  it("keeps a descriptive message for unknown HTS codes", () => {
    const { status, body } = toApiError(new ComplianceActionError(0, "revert reason"));
    expect(status).toBe(422);
    expect(body).toEqual({ code: "COMPLIANCE_ACTION_FAILED", message: "revert reason" });
  });

  it("maps configuration and validation errors to 500 and 400", () => {
    expect(toApiError(new ConfigurationError(["HEDERA_OPERATOR_ID"])).status).toBe(500);
    expect(toApiError(new ValidationError("bad input"))).toMatchObject({
      status: 400,
      body: { code: "VALIDATION_ERROR" },
    });
  });
});
