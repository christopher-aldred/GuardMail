/**
 * Thin HTTP client wrapping the Guardmail REST API.
 *
 * All MCP tools/resources proxy to the API server using either a JWT
 * (obtained via login) or the user's API key.
 */
import 'dotenv/config';
import type { ApiResponse } from '@guardmail/shared';

const DEFAULT_API_URL = process.env.API_URL ?? 'http://localhost:3000';

/**
 * Structured error raised when an API request fails.
 *
 * The Guardmail API returns errors as `{ success, error: { code, message, details } }`.
 * `ApiError` preserves that structure (plus the HTTP status) so the MCP
 * layer can surface a structured error to the agent instead of a flat
 * string. This lets an LLM agent distinguish, for example, a 401 (bad
 * credentials) from a 403 (tier/forbidden) from a 429 (quota / rate
 * limit) from a 503 (upstream service not configured) and react
 * accordingly — e.g. telling the user to verify their email rather
 * than retrying blindly.
 */
export class ApiError extends Error {
  /** Stable error code from the API (e.g. "401", "403", "429", "RATE_LIMIT", "INTERNAL"). */
  readonly code: string;
  /** HTTP status of the failing response (0 when the request never reached the API). */
  readonly status: number;
  /** Optional structured details echoed from the API error envelope. */
  readonly details?: unknown;

  constructor(code: string, message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/** True when `err` is an `ApiError` (a structured API failure). */
export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

export class ApiClient {
  constructor(
    private token: string,
    private useApiKey = false,
    private apiUrl: string = DEFAULT_API_URL,
  ) {}

  private headers(): Record<string, string> {
    return this.useApiKey
      ? { 'content-type': 'application/json', 'x-api-key': this.token }
      : { 'content-type': 'application/json', authorization: `Bearer ${this.token}` };
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.apiUrl}${path}`, {
        method,
        headers: this.headers(),
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      // Network-level failure (DNS, connection refused, TLS, timeout).
      // Surface as a structured error so the agent can tell the user the
      // API is unreachable rather than retrying an auth-limited call.
      throw new ApiError(
        'NETWORK',
        err instanceof Error ? err.message : 'Unable to reach the Guardmail API',
        0,
      );
    }
    const json = (await res.json().catch(() => ({}))) as ApiResponse<T>;
    if (!res.ok || !json.success) {
      // Preserve the API's structured error (code + details) and augment
      // with the HTTP status. Fall back to a sane message when the body
      // isn't JSON (e.g. a proxy 502/504 returning HTML).
      const code = json.error?.code ?? String(res.status);
      const message =
        json.error?.message ??
        `API ${method} ${path} failed (HTTP ${res.status})`;
      throw new ApiError(code, message, res.status, json.error?.details);
    }
    return json.data as T;
  }

  // Auth
  register(input: { username: string; email: string; password: string }) {
    return this.request('POST', '/api/auth/register', input);
  }
  login(input: { username: string; password: string }) {
    return this.request('POST', '/api/auth/login', input);
  }

  // Emails
  listInbox(limit = 50, offset = 0) {
    return this.request('GET', `/api/emails/inbox?limit=${limit}&offset=${offset}`);
  }
  listSpam(limit = 50, offset = 0) {
    return this.request('GET', `/api/emails/spam?limit=${limit}&offset=${offset}`);
  }
  listQuarantine(limit = 50, offset = 0) {
    return this.request('GET', `/api/emails/quarantine?limit=${limit}&offset=${offset}`);
  }
  getEmail(id: string) {
    return this.request('GET', `/api/emails/${id}`);
  }
  sendEmail(input: { to: string[]; subject: string; body: string; bodyHtml?: string }) {
    return this.request('POST', '/api/emails/send', input);
  }
  deleteEmail(id: string) {
    return this.request('DELETE', `/api/emails/${id}`);
  }

  // Settings
  getSpamSettings() {
    return this.request('GET', '/api/settings/spam');
  }
  updateSpamSettings(input: {
    enabled: boolean;
    sensitivity: 'low' | 'medium' | 'high' | 'custom';
    allowlist: string[];
    blocklist: string[];
    keywordRules: { keyword: string; action: 'flag' | 'block'; score: number }[];
    blockContentTypes: string[];
  }) {
    return this.request('PUT', '/api/settings/spam', input);
  }

  // Security settings (per-user outbound LLM Guard toggle)
  getSecuritySettings() {
    return this.request<{ llmGuardOutboundEnabled: boolean }>('GET', '/api/settings/security');
  }
  updateSecuritySettings(input: { llmGuardOutboundEnabled: boolean }) {
    return this.request<{ llmGuardOutboundEnabled: boolean }>('PUT', '/api/settings/security', input);
  }

  // Subscription / quota (tier, monthly + daily limits, current usage)
  getSubscription() {
    return this.request<{
      tier: string;
      name: string;
      monthlyLimit: number | null;
      dailyLimit: number;
      priceCents: number | null;
      available: boolean;
      sentThisMonth: number;
      sentToday: number;
      emailVerified: boolean;
      email: string;
      unverifiedSendLimit: number | null;
      sentLifetimeOutbound: number;
    }>('GET', '/api/settings/subscription');
  }
}

/**
 * Resolve credentials for an MCP session. Supports three modes:
 *   1. `MCP_API_KEY` env var (server-wide key)
 *   2. Per-request `X-API-Key` header (multi-tenant)
 *   3. JWT via `Authorization: Bearer ...`
 */
export function resolveClient(headers: Record<string, string>): ApiClient {
  const apiKey = headers['x-api-key'];
  const auth = headers['authorization'];
  if (apiKey) return new ApiClient(apiKey, true);
  if (auth?.startsWith('Bearer ')) return new ApiClient(auth.slice(7), false);
  throw new Error('No MCP credentials provided (need X-API-Key or Authorization)');
}