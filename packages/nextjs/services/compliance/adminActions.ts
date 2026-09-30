import { precheckAdminAction } from "./adminPrecheck";
import { alreadyInStateResult, runComplianceAction } from "./complianceService";
import type { ComplianceActionResult } from "./complianceService";
import { ValidationError } from "./errors";
import { accountBodySchema } from "./schemas";
import { ADMIN_ROUTES } from "~~/utils/compliance/hts";

export const ACTIONS_WITHOUT_ACCOUNT = new Set(["pause", "unpause"]);

export type AdminActionResult =
  | { ok: true; result: ComplianceActionResult }
  | { ok: false; code: string; message: string };

/** Single entry point for the admin actions, shared by the HTTP route and the Server Action. */
export async function runAdminActionCore(routeAction: string, account: string | null): Promise<ComplianceActionResult> {
  const action = ADMIN_ROUTES[routeAction];
  if (!action) {
    throw new ValidationError(`Unknown admin action "${routeAction}"`);
  }

  let target: string | null = null;
  if (!ACTIONS_WITHOUT_ACCOUNT.has(routeAction)) {
    const parsed = accountBodySchema.safeParse({ account });
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("; "),
      );
    }
    target = parsed.data.account;
  }

  const message = await precheckAdminAction(action, target);
  if (message) {
    return alreadyInStateResult(action, target, message);
  }
  return runComplianceAction(action, target);
}
