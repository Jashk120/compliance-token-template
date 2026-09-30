import { KeysUtility } from "@hiero-did-sdk/core";
import { PrivateKey } from "@hiero-ledger/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { signCredential } from "~~/services/compliance/credential";
import { clearIssuerKeyCache, verifyCredential } from "~~/services/compliance/issuerDid";
import type { Credential } from "~~/utils/compliance/types";

const resolveDIDMock = vi.fn();

vi.mock("@hiero-did-sdk/resolver", () => ({
  resolveDID: (...args: unknown[]) => resolveDIDMock(...args),
  TopicReaderHederaRestApi: class {
    fetchAllToDate = vi.fn();
  },
}));

const ISSUER_DID = "did:hedera:testnet:zTestIssuer_0.0.1234";
const SUBJECT = "0x1111111111111111111111111111111111111111";
const OTHER_ADDRESS = "0x2222222222222222222222222222222222222222";

function didDocumentFor(did: string, multibase: string) {
  return {
    id: did,
    controller: did,
    verificationMethod: [
      {
        id: `${did}#did-root-key`,
        type: "Ed25519VerificationKey2020",
        controller: did,
        publicKeyMultibase: multibase,
      },
    ],
  };
}

describe("verifyCredential", () => {
  const issuerKey = PrivateKey.generateED25519();
  const multibase = KeysUtility.fromBytes(issuerKey.publicKey.toBytes()).toMultibase();

  beforeEach(() => {
    clearIssuerKeyCache();
    resolveDIDMock.mockReset();
    resolveDIDMock.mockResolvedValue(didDocumentFor(ISSUER_DID, multibase));
    process.env.ISSUER_DID = ISSUER_DID;
    delete process.env.ISSUER_PUBLIC_KEY;
  });

  function unsignedCredential(overrides: Partial<Omit<Credential, "signature">> = {}) {
    const now = Date.now();
    return {
      subject: SUBJECT,
      issuer: ISSUER_DID,
      issuedAt: new Date(now - 60_000).toISOString(),
      expiresAt: new Date(now + 86_400_000).toISOString(),
      claims: { kycLevel: 1 },
      ...overrides,
    };
  }

  it("accepts a valid credential and returns its hash", async () => {
    const credential = signCredential(unsignedCredential(), issuerKey);
    const result = await verifyCredential(credential, SUBJECT);
    expect(result.credentialHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects a tampered credential", async () => {
    const credential = signCredential(unsignedCredential(), issuerKey);
    const tampered = { ...credential, claims: { kycLevel: 9 } };
    await expect(verifyCredential(tampered, SUBJECT)).rejects.toMatchObject({ reason: "INVALID_SIGNATURE" });
  });

  it("rejects an expired credential", async () => {
    const now = Date.now();
    const credential = signCredential(
      unsignedCredential({
        issuedAt: new Date(now - 172_800_000).toISOString(),
        expiresAt: new Date(now - 60_000).toISOString(),
      }),
      issuerKey,
    );
    await expect(verifyCredential(credential, SUBJECT)).rejects.toMatchObject({ reason: "EXPIRED" });
  });

  it("rejects a credential from the wrong issuer without resolving", async () => {
    const credential = signCredential(
      unsignedCredential({ issuer: "did:hedera:testnet:zSomeoneElse_0.0.9" }),
      issuerKey,
    );
    await expect(verifyCredential(credential, SUBJECT)).rejects.toMatchObject({ reason: "WRONG_ISSUER" });
    expect(resolveDIDMock).not.toHaveBeenCalled();
  });

  it("rejects a credential for a different subject", async () => {
    const credential = signCredential(unsignedCredential(), issuerKey);
    await expect(verifyCredential(credential, OTHER_ADDRESS)).rejects.toMatchObject({ reason: "SUBJECT_MISMATCH" });
  });

  it("supports the documented reduced mode without a resolver call", async () => {
    process.env.ISSUER_PUBLIC_KEY = multibase;
    clearIssuerKeyCache();
    const credential = signCredential(unsignedCredential(), issuerKey);
    const result = await verifyCredential(credential, SUBJECT);
    expect(result.credentialHash).toMatch(/^[0-9a-f]{64}$/);
    expect(resolveDIDMock).not.toHaveBeenCalled();
  });
});
