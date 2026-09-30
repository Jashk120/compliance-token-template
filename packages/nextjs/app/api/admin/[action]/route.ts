import { requireAdminAuth } from "~~/services/compliance/auth";
import { runComplianceAction } from "~~/services/compliance/complianceService";
import { requireAdminToken } from "~~/services/compliance/config";
import { ValidationError } from "~~/services/compliance/errors";
import { jsonError, jsonOk } from "~~/services/compliance/http";
import { accountBodySchema } from "~~/services/compliance/schemas";
import { ADMIN_ROUTES } from "~~/utils/compliance/hts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ACTIONS_WITHOUT_ACCOUNT = new Set(["pause", "unpause"]);

export async function POST(request: Request, context: { params: Promise<{ action: string }> }): Promise<Response> {
  try {
    const { action: routeAction } = await context.params;
    const action = ADMIN_ROUTES[routeAction];
    if (!action) {
      throw new ValidationError(`Unknown admin action "${routeAction}"`);
    }

    requireAdminAuth(request, requireAdminToken());

    let account: string | null = null;
    if (!ACTIONS_WITHOUT_ACCOUNT.has(routeAction)) {
      const body = await request.json().catch(() => {
        throw new ValidationError("Request body must be valid JSON");
      });
      const parsed = accountBodySchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError(
          parsed.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("; "),
        );
      }
      account = parsed.data.account;
    }

    const result = await runComplianceAction(action, account);
    return jsonOk(result);
  } catch (error) {
    return jsonError(error);
  }
}
