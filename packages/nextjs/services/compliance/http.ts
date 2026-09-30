import { NextResponse } from "next/server";
import { toApiError } from "./errors";

export function jsonOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function jsonError(error: unknown): NextResponse {
  const { status, body } = toApiError(error);
  return NextResponse.json(body, { status });
}
