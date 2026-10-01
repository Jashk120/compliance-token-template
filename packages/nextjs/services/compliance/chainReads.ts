import { getServerConfig } from "./config";
import { UpstreamError } from "./errors";
import { fetchUpstream } from "./upstream";
import { decodeFunctionResult, encodeFunctionData } from "viem";
import { complianceTokenAbi, tokenSaleAbi } from "~~/utils/compliance/abis";

const encode = encodeFunctionData as unknown as (args: {
  abi: unknown;
  functionName: string;
  args?: readonly unknown[];
}) => `0x${string}`;

const decode = decodeFunctionResult as unknown as (args: {
  abi: unknown;
  functionName: string;
  data: `0x${string}`;
}) => unknown;

async function ethCall(
  rpcUrl: string,
  to: string,
  abi: readonly unknown[],
  functionName: string,
  args: readonly unknown[] = [],
): Promise<unknown> {
  const data = encode({ abi, functionName, args });
  const response = await fetchUpstream(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to, data }, "latest"],
    }),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new UpstreamError(`RPC request failed (${response.status})`);
  }
  const body = (await response.json()) as { result?: `0x${string}`; error?: { message?: string } };
  if (body.error || !body.result) {
    throw new UpstreamError(body.error?.message ?? "RPC eth_call returned no result");
  }
  return decode({ abi, functionName, data: body.result });
}

export async function readComplianceTokenAddress(): Promise<string> {
  const { rpcUrl, complianceTokenAddress } = getServerConfig();
  return (await ethCall(rpcUrl, complianceTokenAddress, complianceTokenAbi, "tokenAddress")) as string;
}

export type SaleState = {
  capUsd8: bigint;
  spentUsd8: bigint;
  tokenPriceUsd8: bigint;
  tokenUnit: bigint;
};

export async function readSaleState(investor: string): Promise<SaleState> {
  const { rpcUrl, tokenSaleAddress } = getServerConfig();
  const [capUsd8, spentUsd8, tokenPriceUsd8, tokenUnit] = await Promise.all([
    ethCall(rpcUrl, tokenSaleAddress, tokenSaleAbi, "perInvestorCapUsd"),
    ethCall(rpcUrl, tokenSaleAddress, tokenSaleAbi, "usdSpent", [investor]),
    ethCall(rpcUrl, tokenSaleAddress, tokenSaleAbi, "tokenPriceUsd"),
    ethCall(rpcUrl, tokenSaleAddress, tokenSaleAbi, "tokenUnit"),
  ]);
  return {
    capUsd8: capUsd8 as bigint,
    spentUsd8: spentUsd8 as bigint,
    tokenPriceUsd8: tokenPriceUsd8 as bigint,
    tokenUnit: tokenUnit as bigint,
  };
}
