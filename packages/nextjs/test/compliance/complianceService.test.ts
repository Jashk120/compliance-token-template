import { beforeEach, describe, expect, it, vi } from "vitest";
import { runComplianceAction } from "~~/services/compliance/complianceService";
import { ComplianceActionError } from "~~/services/compliance/errors";

const mocks = vi.hoisted(() => ({
  submitActionWithAudit: vi.fn(),
  submitAuditMessage: vi.fn(),
  buildComplianceContractTransaction: vi.fn(),
  getServerConfig: vi.fn(),
  getOperatorClient: vi.fn(),
}));

vi.mock("~~/services/compliance/atomicAudit", () => ({ submitActionWithAudit: mocks.submitActionWithAudit }));
vi.mock("~~/services/compliance/auditLog", () => ({ submitAuditMessage: mocks.submitAuditMessage }));
vi.mock("~~/services/compliance/contractCall", () => ({
  buildComplianceContractTransaction: mocks.buildComplianceContractTransaction,
}));
vi.mock("~~/services/compliance/config", () => ({ getServerConfig: mocks.getServerConfig }));
vi.mock("~~/services/compliance/hederaClient", () => ({ getOperatorClient: mocks.getOperatorClient }));
vi.mock("@hiero-ledger/sdk", () => ({
  AccountId: { fromString: () => ({ toEvmAddress: () => "000000000000000000000000000000000086790b" }) },
  Status: { Success: { toString: () => "SUCCESS" } },
}));

const ACCOUNT = "0x1111111111111111111111111111111111111111";
const CLIENT = { operatorPublicKey: { toString: () => "operator-key" } };

const baseConfig = {
  network: "testnet",
  chainId: 296,
  mirrorBaseUrl: "https://mirror.example",
  rpcUrl: "https://rpc.example",
  operatorId: "0.0.8812811",
  operatorKey: "operator-key",
  issuerDid: "did:hedera:testnet:zIssuer_0.0.1234",
  auditTopicId: "0.0.10791318",
  adminApiToken: "token",
  complianceTokenAddress: "0x83cA87f6D85e46836338b4fEBeC3518c3a2Cb8DA",
  tokenSaleAddress: "0xF964dCA4F31C0c09F4adC88DbFC0aaf54ab9592c",
  atomicAudit: true,
};

describe("runComplianceAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOperatorClient.mockReturnValue(CLIENT);
    mocks.getServerConfig.mockReturnValue({ ...baseConfig });
  });

  it("uses the atomic batch by default and never writes the audit separately", async () => {
    mocks.submitActionWithAudit.mockResolvedValue({
      txId: "0.0.1@1.1",
      auditTxId: "0.0.1@1.2",
    });

    const result = await runComplianceAction("freeze", ACCOUNT);

    expect(mocks.submitActionWithAudit).toHaveBeenCalledWith(CLIENT, {
      action: "freeze",
      account: ACCOUNT,
      contractAddress: baseConfig.complianceTokenAddress,
      topicId: baseConfig.auditTopicId,
      makeAuditMessage: expect.any(Function),
    });
    expect(result).toMatchObject({
      action: "freeze",
      account: ACCOUNT,
      operator: "0x000000000000000000000000000000000086790b",
      txId: "0.0.1@1.1",
      auditTxId: "0.0.1@1.2",
    });
    expect(mocks.submitAuditMessage).not.toHaveBeenCalled();
    expect(mocks.buildComplianceContractTransaction).not.toHaveBeenCalled();
  });

  it("builds the audit message from the contract tx id and carries the credential hash", async () => {
    mocks.submitActionWithAudit.mockResolvedValue({
      txId: "0.0.1@1.1",
      auditTxId: "0.0.1@1.2",
    });

    await runComplianceAction("grantKyc", ACCOUNT, "abc123");
    const { makeAuditMessage } = mocks.submitActionWithAudit.mock.calls[0][1];

    expect(makeAuditMessage("0.0.9@9.9")).toMatchObject({
      action: "grantKyc",
      account: ACCOUNT,
      txId: "0.0.9@9.9",
      credentialHash: "abc123",
    });
  });

  it("falls back to the sequential path when atomic audit is disabled", async () => {
    mocks.getServerConfig.mockReturnValue({ ...baseConfig, atomicAudit: false });
    mocks.buildComplianceContractTransaction.mockReturnValue({
      execute: vi.fn(async () => ({
        transactionId: { toString: () => "0.0.1@5.5" },
        getReceipt: async () => ({ status: { toString: () => "SUCCESS" } }),
      })),
    });
    mocks.submitAuditMessage.mockResolvedValue("0.0.1@5.6");

    const result = await runComplianceAction("pause", null);

    expect(result).toMatchObject({ action: "pause", txId: "0.0.1@5.5", auditTxId: "0.0.1@5.6" });
    expect(mocks.submitAuditMessage).toHaveBeenCalledWith(
      expect.objectContaining({ action: "pause", txId: "0.0.1@5.5" }),
    );
    expect(mocks.submitActionWithAudit).not.toHaveBeenCalled();
  });

  it("does not write an audit message when the sequential contract call fails", async () => {
    mocks.getServerConfig.mockReturnValue({ ...baseConfig, atomicAudit: false });
    mocks.buildComplianceContractTransaction.mockReturnValue({
      execute: vi.fn(async () => ({
        transactionId: { toString: () => "0.0.1@5.5" },
        getReceipt: async () => ({ status: { toString: () => "FAIL_INVALID" } }),
      })),
    });

    await expect(runComplianceAction("pause", null)).rejects.toBeInstanceOf(ComplianceActionError);
    expect(mocks.submitAuditMessage).not.toHaveBeenCalled();
  });
});
