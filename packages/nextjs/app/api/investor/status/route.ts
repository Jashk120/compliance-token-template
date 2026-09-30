import { getPublicConfig } from "~~/services/compliance/config";
import { ValidationError } from "~~/services/compliance/errors";
import { jsonError, jsonOk } from "~~/services/compliance/http";
import { getInvestorStatus } from "~~/services/compliance/investorStatus";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export async function GET(request: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get("address");
    if (!address || !EVM_ADDRESS_RE.test(address)) {
      throw new ValidationError("A valid ?address=0x... query parameter is required");
    }

    const config = getPublicConfig();
    if (!config.configured) {
      return jsonOk({ configured: false, missing: config.missing, status: null });
    }

    const status = await getInvestorStatus(address);
    return jsonOk({ configured: true, missing: [], status });
  } catch (error) {
    return jsonError(error);
  }
}
