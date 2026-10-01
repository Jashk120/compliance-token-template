import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getServerConfig } from "~~/services/compliance/config";

function configureEnv(): void {
  process.env.HEDERA_NETWORK = "testnet";
  process.env.HEDERA_OPERATOR_ID = "0.0.111";
  process.env.HEDERA_OPERATOR_PRIVATE_KEY = "operator-key";
  process.env.ISSUER_DID = "did:hedera:testnet:zIssuer_0.0.1234";
  process.env.AUDIT_TOPIC_ID = "0.0.1234";
  process.env.COMPLIANCE_TOKEN_ADDRESS = "0x1111111111111111111111111111111111111111";
  process.env.TOKEN_SALE_ADDRESS = "0x2222222222222222222222222222222222222222";
}

describe("getServerConfig atomic audit flag", () => {
  beforeEach(() => {
    configureEnv();
    delete process.env.HEDERA_ATOMIC_AUDIT;
  });

  afterEach(() => {
    delete process.env.HEDERA_ATOMIC_AUDIT;
  });

  it("defaults to atomic audit enabled", () => {
    expect(getServerConfig().atomicAudit).toBe(true);
  });

  it("disables atomic audit for false, 0, no and off", () => {
    for (const value of ["false", "0", "no", "off", "FALSE"]) {
      process.env.HEDERA_ATOMIC_AUDIT = value;
      expect(getServerConfig().atomicAudit).toBe(false);
    }
  });

  it("keeps atomic audit enabled for other values", () => {
    process.env.HEDERA_ATOMIC_AUDIT = "true";
    expect(getServerConfig().atomicAudit).toBe(true);
  });
});
