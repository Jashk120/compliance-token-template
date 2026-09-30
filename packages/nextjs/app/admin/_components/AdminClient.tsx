"use client";

import { useCallback, useEffect, useState } from "react";
import { type ComplianceApiResult, fetchAudit, runAdminAction } from "~~/utils/compliance/api";
import { describeError } from "~~/utils/compliance/clientErrors";
import { shortAddress } from "~~/utils/compliance/format";
import type { PublicConfig } from "~~/utils/compliance/types";
import { notification } from "~~/utils/scaffold-hbar";

type TokenState = {
  tokenId: string | null;
  tokenAddress: string;
  paused: boolean;
  name: string | null;
  symbol: string | null;
};

const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export function AdminClient({ config }: { config: PublicConfig }) {
  const [adminToken, setAdminToken] = useState("");
  const [tokenState, setTokenState] = useState<TokenState | null>(null);
  const [accounts, setAccounts] = useState<string[]>([]);
  const [manualAccount, setManualAccount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<ComplianceApiResult | null>(null);

  const scanBase = config.network === "mainnet" ? "https://hashscan.io/mainnet" : "https://hashscan.io/testnet";

  const loadState = useCallback(async () => {
    try {
      const [tokenResponse, audit] = await Promise.all([fetch("/api/token"), fetchAudit(50)]);
      if (!tokenResponse.ok) {
        throw new Error(`Token state request failed (${tokenResponse.status})`);
      }
      setTokenState((await tokenResponse.json()) as TokenState);
      setAccounts(previous => {
        const seen = new Set(previous);
        for (const entry of audit.entries) {
          if (EVM_ADDRESS_RE.test(entry.account)) {
            seen.add(entry.account);
          }
        }
        return Array.from(seen);
      });
      setError(null);
    } catch (caught) {
      setError(describeError(caught));
    }
  }, []);

  useEffect(() => {
    loadState();
  }, [loadState]);

  async function run(action: string, account?: string) {
    if (!adminToken) {
      notification.error("Enter the admin API token first.");
      return;
    }
    const label = account ? `${action} ${shortAddress(account)}` : action;
    if (!window.confirm(`Confirm: ${label}?`)) {
      return;
    }
    setBusy(label);
    try {
      const result = await runAdminAction(action, adminToken, account);
      setLastResult(result);
      notification.success(`${label} succeeded`);
      await loadState();
    } catch (caught) {
      notification.error(describeError(caught));
    } finally {
      setBusy(null);
    }
  }

  function addAccount() {
    const value = manualAccount.trim();
    if (!EVM_ADDRESS_RE.test(value)) {
      notification.error("Enter a valid 0x address.");
      return;
    }
    setAccounts(previous => Array.from(new Set([value, ...previous])));
    setManualAccount("");
  }

  return (
    <div className="flex flex-col items-center grow gap-6 px-4 py-10">
      <div className="w-full max-w-5xl">
        <h1 className="text-3xl font-bold">Compliance officer</h1>
        <p className="text-base-content/70 text-sm">
          Revoke KYC, freeze or unfreeze an account, and pause the token. Every action is signed by the operator and
          logged to HCS.
        </p>
      </div>

      {error ? <div className="alert alert-error w-full max-w-5xl text-sm">{error}</div> : null}

      <div className="grid w-full max-w-5xl grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="card bg-base-100 shadow-xl">
          <div className="card-body gap-3">
            <h2 className="card-title text-lg">Token</h2>
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-base-content/60">Token id</dt>
              <dd className="font-mono">{tokenState?.tokenId ?? "—"}</dd>
              <dt className="text-base-content/60">State</dt>
              <dd>
                <span className={`badge ${tokenState?.paused ? "badge-warning" : "badge-success"} badge-sm`}>
                  {tokenState?.paused ? "Paused" : "Active"}
                </span>
              </dd>
            </dl>
            <div className="flex gap-2">
              <button className="btn btn-sm btn-warning" disabled={busy !== null} onClick={() => run("pause")}>
                Pause
              </button>
              <button className="btn btn-sm btn-success" disabled={busy !== null} onClick={() => run("unpause")}>
                Unpause
              </button>
            </div>
          </div>
        </section>

        <section className="card bg-base-100 shadow-xl lg:col-span-2">
          <div className="card-body gap-3">
            <h2 className="card-title text-lg">Admin API token</h2>
            <p className="text-base-content/60 text-xs">
              Demo-grade guard: the token is compared server-side against <code>ADMIN_API_TOKEN</code>.
            </p>
            <input
              className="input input-bordered"
              type="password"
              value={adminToken}
              onChange={event => setAdminToken(event.target.value)}
              placeholder="Bearer token"
            />
            {lastResult ? (
              <div className="alert alert-success text-xs">
                <span className="break-all">
                  {lastResult.action} succeeded · tx {lastResult.txId} ·{" "}
                  <a
                    className="link"
                    href={`${scanBase}/transaction/${encodeURIComponent(lastResult.txId)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    HashScan
                  </a>
                </span>
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <section className="card bg-base-100 w-full max-w-5xl shadow-xl">
        <div className="card-body gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="card-title text-lg">Accounts</h2>
            <div className="flex gap-2">
              <input
                className="input input-bordered input-sm font-mono"
                value={manualAccount}
                onChange={event => setManualAccount(event.target.value)}
                placeholder="0x..."
              />
              <button className="btn btn-sm" onClick={addAccount}>
                Add
              </button>
            </div>
          </div>
          {accounts.length === 0 ? (
            <p className="text-base-content/60 text-sm">
              No accounts yet. Add one above or grant KYC from the investor page.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th>Account</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map(account => (
                    <tr key={account}>
                      <td className="font-mono text-xs">{shortAddress(account, 10)}</td>
                      <td className="flex justify-end gap-1">
                        <button
                          className="btn btn-xs btn-outline"
                          disabled={busy !== null}
                          onClick={() => run("revoke-kyc", account)}
                        >
                          Revoke KYC
                        </button>
                        <button
                          className="btn btn-xs btn-warning"
                          disabled={busy !== null}
                          onClick={() => run("freeze", account)}
                        >
                          Freeze
                        </button>
                        <button
                          className="btn btn-xs btn-success"
                          disabled={busy !== null}
                          onClick={() => run("unfreeze", account)}
                        >
                          Unfreeze
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
