import { ACTIONS_WITHOUT_ACCOUNT, runAdminActionCore } from "~~/services/compliance/adminActions";
import { requireAdminAuth } from "~~/services/compliance/auth";
import { requireAdminToken } from "~~/services/compliance/config";
import { ValidationError } from "~~/services/compliance/errors";
import { jsonError, jsonOk } from "~~/services/compliance/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ action: string }> }): Promise<Response> {
  try {
    const { action } = await context.params;
    requireAdminAuth(request, requireAdminToken());

    let account: string | null = null;
    if (!ACTIONS_WITHOUT_ACCOUNT.has(action)) {
      const body = await request.json().catch(() => {
        throw new ValidationError("Request body must be valid JSON");
      });
      account = (body as { account?: string }).account ?? null;
    }

    return jsonOk(await runAdminActionCore(action, account));
  } catch (error) {
    return jsonError(error);
  }
}
