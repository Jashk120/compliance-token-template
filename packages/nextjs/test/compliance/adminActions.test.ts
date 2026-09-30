import { describe, expect, it } from "vitest";
import { runAdminActionServer } from "~~/app/admin/actions";
import { runAdminActionCore } from "~~/services/compliance/adminActions";
import { ValidationError } from "~~/services/compliance/errors";

describe("runAdminActionCore", () => {
  it("rejects an unknown admin action before touching the network", async () => {
    await expect(runAdminActionCore("bogus", null)).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a missing account for an account-scoped action", async () => {
    await expect(runAdminActionCore("freeze", null)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("runAdminActionServer", () => {
  it("returns a serializable error instead of throwing for an unknown action", async () => {
    await expect(runAdminActionServer("bogus", null)).resolves.toMatchObject({
      ok: false,
      code: "VALIDATION_ERROR",
    });
  });
});
