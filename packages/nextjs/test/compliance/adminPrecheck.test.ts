import { describe, expect, it } from "vitest";
import { alreadyInStateMessage } from "~~/services/compliance/adminPrecheck";

describe("alreadyInStateMessage", () => {
  it("reports an already-frozen account", () => {
    const message = alreadyInStateMessage("freeze", { frozen: true, kycGranted: false, paused: false });
    expect(message).toBe("This account is already frozen.");
  });

  it("returns null when freezing a non-frozen account", () => {
    expect(alreadyInStateMessage("freeze", { frozen: false, kycGranted: false, paused: false })).toBeNull();
  });

  it("reports a non-frozen account on unfreeze", () => {
    expect(alreadyInStateMessage("unfreeze", { frozen: false, kycGranted: false, paused: false })).toBe(
      "This account is not frozen.",
    );
  });

  it("returns null when unfreezing a frozen account", () => {
    expect(alreadyInStateMessage("unfreeze", { frozen: true, kycGranted: false, paused: false })).toBeNull();
  });

  it("reports missing KYC on revoke", () => {
    expect(alreadyInStateMessage("revokeKyc", { frozen: false, kycGranted: false, paused: false })).toBe(
      "This account has no KYC to revoke.",
    );
  });

  it("returns null when revoking granted KYC", () => {
    expect(alreadyInStateMessage("revokeKyc", { frozen: false, kycGranted: true, paused: false })).toBeNull();
  });

  it("reports an already-paused token", () => {
    expect(alreadyInStateMessage("pause", { frozen: false, kycGranted: false, paused: true })).toBe(
      "This token is already paused.",
    );
  });

  it("returns null when pausing an unpaused token", () => {
    expect(alreadyInStateMessage("pause", { frozen: false, kycGranted: false, paused: false })).toBeNull();
  });

  it("reports a non-paused token on unpause", () => {
    expect(alreadyInStateMessage("unpause", { frozen: false, kycGranted: false, paused: false })).toBe(
      "This token is not paused.",
    );
  });

  it("returns null when unpausing a paused token", () => {
    expect(alreadyInStateMessage("unpause", { frozen: false, kycGranted: false, paused: true })).toBeNull();
  });

  it("returns null for actions that are always needed", () => {
    expect(alreadyInStateMessage("grantKyc", { frozen: false, kycGranted: false, paused: false })).toBeNull();
  });

  it("returns non-empty messages for already-satisfied actions", () => {
    const messages = [
      alreadyInStateMessage("freeze", { frozen: true, kycGranted: false, paused: false }),
      alreadyInStateMessage("unfreeze", { frozen: false, kycGranted: false, paused: false }),
      alreadyInStateMessage("revokeKyc", { frozen: false, kycGranted: false, paused: false }),
      alreadyInStateMessage("pause", { frozen: false, kycGranted: false, paused: true }),
      alreadyInStateMessage("unpause", { frozen: false, kycGranted: false, paused: false }),
    ];
    for (const message of messages) {
      expect(typeof message).toBe("string");
      expect(message!.length).toBeGreaterThan(0);
    }
  });
});
