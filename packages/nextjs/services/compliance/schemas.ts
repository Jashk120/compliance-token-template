import { z } from "zod";
import { COMPLIANCE_ACTIONS } from "~~/utils/compliance/hts";

export const evmAddressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "Invalid EVM address");

const timestampSchema = z.string().refine(value => !Number.isNaN(Date.parse(value)), "Invalid timestamp");

export const credentialSchema = z
  .object({
    subject: evmAddressSchema,
    issuer: z.string().min(1),
    issuedAt: timestampSchema,
    expiresAt: timestampSchema,
    claims: z.object({ kycLevel: z.number().int().min(0) }).strict(),
    signature: z.string().min(1),
  })
  .strict();

export const kycRequestBodySchema = z
  .object({
    address: evmAddressSchema,
    credential: credentialSchema,
  })
  .strict();

export const accountBodySchema = z
  .object({
    account: evmAddressSchema,
  })
  .strict();

export const auditMessageSchema = z
  .object({
    action: z.enum(COMPLIANCE_ACTIONS),
    account: z.string().min(1),
    operator: z.string().min(1),
    txId: z.string().min(1),
    timestamp: z.string().min(1),
    credentialHash: z.string().min(1).optional(),
  })
  .strict();
