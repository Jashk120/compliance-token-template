import { afterEach, describe, expect, it, vi } from "vitest";
import { UpstreamError } from "~~/services/compliance/errors";
import { fetchUpstream } from "~~/services/compliance/upstream";

function response(status: number, body = ""): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => body,
    json: async () => JSON.parse(body || "{}"),
  } as unknown as Response;
}

describe("fetchUpstream", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the response on success without retrying", async () => {
    const fetchMock = vi.fn(async () => response(200, "{}"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchUpstream("https://rpc.example", undefined, { baseDelayMs: 1 });

    expect(result.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a retryable status and then succeeds", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response(503)).mockResolvedValueOnce(response(200, "{}"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchUpstream("https://rpc.example", undefined, { baseDelayMs: 1 });

    expect(result.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws a typed UpstreamError after exhausting retries on a retryable status", async () => {
    const fetchMock = vi.fn(async () => response(500));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchUpstream("https://rpc.example", undefined, { retries: 1, baseDelayMs: 1 }),
    ).rejects.toBeInstanceOf(UpstreamError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry a non-retryable status", async () => {
    const fetchMock = vi.fn(async () => response(400));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchUpstream("https://rpc.example", undefined, { baseDelayMs: 1 });

    expect(result.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("wraps a transient network failure as UpstreamError with the cause", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("ECONNRESET");
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchUpstream("https://rpc.example", undefined, { retries: 0, baseDelayMs: 1 })).rejects.toMatchObject(
      {
        name: "UpstreamError",
        message: expect.stringContaining("ECONNRESET"),
      },
    );
  });
});
