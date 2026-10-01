"use server";

import { runAdminActionCore } from "~~/services/compliance/adminActions";
import type { AdminActionResult } from "~~/services/compliance/adminActions";
import { toApiError } from "~~/services/compliance/errors";

// Security: runs with the server-side ADMIN_API_TOKEN, so the token is never sent to the browser.
// Errors are returned, not thrown, because thrown Server Action errors lose their message in production.
export async function runAdminActionServer(routeAction: string, account: string | null): Promise<AdminActionResult> {
  try {
    return { ok: true, result: await runAdminActionCore(routeAction, account) };
  } catch (error) {
    const { status, body } = toApiError(error);
    return { ok: false, status, code: body.code, message: body.message };
  }
}
