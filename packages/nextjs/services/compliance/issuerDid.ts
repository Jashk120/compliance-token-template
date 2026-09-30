import { getIssuerDid } from "./config";
import {
  type SignatureVerifier,
  type UnsignedCredential,
  hashCredential,
  verifierFromVerificationMethod,
  verifyCredentialSignature,
} from "./credential";
import { CredentialError } from "./errors";
import type { DIDDocument } from "@hiero-did-sdk/core";
import { TopicReaderHederaRestApi, resolveDID } from "@hiero-did-sdk/resolver";
import type { Credential } from "~~/utils/compliance/types";

const ISSUER_KEY_CACHE_TTL_MS = 5 * 60 * 1000;
const issuerKeyCache = new Map<string, { verifier: SignatureVerifier; expiresAt: number }>();

export function clearIssuerKeyCache(): void {
  issuerKeyCache.clear();
}

function resolveReducedModeKey(): SignatureVerifier | undefined {
  const raw = process.env.ISSUER_PUBLIC_KEY?.trim();
  if (!raw) {
    return undefined;
  }
  try {
    return raw.startsWith("z")
      ? verifierFromVerificationMethod({ publicKeyMultibase: raw })
      : verifierFromVerificationMethod({ publicKeyBase58: raw });
  } catch {
    throw new CredentialError("WRONG_ISSUER", "ISSUER_PUBLIC_KEY is not a valid Ed25519 public key");
  }
}

export async function resolveIssuerKey(did: string): Promise<SignatureVerifier> {
  const cached = issuerKeyCache.get(did);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.verifier;
  }

  const reducedModeKey = resolveReducedModeKey();
  if (reducedModeKey) {
    issuerKeyCache.set(did, { verifier: reducedModeKey, expiresAt: Date.now() + ISSUER_KEY_CACHE_TTL_MS });
    return reducedModeKey;
  }

  let document: DIDDocument;
  try {
    document = await resolveDID(did, "application/did+json", { topicReader: new TopicReaderHederaRestApi() });
  } catch {
    throw new CredentialError("WRONG_ISSUER", `Could not resolve issuer DID ${did}`);
  }

  const methods = document.verificationMethod ?? [];
  const method = methods.find(candidate => candidate.id.endsWith("#did-root-key")) ?? methods[0];
  if (!method) {
    throw new CredentialError("WRONG_ISSUER", `Issuer DID ${did} has no verification method`);
  }

  let verifier: SignatureVerifier;
  try {
    verifier = verifierFromVerificationMethod(method);
  } catch {
    throw new CredentialError("WRONG_ISSUER", `Issuer DID ${did} uses an unsupported key type`);
  }

  issuerKeyCache.set(did, { verifier, expiresAt: Date.now() + ISSUER_KEY_CACHE_TTL_MS });
  return verifier;
}

export async function verifyCredential(
  credential: Credential,
  expectedSubject: string,
): Promise<{ credentialHash: string }> {
  const issuerDid = getIssuerDid();

  if (credential.issuer !== issuerDid) {
    throw new CredentialError("WRONG_ISSUER", "Credential was issued by an unknown issuer.");
  }

  const issuedAt = Date.parse(credential.issuedAt);
  const expiresAt = Date.parse(credential.expiresAt);
  if (Number.isNaN(issuedAt) || Number.isNaN(expiresAt)) {
    throw new CredentialError("MALFORMED", "Credential timestamps are not valid dates.");
  }

  const now = Date.now();
  if (now < issuedAt) {
    throw new CredentialError("NOT_YET_VALID", "Credential is not yet valid.");
  }
  if (now >= expiresAt) {
    throw new CredentialError("EXPIRED", "Credential has expired.");
  }

  if (credential.subject.toLowerCase() !== expectedSubject.toLowerCase()) {
    throw new CredentialError("SUBJECT_MISMATCH", "Credential subject does not match the connected address.");
  }

  const { signature, ...unsigned } = credential;
  if (!signature) {
    throw new CredentialError("MALFORMED", "Credential signature is missing.");
  }

  const verifier = await resolveIssuerKey(issuerDid);
  if (!verifyCredentialSignature(unsigned as UnsignedCredential, signature, verifier)) {
    throw new CredentialError("INVALID_SIGNATURE", "Credential signature is invalid.");
  }

  return { credentialHash: hashCredential(unsigned as UnsignedCredential) };
}
