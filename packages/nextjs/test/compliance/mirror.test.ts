import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UpstreamError } from "~~/services/compliance/errors";
import { getAccountIdByEvm, getTokenInfo, getTokenRelationship } from "~~/services/compliance/mirror";

const MIRROR = "https://mirror.example";

function configureEnv(): void {
  process.env.HEDERA_NETWORK = "testnet";
  process.env.HEDERA_OPERATOR_ID = "0.0.111";
  process.env.HEDERA_OPERATOR_PRIVATE_KEY = "operator-key";
  process.env.ISSUER_DID = "did:hedera:testnet:zIssuer_0.0.1234";
  process.env.AUDIT_TOPIC_ID = "0.0.1234";
  process.env.COMPLIANCE_TOKEN_ADDRESS = "0x1111111111111111111111111111111111111111";
  process.env.TOKEN_SALE_ADDRESS = "0x2222222222222222222222222222222222222222";
  process.env.HEDERA_MIRROR_URL = MIRROR;
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe("mirror", () => {
  beforeEach(() => {
    configureEnv();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null for a 404 without treating it as an error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(404, {})),
    );

    await expect(getAccountIdByEvm("0xabc")).resolves.toBeNull();
  });

  it("parses token metadata", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(200, { token_id: "0.0.5", pause_status: "PAUSED", name: "Comp", symbol: "CMP" })),
    );

    await expect(getTokenInfo("0xabc")).resolves.toEqual({
      tokenId: "0.0.5",
      paused: true,
      name: "Comp",
      symbol: "CMP",
    });
  });

  it("maps a token relationship body to booleans", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(200, { tokens: [{ token_id: "0.0.5", kyc_status: "GRANTED", freeze_status: "FROZEN" }] }),
      ),
    );

    await expect(getTokenRelationship("0xabc", "0.0.5")).resolves.toEqual({
      associated: true,
      kycGranted: true,
      frozen: true,
    });
  });

  it("surfaces a non-retryable HTTP error as a typed UpstreamError", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(400, {}));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getAccountIdByEvm("0xabc")).rejects.toBeInstanceOf(UpstreamError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses the HEDERA_MIRROR_URL override", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { account: "0.0.9" }));
    vi.stubGlobal("fetch", fetchMock);

    await getAccountIdByEvm("0xabc");
    expect(fetchMock).toHaveBeenCalledWith(`${MIRROR}/api/v1/accounts/0xabc`, expect.anything());
  });
});
