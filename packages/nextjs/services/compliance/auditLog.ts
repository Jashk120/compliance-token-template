import { getAuditConfig, getServerConfig } from "./config";
import { UpstreamError } from "./errors";
import { getOperatorClient } from "./hederaClient";
import { auditMessageSchema } from "./schemas";
import { Status, TopicMessageSubmitTransaction } from "@hiero-ledger/sdk";
import type { AuditEntry, AuditMessage } from "~~/utils/compliance/types";

export const AUDIT_INDEX_RETRY_WINDOW_MS = 30_000;
export const AUDIT_RETRY_INTERVAL_MS = 3_000;

type MirrorMessage = {
  sequence_number: number;
  consensus_timestamp: string;
  message: string;
};

type MirrorPage = {
  messages?: MirrorMessage[];
  links?: { next?: string | null };
};

export function encodeAuditMessage(message: AuditMessage): string {
  return Buffer.from(JSON.stringify(message), "utf8").toString("base64");
}

export function decodeAuditMessage(
  base64Message: string,
  meta: { sequenceNumber: number; consensusTimestamp: string },
): AuditEntry | null {
  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(base64Message, "base64").toString("utf8"));
  } catch {
    return null;
  }
  const parsed = auditMessageSchema.safeParse(raw);
  if (!parsed.success) {
    return null;
  }
  return { ...parsed.data, sequenceNumber: meta.sequenceNumber, consensusTimestamp: meta.consensusTimestamp };
}

export async function submitAuditMessage(message: AuditMessage): Promise<string> {
  const { auditTopicId } = getServerConfig();
  const client = getOperatorClient();
  const response = await new TopicMessageSubmitTransaction()
    .setTopicId(auditTopicId)
    .setMessage(Buffer.from(encodeAuditMessage(message), "base64"))
    .execute(client);
  const receipt = await response.getReceipt(client);
  if (receipt.status.toString() !== Status.Success.toString()) {
    throw new UpstreamError(`HCS message submission failed with status ${receipt.status.toString()}`);
  }
  return response.transactionId.toString();
}

async function fetchPage(pathOrUrl: string): Promise<MirrorPage> {
  const { mirrorBaseUrl } = getAuditConfig();
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${mirrorBaseUrl}${pathOrUrl}`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new UpstreamError(`Mirror node request failed (${response.status})`);
  }
  return (await response.json()) as MirrorPage;
}

export async function fetchAuditEntries(
  options: { limit?: number; before?: number } = {},
): Promise<{ entries: AuditEntry[]; nextAfter: number | null }> {
  const { auditTopicId } = getAuditConfig();
  const limit = Math.min(Math.max(options.limit ?? 25, 1), 100);
  let next: string | null = `/api/v1/topics/${auditTopicId}/messages?limit=${limit}&order=desc`;
  if (options.before) {
    next += `&sequencenumber=lt:${options.before}`;
  }

  const entries: AuditEntry[] = [];
  while (next && entries.length < limit) {
    const page = await fetchPage(next);
    for (const message of page.messages ?? []) {
      const entry = decodeAuditMessage(message.message, {
        sequenceNumber: message.sequence_number,
        consensusTimestamp: message.consensus_timestamp,
      });
      if (entry) {
        entries.push(entry);
      }
      if (entries.length >= limit) {
        break;
      }
    }
    next = page.links?.next ?? null;
  }

  const oldest = entries.length > 0 ? entries[entries.length - 1].sequenceNumber : null;
  return { entries, nextAfter: next && oldest !== null ? oldest : null };
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function pollAuditEntries(options: {
  predicate: (entries: AuditEntry[]) => boolean;
  limit?: number;
  before?: number;
  timeoutMs?: number;
  intervalMs?: number;
}): Promise<{ entries: AuditEntry[]; timedOut: boolean }> {
  const timeoutMs = options.timeoutMs ?? AUDIT_INDEX_RETRY_WINDOW_MS;
  const intervalMs = options.intervalMs ?? AUDIT_RETRY_INTERVAL_MS;
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const { entries } = await fetchAuditEntries({ limit: options.limit, before: options.before });
    if (options.predicate(entries)) {
      return { entries, timedOut: false };
    }
    if (Date.now() + intervalMs > deadline) {
      return { entries, timedOut: true };
    }
    await delay(intervalMs);
  }
}
