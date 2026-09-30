import { fetchAuditEntries } from "~~/services/compliance/auditLog";
import { ValidationError } from "~~/services/compliance/errors";
import { jsonError, jsonOk } from "~~/services/compliance/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get("limit");
    const afterParam = searchParams.get("after");

    const limit = limitParam === null ? 25 : Number(limitParam);
    if (!Number.isFinite(limit) || limit < 1) {
      throw new ValidationError("limit must be a positive number");
    }

    let after: number | undefined;
    if (afterParam !== null) {
      after = Number(afterParam);
      if (!Number.isFinite(after) || after < 0) {
        throw new ValidationError("after must be a non-negative number");
      }
    }

    const result = await fetchAuditEntries({ limit, after });
    return jsonOk(result);
  } catch (error) {
    return jsonError(error);
  }
}
