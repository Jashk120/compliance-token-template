import type { Client } from "@hiero-ledger/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { submitActionWithAudit } from "~~/services/compliance/atomicAudit";
import { ComplianceActionError } from "~~/services/compliance/errors";
import type { AuditMessage } from "~~/utils/compliance/types";

const mocks = vi.hoisted(() => {
  const contractTx = {
    transactionId: null as { toString(): string } | null,
    batchify: vi.fn(),
  };
  const auditTx = {
    topicId: "",
    maxChunks: 0,
    message: undefined as unknown,
    setTopicId(value: string) {
      this.topicId = value;
      return this;
    },
    setMaxChunks(value: number) {
      this.maxChunks = value;
      return this;
    },
    setMessage(value: unknown) {
      this.message = value;
      return this;
    },
    batchify: vi.fn(),
  };
  const added: unknown[] = [];
  const batch = {
    execute: vi.fn(),
    innerTransactionIds: [] as ({ toString(): string } | null)[],
    addInnerTransaction: undefined as unknown as (tx: unknown) => unknown,
  };
  batch.addInnerTransaction = vi.fn((tx: unknown) => {
    added.push(tx);
    return batch;
  });
  return { contractTx, auditTx, added, batch };
});

vi.mock("@hiero-ledger/sdk", () => ({
  BatchTransaction: class {
    constructor() {
      return mocks.batch;
    }
  },
  TopicMessageSubmitTransaction: class {
    constructor() {
      return mocks.auditTx;
    }
  },
  Status: { Success: { toString: () => "SUCCESS" } },
}));

vi.mock("~~/services/compliance/auditLog", () => ({
  encodeAuditMessage: (message: unknown) => Buffer.from(JSON.stringify(message), "utf8").toString("base64"),
}));

vi.mock("~~/services/compliance/contractCall", () => ({
  buildComplianceContractTransaction: () => mocks.contractTx,
}));

const CLIENT = { operatorPublicKey: { toString: () => "operator-key" } } as unknown as Client;
const CONTRACT_TX_ID = "0.0.1234@1.2.3";
const AUDIT_TX_ID = "0.0.1234@1.2.4";

function makeRequest() {
  const makeAuditMessage = vi.fn(
    (txId: string): AuditMessage => ({
      action: "grantKyc",
      account: "0x1111111111111111111111111111111111111111",
      operator: "0x000000000000000000000000000000000086790b",
      txId,
      timestamp: "2026-09-30T00:00:00.000Z",
    }),
  );
  return {
    action: "grantKyc" as const,
    account: "0x1111111111111111111111111111111111111111",
    contractAddress: "0x2222222222222222222222222222222222222222",
    topicId: "0.0.9999",
    makeAuditMessage,
  };
}

describe("submitActionWithAudit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.contractTx.transactionId = null;
    mocks.contractTx.batchify.mockImplementation(async () => {
      mocks.contractTx.transactionId = { toString: () => CONTRACT_TX_ID };
      return mocks.contractTx;
    });
    mocks.added.length = 0;
    mocks.batch.innerTransactionIds = [{ toString: () => AUDIT_TX_ID }, { toString: () => CONTRACT_TX_ID }];
    mocks.batch.execute.mockResolvedValue({
      transactionId: { toString: () => "0.0.1234@9.9.9" },
      getReceipt: async () => ({ status: { toString: () => "SUCCESS" } }),
    });
  });

  it("orders the HCS submit before the single contract call", async () => {
    await submitActionWithAudit(CLIENT, makeRequest());
    expect(mocks.added).toEqual([mocks.auditTx, mocks.contractTx]);
  });

  it("batchifies both inner transactions with the operator public key", async () => {
    await submitActionWithAudit(CLIENT, makeRequest());
    const batchKey = CLIENT.operatorPublicKey;
    expect(mocks.auditTx.batchify).toHaveBeenCalledWith(CLIENT, batchKey);
    expect(mocks.contractTx.batchify).toHaveBeenCalledWith(CLIENT, batchKey);
  });

  it("links the audit message to the contract transaction id and returns both inner ids", async () => {
    const request = makeRequest();
    const result = await submitActionWithAudit(CLIENT, request);

    expect(request.makeAuditMessage).toHaveBeenCalledWith(CONTRACT_TX_ID);
    expect(result).toEqual({ txId: CONTRACT_TX_ID, auditTxId: AUDIT_TX_ID });
  });

  it("encodes the audit message as base64 JSON carrying the contract tx id", async () => {
    await submitActionWithAudit(CLIENT, makeRequest());
    const decoded = JSON.parse(Buffer.from(mocks.auditTx.message as Uint8Array).toString("utf8"));
    expect(decoded).toMatchObject({ action: "grantKyc", txId: CONTRACT_TX_ID });
  });

  it("caps the audit message at a single chunk", async () => {
    await submitActionWithAudit(CLIENT, makeRequest());
    expect(mocks.auditTx.maxChunks).toBe(1);
    expect(mocks.auditTx.topicId).toBe("0.0.9999");
  });

  it("throws before building a batch when the operator has no public key", async () => {
    const noKeyClient = { operatorPublicKey: null } as unknown as Client;
    await expect(submitActionWithAudit(noKeyClient, makeRequest())).rejects.toBeInstanceOf(ComplianceActionError);
    expect(mocks.batch.execute).not.toHaveBeenCalled();
  });

  it("throws when the batch receipt is not a success", async () => {
    mocks.batch.execute.mockResolvedValue({
      transactionId: { toString: () => "0.0.1234@9.9.9" },
      getReceipt: async () => ({ status: { toString: () => "INNER_TRANSACTION_FAILED" } }),
    });
    await expect(submitActionWithAudit(CLIENT, makeRequest())).rejects.toThrow(/INNER_TRANSACTION_FAILED/);
  });

  it("wraps an SDK error as a compliance action error", async () => {
    mocks.batch.execute.mockRejectedValue(new Error("network down"));
    await expect(submitActionWithAudit(CLIENT, makeRequest())).rejects.toMatchObject({
      name: "ComplianceActionError",
      message: "network down",
    });
  });
});
