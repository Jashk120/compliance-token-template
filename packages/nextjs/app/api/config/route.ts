import { getPublicConfig } from "~~/services/compliance/config";
import { jsonOk } from "~~/services/compliance/http";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return jsonOk(getPublicConfig());
}
