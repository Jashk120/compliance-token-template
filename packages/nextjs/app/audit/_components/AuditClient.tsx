"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

const PAGE_SIZE = 25;
const REFRESH_INTERVAL_MS = 10_000;

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

function entryKey(entry: AuditEntry): string {
  return `${entry.sequenceNumber}-${entry.txId}`;
}

function accountUrl(scanBase: string, account: string): string | null {
  if (HEDERA_ID_PATTERN.test(account) || EVM_ADDRESS_PATTERN.test(account)) {
    return `${scanBase}/account/${encodeURIComponent(account)}`;
  }
  return null;
}

function displayAccount(account: string): string {
  if (HEDERA_ID_PATTERN.test(account)) {
    return account;
  }
  return shortAddress(account, 6);
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString();
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

function AuditEntryCard({ entry, scanBase }: { entry: AuditEntry; scanBase: string }) {
  const label = humanizeAction(entry.action);
  const badgeClass = actionBadgeClass(entry.action);
  const Icon = actionIcon(entry.action);
  const accountHref = accountUrl(scanBase, entry.account);
  const operatorHref = accountUrl(scanBase, entry.operator);
  const txHref = `${scanBase}/transaction/${encodeURIComponent(entry.txId)}`;

  return (
    <div className="card bg-base-100 shadow">
      <div className="card-body gap-2 p-4">
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <span className={`badge ${badgeClass} gap-1 whitespace-nowrap`}>
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {label}
          </span>
          <time className="text-base-content/50 text-xs" title={entry.timestamp}>
            {formatTimestamp(entry.timestamp)}
          </time>
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

export function AuditClient({ network }: { network: "testnet" | "mainnet" }) {
  const scanBase = network === "mainnet" ? "https://hashscan.io/mainnet" : "https://hashscan.io/testnet";
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [nextAfter, setNextAfter] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const entriesRef = useRef<AuditEntry[]>([]);
  entriesRef.current = entries;
  const loadingMoreRef = useRef(false);
  loadingMoreRef.current = loadingMore;

  // Full reset to the first (newest) page.
  const loadFirstPage = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchAudit(PAGE_SIZE);
      setEntries(result.entries);
      setNextAfter(result.nextAfter);
      setUpdatedAt(new Date());
      setError(null);
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const result = await fetchAudit(PAGE_SIZE, nextAfter ?? undefined);
      setEntries(previous => {
        const seen = new Set(previous.map(entryKey));
        const older = result.entries.filter(entry => {
          const key = entryKey(entry);
          if (seen.has(key)) {
            return false;
          }
          seen.add(key);
          return true;
        });
        return [...previous, ...older];
      });
      setNextAfter(result.nextAfter);
      setError(null);
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setLoadingMore(false);
    }
  }, [nextAfter]);

  // Merge a refreshed first page on top without dropping older loaded pages.
  const refreshNewest = useCallback(async () => {
    if (document.visibilityState !== "visible" || loadingMoreRef.current) {
      return;
    }
    try {
      const result = await fetchAudit(PAGE_SIZE);
      const previous = entriesRef.current;
      if (previous.length > result.entries.length) {
        const seen = new Set(previous.map(entryKey));
        const fresh = result.entries.filter(entry => !seen.has(entryKey(entry)));
        if (fresh.length > 0) {
          setEntries([...fresh, ...previous]);
          setUpdatedAt(new Date());
        }
      } else {
        const seen = new Set(result.entries.map(entryKey));
        const keptOlder = previous.filter(entry => !seen.has(entryKey(entry)));
        setEntries([...result.entries, ...keptOlder]);
        setNextAfter(result.nextAfter);
        setUpdatedAt(new Date());
      }
      setError(null);
    } catch {
      // Keep showing stale entries on background refresh failures.
    }
  }, []);

  useEffect(() => {
    loadFirstPage();
  }, [loadFirstPage]);

  useEffect(() => {
    const interval = setInterval(() => {
      void refreshNewest();
    }, REFRESH_INTERVAL_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void refreshNewest();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refreshNewest]);

  return (
    <div className="flex flex-col items-center grow gap-6 px-4 py-10">
      <div className="flex w-full max-w-3xl items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Audit log</h1>
          <p className="text-base-content/70 text-sm">
            Every compliance action is published to Hedera Consensus Service.
          </p>
          {updatedAt ? (
            <p className="text-base-content/50 text-xs mt-1">Updated {updatedAt.toLocaleTimeString()}</p>
          ) : null}
        </div>
        <button
          className="btn btn-sm shrink-0"
          onClick={() => loadFirstPage()}
          disabled={loading}
          aria-label="Refresh audit log"
        >
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
          <ul className="flex flex-col">
            {entries.map((entry, index) => {
              const isLast = index === entries.length - 1;
              return (
                <li key={entryKey(entry)} className="flex gap-3">
                  <div className="flex w-5 shrink-0 flex-col items-center" aria-hidden="true">
                    <span className="badge badge-primary badge-xs mt-5 h-2.5 w-2.5 p-0" />
                    {isLast ? null : <span className="w-px grow bg-base-300" />}
                  </div>
                  <div className="grow min-w-0 pb-5">
                    <AuditEntryCard entry={entry} scanBase={scanBase} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {nextAfter !== null && entries.length > 0 ? (
        <button
          className="btn btn-outline btn-sm"
          onClick={() => loadMore()}
          disabled={loadingMore}
          aria-label="Load more audit entries"
        >
          {loadingMore ? <span className="loading loading-spinner loading-xs" /> : "Load more"}
        </button>
      ) : null}
    </div>
  );
}
