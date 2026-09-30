"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { parseEther } from "viem";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { StatusBadge } from "~~/components/compliance/StatusBadge";
import { HTS_PRECOMPILE_ADDRESS, aggregatorAbi, htsAbi, tokenSaleAbi } from "~~/utils/compliance/abis";
import { fetchInvestorStatus, submitCredential } from "~~/utils/compliance/api";
import { describeError } from "~~/utils/compliance/clientErrors";
import { formatUsd8, hbarToUsd8, shortAddress } from "~~/utils/compliance/format";
import type { Credential, InvestorStatus, PublicConfig } from "~~/utils/compliance/types";
import { notification } from "~~/utils/scaffold-hbar";

type Props = { config: PublicConfig };

export function InvestorClient({ config }: Props) {
  const { address, isConnected } = useAccount();
  const saleAddress = config.tokenSaleAddress as `0x${string}`;

  const [status, setStatus] = useState<InvestorStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [credentialText, setCredentialText] = useState("");
  const [hbarInput, setHbarInput] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const { writeContractAsync, isPending } = useWriteContract();

  const { data: feedAddress } = useReadContract({
    address: saleAddress,
    abi: tokenSaleAbi,
    functionName: "priceFeed",
    chainId: config.chainId,
  });
  const { data: maxStaleness } = useReadContract({
    address: saleAddress,
    abi: tokenSaleAbi,
    functionName: "maxStaleness",
    chainId: config.chainId,
  });
  const { data: feedDecimals } = useReadContract({
    address: feedAddress,
    abi: aggregatorAbi,
    functionName: "decimals",
    chainId: config.chainId,
    query: { enabled: Boolean(feedAddress) },
  });
  const { data: roundData } = useReadContract({
    address: feedAddress,
    abi: aggregatorAbi,
    functionName: "latestRoundData",
    chainId: config.chainId,
    query: { enabled: Boolean(feedAddress) },
  });

  const refreshStatus = useCallback(async () => {
    if (!address) {
      setStatus(null);
      setStatusError(null);
      return;
    }
    try {
      const result = await fetchInvestorStatus(address);
      setStatus(result.status);
      setStatusError(null);
    } catch (error) {
      setStatusError(describeError(error));
    }
  }, [address]);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const price8 = useMemo(() => {
    if (!roundData) {
      return undefined;
    }
    const answer = roundData[1];
    if (answer <= 0n) {
      return undefined;
    }
    const decimals = Number(feedDecimals ?? 8);
    if (decimals === 8) {
      return answer;
    }
    return decimals < 8 ? answer * 10n ** BigInt(8 - decimals) : answer / 10n ** BigInt(decimals - 8);
  }, [roundData, feedDecimals]);

  const isStale = useMemo(() => {
    if (!roundData || maxStaleness === undefined) {
      return false;
    }
    const updatedAtMs = Number(roundData[3]) * 1000;
    return Date.now() - updatedAtMs > Number(maxStaleness) * 1000;
  }, [roundData, maxStaleness]);

  const estimateUsd8 = useMemo(() => {
    if (!price8) {
      return undefined;
    }
    try {
      const value = parseEther(hbarInput || "0");
      return value > 0n ? hbarToUsd8(value, price8) : undefined;
    } catch {
      return undefined;
    }
  }, [hbarInput, price8]);

  const capRemaining8 = useMemo(() => {
    if (!status?.capUsd8 || !status?.spentUsd8) {
      return undefined;
    }
    return BigInt(status.capUsd8) - BigInt(status.spentUsd8);
  }, [status]);

  const canBuy = Boolean(status?.associated && status?.kycGranted && !status?.frozen && !status?.paused);

  async function onAssociate() {
    if (!address || !status?.tokenAddress) {
      return;
    }
    setBusy("associate");
    try {
      const hash = await writeContractAsync({
        address: HTS_PRECOMPILE_ADDRESS,
        abi: htsAbi,
        functionName: "associateToken",
        args: [address, status.tokenAddress as `0x${string}`],
      });
      notification.success(`Association submitted (${shortAddress(hash)})`);
      await refreshStatus();
    } catch (error) {
      notification.error(describeError(error));
    } finally {
      setBusy(null);
    }
  }

  async function onSubmitCredential() {
    if (!address) {
      return;
    }
    let credential: Credential;
    try {
      credential = JSON.parse(credentialText) as Credential;
    } catch {
      notification.error("The credential must be valid JSON.");
      return;
    }
    setBusy("kyc");
    try {
      const result = await submitCredential(address, credential);
      notification.success(`KYC granted (tx ${shortAddress(result.txId)})`);
      await refreshStatus();
    } catch (error) {
      notification.error(describeError(error));
    } finally {
      setBusy(null);
    }
  }

  async function onBuy() {
    let value: bigint;
    try {
      value = parseEther(hbarInput);
    } catch {
      notification.error("Enter a valid HBAR amount.");
      return;
    }
    if (value <= 0n) {
      notification.error("Enter a positive HBAR amount.");
      return;
    }
    setBusy("buy");
    try {
      const hash = await writeContractAsync({
        address: saleAddress,
        abi: tokenSaleAbi,
        functionName: "buy",
        value,
      });
      notification.success(`Purchase submitted (${shortAddress(hash)})`);
      await refreshStatus();
    } catch (error) {
      notification.error(describeError(error));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col items-center grow gap-6 px-4 py-10">
      <div className="w-full max-w-4xl">
        <h1 className="text-3xl font-bold">Investor</h1>
        <p className="text-base-content/70 text-sm">
          Associate the token, present a signed credential, then buy within your USD cap.
        </p>
      </div>

      {!isConnected ? (
        <div className="alert alert-info w-full max-w-4xl">
          <span>Connect a wallet using the button in the header to continue.</span>
        </div>
      ) : null}

      <div className="grid w-full max-w-4xl grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="card bg-base-100 shadow-xl">
          <div className="card-body gap-3">
            <h2 className="card-title text-lg">Status</h2>
            {statusError ? <div className="alert alert-error text-sm">{statusError}</div> : null}
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-base-content/60">Token id</dt>
              <dd className="font-mono">{status?.tokenId ?? "—"}</dd>
              <dt className="text-base-content/60">Hedera account</dt>
              <dd className="font-mono">{status?.hederaAccountId ?? "—"}</dd>
              <dt className="text-base-content/60">Cap used / remaining</dt>
              <dd>{status ? `${formatUsd8(status.spentUsd8 ?? "0")} / ${formatUsd8(capRemaining8 ?? 0n)}` : "—"}</dd>
            </dl>
            <div className="flex flex-wrap gap-2">
              <StatusBadge ok={Boolean(status?.associated)} labelTrue="Associated" labelFalse="Not associated" />
              <StatusBadge ok={Boolean(status?.kycGranted)} labelTrue="KYC granted" labelFalse="No KYC" />
              <StatusBadge ok={!status?.frozen} labelTrue="Unfrozen" labelFalse="Frozen" />
              <StatusBadge ok={!status?.paused} labelTrue="Active" labelFalse="Paused" />
            </div>
            <button className="btn btn-outline btn-sm" onClick={() => refreshStatus()} disabled={!address}>
              Refresh
            </button>
          </div>
        </section>

        <section className="card bg-base-100 shadow-xl">
          <div className="card-body gap-3">
            <h2 className="card-title text-lg">Compliance</h2>
            <button
              className="btn btn-secondary"
              onClick={onAssociate}
              disabled={!status?.tokenAddress || busy !== null || isPending}
            >
              {busy === "associate" ? <span className="loading loading-spinner loading-sm" /> : "Associate token"}
            </button>
            <label className="form-control">
              <span className="label-text text-base-content/70">Signed credential (JSON)</span>
              <textarea
                className="textarea textarea-bordered h-32 font-mono text-xs"
                value={credentialText}
                onChange={event => setCredentialText(event.target.value)}
                placeholder='{ "subject": "0x...", "issuer": "did:hedera:...", ... }'
              />
            </label>
            <button
              className="btn btn-primary"
              onClick={onSubmitCredential}
              disabled={credentialText.trim().length === 0 || busy !== null || isPending}
            >
              {busy === "kyc" ? <span className="loading loading-spinner loading-sm" /> : "Submit credential"}
            </button>
          </div>
        </section>

        <section className="card bg-base-100 shadow-xl lg:col-span-2">
          <div className="card-body gap-3">
            <h2 className="card-title text-lg">Buy tokens</h2>
            {isStale ? (
              <div className="alert alert-warning text-sm">
                The Chainlink HBAR/USD price is stale. Buying is disabled until the feed updates.
              </div>
            ) : null}
            <div className="flex flex-col items-end gap-3 sm:flex-row">
              <label className="form-control grow">
                <span className="label-text text-base-content/70">Amount (HBAR)</span>
                <input
                  className="input input-bordered"
                  inputMode="decimal"
                  value={hbarInput}
                  onChange={event => setHbarInput(event.target.value)}
                  placeholder="1.0"
                />
              </label>
              <div className="stats bg-base-200 w-full sm:w-auto">
                <div className="stat px-4 py-2">
                  <div className="stat-title text-xs">Estimated value</div>
                  <div className="stat-value text-lg">
                    {estimateUsd8 !== undefined ? formatUsd8(estimateUsd8) : "—"}
                  </div>
                  <div className="stat-desc text-xs">price {price8 ? formatUsd8(price8) : "—"} / HBAR</div>
                </div>
              </div>
              <button
                className="btn btn-primary"
                onClick={onBuy}
                disabled={!canBuy || isStale || busy !== null || isPending || hbarInput.trim().length === 0}
              >
                {busy === "buy" ? <span className="loading loading-spinner loading-sm" /> : "Buy"}
              </button>
            </div>
            {!canBuy && status ? (
              <p className="text-base-content/60 text-xs">
                Buying requires the account to be associated, KYC-granted, unfrozen, and the token unpaused.
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
