"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchAudit } from "~~/utils/compliance/api";
import { describeError } from "~~/utils/compliance/clientErrors";
import { shortAddress } from "~~/utils/compliance/format";
import type { AuditEntry } from "~~/utils/compliance/types";

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
                  <span className="badge badge-primary badge-xs" />
                </div>
                <div className="timeline-end mb-6 w-full">
                  <div className="card bg-base-100 shadow">
                    <div className="card-body gap-1 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">{entry.action}</span>
                        <time className="text-base-content/50 text-xs">{entry.timestamp}</time>
                      </div>
                      <div className="text-base-content/70 font-mono text-xs">
                        account {shortAddress(entry.account, 8)} · operator {shortAddress(entry.operator, 6)}
                      </div>
                      <a
                        className="link text-xs"
                        href={`https://hashscan.io/testnet/transaction/${encodeURIComponent(entry.txId)}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {entry.txId}
                      </a>
                      <div className="text-base-content/40 text-[10px]">
                        seq {entry.sequenceNumber} · consensus {entry.consensusTimestamp}
                        {entry.credentialHash ? ` · credential ${shortAddress(entry.credentialHash, 6)}` : ""}
                      </div>
                    </div>
                  </div>
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
