import { grantKyc } from "~~/services/compliance/complianceService";
import { ValidationError } from "~~/services/compliance/errors";
import { jsonError, jsonOk } from "~~/services/compliance/http";
import { verifyCredential } from "~~/services/compliance/issuerDid";
import { kycRequestBodySchema } from "~~/services/compliance/schemas";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json().catch(() => {
      throw new ValidationError("Request body must be valid JSON");
    });
    const parsed = kycRequestBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("; "),
      );
    }

    const { address, credential } = parsed.data;
    const { credentialHash } = await verifyCredential(credential, address);
    const result = await grantKyc(address, credentialHash);

    return jsonOk({ ...result, credentialHash });
  } catch (error) {
    return jsonError(error);
  }
}
