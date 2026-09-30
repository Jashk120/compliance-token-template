import { describe, expect, it } from "vitest";
import { verifyBearerToken } from "~~/services/compliance/auth";

describe("admin guard", () => {
  const token = "s3cret-token";

  it("accepts a matching Bearer token", () => {
    expect(verifyBearerToken(`Bearer ${token}`, token)).toBe(true);
  });

  it("rejects a wrong token", () => {
    expect(verifyBearerToken("Bearer nope", token)).toBe(false);
  });

  it("rejects a missing or malformed header", () => {
    expect(verifyBearerToken(undefined, token)).toBe(false);
    expect(verifyBearerToken("", token)).toBe(false);
    expect(verifyBearerToken(token, token)).toBe(false);
  });

  it("rejects when no token is configured", () => {
    expect(verifyBearerToken(`Bearer ${token}`, "")).toBe(false);
  });
});
