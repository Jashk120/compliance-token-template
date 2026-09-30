import { getServerConfig } from "./config";
import { UpstreamError } from "./errors";

async function mirrorGet<T>(path: string): Promise<T | null> {
  const { mirrorBaseUrl } = getServerConfig();
  const response = await fetch(`${mirrorBaseUrl}${path}`, { cache: "no-store" });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new UpstreamError(`Mirror node request failed (${response.status})`);
  }
  return (await response.json()) as T;
}

export async function getAccountIdByEvm(evm: string): Promise<string | null> {
  const body = await mirrorGet<{ account?: string }>(`/api/v1/accounts/${evm}`);
  return body?.account ?? null;
}

export async function getTokenInfo(
  tokenAddress: string,
): Promise<{ tokenId: string; paused: boolean; name: string; symbol: string } | null> {
  const body = await mirrorGet<{ token_id?: string; paused?: boolean; name?: string; symbol?: string }>(
    `/api/v1/tokens/${tokenAddress}`,
  );
  if (!body?.token_id) {
    return null;
  }
  return { tokenId: body.token_id, paused: Boolean(body.paused), name: body.name ?? "", symbol: body.symbol ?? "" };
}

export async function getTokenRelationship(
  evm: string,
  tokenId: string,
): Promise<{ associated: boolean; kycGranted: boolean; frozen: boolean }> {
  const body = await mirrorGet<{
    tokens?: { token_id: string; kyc_status?: string | null; frozen?: boolean }[];
  }>(`/api/v1/accounts/${evm}/tokens?token.id=${encodeURIComponent(tokenId)}&limit=1`);
  const token = body?.tokens?.[0];
  if (!token) {
    return { associated: false, kycGranted: false, frozen: false };
  }
  return { associated: true, kycGranted: token.kyc_status === "GRANTED", frozen: Boolean(token.frozen) };
}
