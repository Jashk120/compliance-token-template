import { CredentialError } from "./errors";
import { KeysUtility } from "@hiero-did-sdk/core";
import { createHash } from "node:crypto";
import { canonicalJson } from "~~/utils/compliance/canonical";
import type { Credential } from "~~/utils/compliance/types";

export type UnsignedCredential = Omit<Credential, "signature">;

export type MessageSigner = {
  sign(message: Uint8Array): Uint8Array;
};

export type SignatureVerifier = {
  verify(message: Uint8Array, signature: Uint8Array): boolean;
};

export function signingBytes(unsigned: UnsignedCredential): Uint8Array {
  return new TextEncoder().encode(canonicalJson(unsigned));
}

export function hashCredential(unsigned: UnsignedCredential): string {
  return createHash("sha256").update(signingBytes(unsigned)).digest("hex");
}

export function signCredential(unsigned: UnsignedCredential, signer: MessageSigner): Credential {
  const signature = Buffer.from(signer.sign(signingBytes(unsigned))).toString("base64");
  return { ...unsigned, signature };
}

export function verifyCredentialSignature(
  unsigned: UnsignedCredential,
  signatureBase64: string,
  verifier: SignatureVerifier,
): boolean {
  const signature = Buffer.from(signatureBase64, "base64");
  if (signature.length === 0) {
    return false;
  }
  return verifier.verify(signingBytes(unsigned), signature);
}

export function verifierFromVerificationMethod(method: {
  publicKeyMultibase?: string;
  publicKeyBase58?: string;
}): SignatureVerifier {
  if (method.publicKeyMultibase) {
    return KeysUtility.fromMultibase(method.publicKeyMultibase).toPublicKey();
  }
  if (method.publicKeyBase58) {
    return KeysUtility.fromBase58(method.publicKeyBase58).toPublicKey();
  }
  throw new CredentialError("WRONG_ISSUER", "The issuer DID uses an unsupported verification method.");
}
