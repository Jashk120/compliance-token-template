"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowTopRightOnSquareIcon,
  CheckCircleIcon,
  ClipboardDocumentIcon,
  InformationCircleIcon,
  LockClosedIcon,
  LockOpenIcon,
  PauseCircleIcon,
  PlayCircleIcon,
  ShieldCheckIcon,
  ShieldExclamationIcon,
} from "@heroicons/react/24/outline";
import { fetchAudit } from "~~/utils/compliance/api";
import { describeError } from "~~/utils/compliance/clientErrors";
import { shortAddress } from "~~/utils/compliance/format";
import type { AuditEntry } from "~~/utils/compliance/types";

const HASHSCAN_TESTNET = "https://hashscan.io/testnet";

const ACTION_LABELS: Record<string, string> = {
  grantKyc: "KYC granted",
  revokeKyc: "KYC revoked",
  freeze: "Account frozen",
  unfreeze: "Account unfrozen",
  pause: "Token paused",
  unpause: "Token unpaused",
};

const ACTION_BADGE_CLASSES: Record<string, string> = {
  grantKyc: "badge-success",
  unfreeze: "badge-success",
  unpause: "badge-success",
  freeze: "badge-warning",
  pause: "badge-warning",
  revokeKyc: "badge-warning",
};

type HeroIcon = typeof ShieldCheckIcon;

const ACTION_ICONS: Record<string, HeroIcon> = {
  grantKyc: ShieldCheckIcon,
  revokeKyc: ShieldExclamationIcon,
  freeze: LockClosedIcon,
  unfreeze: LockOpenIcon,
  pause: PauseCircleIcon,
  unpause: PlayCircleIcon,
};

const HEDERA_ID_PATTERN = /^0\.0\.\d+$/;
const EVM_ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

function humanizeAction(action: string): string {
  const known = ACTION_LABELS[action];
  if (known) {
    return known;
  }
  const spaced = action
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  if (spaced.length === 0) {
    return action;
  }
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function actionBadgeClass(action: string): string {
  return ACTION_BADGE_CLASSES[action] ?? "badge-neutral";
}

function actionIcon(action: string): HeroIcon {
  return ACTION_ICONS[action] ?? InformationCircleIcon;
}

function accountUrl(account: string): string | null {
  if (HEDERA_ID_PATTERN.test(account) || EVM_ADDRESS_PATTERN.test(account)) {
    return `${HASHSCAN_TESTNET}/account/${encodeURIComponent(account)}`;
  }
  return null;
}

function displayAccount(account: string): string {
  if (HEDERA_ID_PATTERN.test(account)) {
    return account;
  }
  return shortAddress(account, 6);
}

function CopyHashButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }, [value]);

  return (
    <button
      type="button"
      className="btn btn-ghost btn-xs gap-1"
      onClick={copy}
      aria-label={copied ? "Credential hash copied to clipboard" : "Copy full credential hash to clipboard"}
      title={copied ? "Copied" : "Copy full hash"}
    >
      {copied ? (
        <CheckCircleIcon className="h-4 w-4" aria-hidden="true" />
      ) : (
        <ClipboardDocumentIcon className="h-4 w-4" aria-hidden="true" />
      )}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function AuditEntryCard({ entry }: { entry: AuditEntry }) {
  const label = humanizeAction(entry.action);
  const badgeClass = actionBadgeClass(entry.action);
  const Icon = actionIcon(entry.action);
  const accountHref = accountUrl(entry.account);
  const operatorHref = accountUrl(entry.operator);
  const txHref = `${HASHSCAN_TESTNET}/transaction/${encodeURIComponent(entry.txId)}`;

  return (
    <div className="card bg-base-100 shadow">
      <div className="card-body gap-2 p-4">
        <div className="flex items-center justify-between gap-2">
          <span className={`badge ${badgeClass} gap-1 whitespace-nowrap`}>
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {label}
          </span>
          <time className="text-base-content/50 text-xs whitespace-nowrap shrink-0">{entry.timestamp}</time>
        </div>
        <div className="flex flex-col gap-1 text-xs">
          <div className="flex flex-wrap items-center gap-x-2">
            <span className="text-base-content/50 text-[11px] font-medium uppercase tracking-wide">Account</span>
            {accountHref ? (
              <a
                className="link link-primary font-mono break-all"
                href={accountHref}
                target="_blank"
                rel="noreferrer"
                title={`View account ${entry.account} on HashScan`}
              >
                {displayAccount(entry.account)}
                <ArrowTopRightOnSquareIcon className="ml-0.5 inline h-3 w-3" aria-hidden="true" />
              </a>
            ) : (
              <span className="font-mono break-all">{entry.account}</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-2">
            <span className="text-base-content/50 text-[11px] font-medium uppercase tracking-wide">Operator</span>
            {operatorHref ? (
              <a
                className="link link-primary font-mono break-all"
                href={operatorHref}
                target="_blank"
                rel="noreferrer"
                title={`View operator ${entry.operator} on HashScan`}
              >
                {displayAccount(entry.operator)}
                <ArrowTopRightOnSquareIcon className="ml-0.5 inline h-3 w-3" aria-hidden="true" />
              </a>
            ) : (
              <span className="font-mono break-all">{entry.operator}</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-2">
            <span className="text-base-content/50 text-[11px] font-medium uppercase tracking-wide">Transaction</span>
            <a
              className="link link-primary font-mono break-all"
              href={txHref}
              target="_blank"
              rel="noreferrer"
              title={`View transaction ${entry.txId} on HashScan`}
            >
              {entry.txId}
              <ArrowTopRightOnSquareIcon className="ml-0.5 inline h-3 w-3" aria-hidden="true" />
            </a>
          </div>
          {entry.credentialHash ? (
            <div className="flex flex-wrap items-center gap-x-2">
              <span className="text-base-content/50 text-[11px] font-medium uppercase tracking-wide">
                Credential proof
              </span>
              <span className="font-mono truncate min-w-0 max-w-40" title={entry.credentialHash}>
                {entry.credentialHash}
              </span>
              <CopyHashButton value={entry.credentialHash} />
            </div>
          ) : null}
        </div>
        <div className="text-base-content/40 text-[10px]">
          seq {entry.sequenceNumber} · consensus {entry.consensusTimestamp}
        </div>
      </div>
    </div>
  );
}

export function AuditClient() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [nextAfter, setNextAfter] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (after?: number) => {
    setLoading(true);
    try {
      const result = await fetchAudit(25, after);
      setEntries(previous => (after ? [...previous, ...result.entries] : result.entries));
      setNextAfter(result.nextAfter);
      setError(null);
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flex flex-col items-center grow gap-6 px-4 py-10">
      <div className="flex w-full max-w-3xl items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold">Audit log</h1>
          <p className="text-base-content/70 text-sm">
            Every compliance action is published to Hedera Consensus Service.
          </p>
        </div>
        <button className="btn btn-sm" onClick={() => load()} disabled={loading}>
          {loading ? <span className="loading loading-spinner loading-xs" /> : "Refresh"}
        </button>
      </div>

      <div className="alert alert-info w-full max-w-3xl text-sm">
        <span>New entries may take 10-20 s to index from the Mirror Node.</span>
      </div>

      {error ? <div className="alert alert-error w-full max-w-3xl text-sm">{error}</div> : null}

      <div className="w-full max-w-3xl">
        {loading && entries.length === 0 ? (
          <div className="flex justify-center py-10">
            <span className="loading loading-spinner loading-lg" />
          </div>
        ) : entries.length === 0 ? (
          <div className="card bg-base-100 shadow-xl">
            <div className="card-body items-center text-center">
              <p className="text-base-content/60 text-sm">No audit entries yet.</p>
            </div>
          </div>
        ) : (
          <ul className="timeline timeline-vertical timeline-snap-icon">
            {entries.map(entry => (
              <li key={`${entry.sequenceNumber}-${entry.txId}`}>
                <div className="timeline-middle">
                  <span className={`badge ${actionBadgeClass(entry.action)} badge-xs`} aria-hidden="true" />
                </div>
                <div className="timeline-end mb-6 w-full">
                  <AuditEntryCard entry={entry} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {nextAfter !== null ? (
        <button className="btn btn-outline btn-sm" onClick={() => load(nextAfter)} disabled={loading}>
          Load more
        </button>
      ) : null}
    </div>
  );
}
