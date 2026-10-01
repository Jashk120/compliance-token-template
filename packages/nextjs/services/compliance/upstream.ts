import { UpstreamError } from "./errors";

const DEFAULT_RETRIES = 2;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_BASE_DELAY_MS = 250;

export type UpstreamFetchOptions = {
  retries?: number;
  timeoutMs?: number;
  baseDelayMs?: number;
};

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch for RPC and Mirror Node calls: adds a timeout, retries retryable statuses and
 * transient network failures with exponential backoff, and throws a typed UpstreamError
 * once retries are exhausted. Non-retryable statuses (e.g. 404) are returned so callers
 * can handle them; routes answer 502 with a message instead of a blank 500.
 */
export async function fetchUpstream(
  url: string,
  init?: RequestInit,
  options: UpstreamFetchOptions = {},
): Promise<Response> {
  const attempts = Math.max(1, (options.retries ?? DEFAULT_RETRIES) + 1);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  let lastFailure = "unknown error";

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      if (!isRetryableStatus(response.status)) {
        return response;
      }
      lastFailure = `HTTP ${response.status}`;
      await response.text().catch(() => "");
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
    }

    if (attempt < attempts) {
      await delay(baseDelayMs * 2 ** (attempt - 1));
    }
  }

  throw new UpstreamError(`Upstream request to ${url} failed after ${attempts} attempts: ${lastFailure}`);
}
