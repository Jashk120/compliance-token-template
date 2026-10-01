import { mirrorBaseFor } from "~~/services/compliance/config";
import { UpstreamError, ValidationError } from "~~/services/compliance/errors";
import { jsonError, jsonOk } from "~~/services/compliance/http";
import { fetchUpstream } from "~~/services/compliance/upstream";

const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const evm = searchParams.get("evm");
  const network = searchParams.get("network") === "mainnet" ? "mainnet" : "testnet";

  if (!evm || !EVM_ADDRESS_RE.test(evm)) {
    return jsonError(new ValidationError("A valid ?evm=0x... query parameter is required"));
  }

  try {
    const response = await fetchUpstream(`${mirrorBaseFor(network)}/api/v1/accounts/${evm}`, { cache: "no-store" });
    if (response.status === 404) {
      return jsonOk({ accountId: null });
    }
    if (!response.ok) {
      throw new UpstreamError(`Mirror node request failed (${response.status})`);
    }
    const data = (await response.json()) as { account?: string };
    const accountId = typeof data.account === "string" ? data.account : null;
    return jsonOk({ accountId });
  } catch (error) {
    return jsonError(error);
  }
}
