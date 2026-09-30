import type { ApiError, AuditEntry, Credential, InvestorStatus, PublicConfig } from "./types";

export class ApiRequestError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "ApiRequestError";
    this.code = code;
    this.status = status;
  }
}

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await response.text();
  const data: unknown = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const err = (data ?? {}) as Partial<ApiError>;
    throw new ApiRequestError(
      err.code ?? "HTTP_ERROR",
      err.message ?? `Request failed (${response.status})`,
      response.status,
    );
  }
  return data as T;
}

export type ComplianceApiResult = {
  action: string;
  account: string | null;
  operator: string;
  txId: string;
  auditTxId: string;
  timestamp: string;
};

export function fetchConfig(): Promise<PublicConfig> {
  return request<PublicConfig>("/api/config");
}

export function fetchInvestorStatus(
  address: string,
): Promise<{ configured: boolean; missing: string[]; status: InvestorStatus | null }> {
  return request(`/api/investor/status?address=${encodeURIComponent(address)}`);
}

export function submitCredential(
  address: string,
  credential: Credential,
): Promise<ComplianceApiResult & { credentialHash: string }> {
  return request("/api/kyc/request", {
    method: "POST",
    body: JSON.stringify({ address, credential }),
  });
}

export function fetchAudit(limit = 25, after?: number): Promise<{ entries: AuditEntry[]; nextAfter: number | null }> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (after !== undefined) {
    params.set("after", String(after));
  }
  return request(`/api/audit?${params.toString()}`);
}

export function runAdminAction(action: string, token: string, account?: string): Promise<ComplianceApiResult> {
  return request(`/api/admin/${encodeURIComponent(action)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: account ? JSON.stringify({ account }) : undefined,
  });
}
