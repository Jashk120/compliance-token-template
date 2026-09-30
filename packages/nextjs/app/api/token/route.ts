import { readComplianceTokenAddress } from "~~/services/compliance/chainReads";
import { jsonError, jsonOk } from "~~/services/compliance/http";
import { getTokenInfo } from "~~/services/compliance/mirror";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  try {
    const tokenAddress = await readComplianceTokenAddress();
    const info = await getTokenInfo(tokenAddress);
    return jsonOk({
      tokenAddress,
      tokenId: info?.tokenId ?? null,
      paused: info?.paused ?? false,
      name: info?.name ?? null,
      symbol: info?.symbol ?? null,
    });
  } catch (error) {
    return jsonError(error);
  }
}
