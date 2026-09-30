import { readComplianceTokenAddress, readSaleState } from "./chainReads";
import { getAccountIdByEvm, getTokenInfo, getTokenRelationship } from "./mirror";
import type { InvestorStatus } from "~~/utils/compliance/types";

export async function getInvestorStatus(evm: string): Promise<InvestorStatus> {
  const tokenAddress = await readComplianceTokenAddress();
  const [hederaAccountId, tokenInfo, sale] = await Promise.all([
    getAccountIdByEvm(evm),
    getTokenInfo(tokenAddress),
    readSaleState(evm),
  ]);

  const relationship = tokenInfo
    ? await getTokenRelationship(evm, tokenInfo.tokenId)
    : { associated: false, kycGranted: false, frozen: false };

  return {
    evmAddress: evm,
    hederaAccountId,
    associated: relationship.associated,
    kycGranted: relationship.kycGranted,
    frozen: relationship.frozen,
    tokenId: tokenInfo?.tokenId ?? null,
    tokenAddress,
    paused: tokenInfo?.paused ?? false,
    capUsd8: sale.capUsd8.toString(),
    spentUsd8: sale.spentUsd8.toString(),
    tokenPriceUsd8: sale.tokenPriceUsd8.toString(),
    tokenUnit: sale.tokenUnit.toString(),
  };
}
