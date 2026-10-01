import { describe, expect, it } from "vitest";
import { verifierFromVerificationMethod } from "~~/services/compliance/credential";
import { CredentialError } from "~~/services/compliance/errors";

describe("verifierFromVerificationMethod", () => {
  it("throws a typed credential error for an unsupported verification method", () => {
    try {
      verifierFromVerificationMethod({});
      throw new Error("expected verifierFromVerificationMethod to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(CredentialError);
      expect(error).toMatchObject({ reason: "WRONG_ISSUER" });
    }
  });
});
