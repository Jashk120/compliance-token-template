import { UnauthorizedError } from "./errors";
import { timingSafeEqual } from "node:crypto";

export function verifyBearerToken(headerValue: string | null | undefined, expectedToken: string): boolean {
  if (!headerValue || expectedToken.length === 0) {
    return false;
  }
  const [scheme, token = ""] = headerValue.split(" ");
  if (scheme !== "Bearer") {
    return false;
  }
  const provided = Buffer.from(token);
  const expected = Buffer.from(expectedToken);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export function requireAdminAuth(request: Request, expectedToken: string): void {
  if (!verifyBearerToken(request.headers.get("authorization"), expectedToken)) {
    throw new UnauthorizedError();
  }
}
