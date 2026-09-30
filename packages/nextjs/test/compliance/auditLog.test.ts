import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  decodeAuditMessage,
  encodeAuditMessage,
  fetchAuditEntries,
  pollAuditEntries,
} from "~~/services/compliance/auditLog";
import type { AuditMessage } from "~~/utils/compliance/types";

const TOPIC_ID = "0.0.1234";
const MIRROR = "https://mirror.example";

function configureEnv(): void {
  process.env.HEDERA_NETWORK = "testnet";
  process.env.HEDERA_OPERATOR_ID = "0.0.111";
  process.env.HEDERA_OPERATOR_PRIVATE_KEY = "operator-key";
  process.env.ISSUER_DID = "did:hedera:testnet:zIssuer_0.0.1234";
  process.env.AUDIT_TOPIC_ID = TOPIC_ID;
  process.env.COMPLIANCE_TOKEN_ADDRESS = "0x1111111111111111111111111111111111111111";
  process.env.TOKEN_SALE_ADDRESS = "0x2222222222222222222222222222222222222222";
  process.env.HEDERA_MIRROR_URL = MIRROR;
}

const baseMessage: AuditMessage = {
  action: "grantKyc",
  account: "0x1111111111111111111111111111111111111111",
  operator: "0x000000000000000000000000000000000086790b",
  txId: "0.0.111@1.2.3",
  timestamp: "2026-09-30T00:00:00.000Z",
};

function mirrorMessage(sequence: number, encoded: string) {
  return { sequence_number: sequence, consensus_timestamp: `${sequence}.000000000`, message: encoded };
}

describe("audit message encode/decode", () => {
  it("round-trips a valid message", () => {
    const encoded = encodeAuditMessage(baseMessage);
    const decoded = decodeAuditMessage(encoded, { sequenceNumber: 7, consensusTimestamp: "7.0" });
    expect(decoded).toMatchObject({ ...baseMessage, sequenceNumber: 7, consensusTimestamp: "7.0" });
  });

  it("returns null for invalid base64 JSON", () => {
    const encoded = Buffer.from("not json", "utf8").toString("base64");
    expect(decodeAuditMessage(encoded, { sequenceNumber: 1, consensusTimestamp: "1.0" })).toBeNull();
  });

  it("returns null for a message that fails schema validation", () => {
    const encoded = Buffer.from(JSON.stringify({ action: "grantKyc" }), "utf8").toString("base64");
    expect(decodeAuditMessage(encoded, { sequenceNumber: 1, consensusTimestamp: "1.0" })).toBeNull();
  });
});

describe("fetchAuditEntries", () => {
  beforeEach(() => {
    configureEnv();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("follows mirror pagination links", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("sequencenumber=gt") === false && url.includes("limit=2") && !url.includes("page=2")) {
        return {
          ok: true,
          json: async () => ({
            messages: [mirrorMessage(1, encodeAuditMessage(baseMessage))],
            links: { next: `/api/v1/topics/${TOPIC_ID}/messages?limit=2&page=2` },
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          messages: [mirrorMessage(2, encodeAuditMessage({ ...baseMessage, action: "freeze" }))],
          links: {},
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const { entries, nextAfter } = await fetchAuditEntries({ limit: 2 });
    expect(entries.map(entry => entry.sequenceNumber)).toEqual([1, 2]);
    expect(entries[1].action).toBe("freeze");
    expect(nextAfter).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("skips unparseable messages", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          messages: [
            mirrorMessage(1, Buffer.from("garbage", "utf8").toString("base64")),
            mirrorMessage(2, encodeAuditMessage(baseMessage)),
          ],
          links: {},
        }),
      })),
    );

    const { entries } = await fetchAuditEntries({ limit: 5 });
    expect(entries).toHaveLength(1);
    expect(entries[0].sequenceNumber).toBe(2);
  });
});

describe("pollAuditEntries", () => {
  beforeEach(() => {
    configureEnv();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("retries until the expected entry is indexed", async () => {
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        call += 1;
        const messages = call >= 3 ? [mirrorMessage(5, encodeAuditMessage(baseMessage))] : [];
        return { ok: true, json: async () => ({ messages, links: {} }) };
      }),
    );

    const result = await pollAuditEntries({
      predicate: entries => entries.length > 0,
      intervalMs: 1,
      timeoutMs: 200,
    });
    expect(result.timedOut).toBe(false);
    expect(result.entries).toHaveLength(1);
  });

  it("returns timedOut when the entry never appears", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ messages: [], links: {} }) })),
    );

    const result = await pollAuditEntries({
      predicate: entries => entries.length > 0,
      intervalMs: 1,
      timeoutMs: 5,
    });
    expect(result.timedOut).toBe(true);
    expect(result.entries).toHaveLength(0);
  });
});
