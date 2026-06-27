/**
 * Resend custom-domain management client.
 *
 * Wraps the Resend `/domains` API used to register a custom domain and
 * poll its DNS-verification status. Reuses the same API key as the SMTP
 * relay (`SMTP_PASS`) falling back to `RESEND_API_KEY`.
 *
 *   POST   /domains        — register a domain, returns DNS records
 *   GET    /domains/{id}   — fetch current verification status
 *   DELETE /domains/{id}   — remove a domain from Resend
 *
 * When no API key is configured the client throws a typed error so the
 * settings route can surface a clear 503 to the caller.
 */
import type { ResendDomainRecord } from '@guardmail/shared';

const RESEND_DOMAINS_URL = 'https://api.resend.com/domains';

export class ResendNotConfiguredError extends Error {
  constructor() {
    super('Resend API is not configured (SMTP_PASS / RESEND_API_KEY).');
    this.name = 'ResendNotConfiguredError';
  }
}

/** Resend domain status values we care about. */
export type ResendDomainStatus =
  | 'pending'
  | 'verified'
  | 'failed'
  | 'not_started'
  | 'temporary_failure';

interface ResendDomainRecordRaw {
  record: string;
  name: string;
  type: string;
  value: string;
  priority?: number;
  ttl?: number;
}

export interface ResendDomainResponse {
  id: string;
  name: string;
  status: ResendDomainStatus;
  records: ResendDomainRecord[];
}

function apiKey(): string {
  return process.env.SMTP_PASS ?? process.env.RESEND_API_KEY ?? '';
}

export function isResendConfigured(): boolean {
  return !!apiKey();
}

function normalizeRecords(
  raw: ResendDomainRecordRaw[] | undefined,
): ResendDomainRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((r) => ({
    record: r.record,
    name: r.name,
    type: r.type,
    value: r.value,
    priority: r.priority,
    ttl: r.ttl,
  }));
}

export const resendDomainsClient = {
  /**
   * Register a custom domain with Resend. Returns the resource id plus
   * the DNS records the user must publish.
   */
  async create(domain: string): Promise<ResendDomainResponse> {
    const key = apiKey();
    if (!key) throw new ResendNotConfiguredError();

    const res = await fetch(RESEND_DOMAINS_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: domain, region: 'us-east-1' }),
    });

    const data = (await res.json().catch(() => ({}))) as {
      id?: string;
      name?: string;
      status?: ResendDomainStatus;
      records?: ResendDomainRecordRaw[];
      message?: string;
    };

    if (!res.ok) {
      throw new Error(
        data.message ?? `Resend domain API returned ${res.status}`,
      );
    }

    return {
      id: data.id!,
      name: data.name ?? domain,
      status: data.status ?? 'pending',
      records: normalizeRecords(data.records),
    };
  },

  /**
   * Fetch the current verification status of a registered domain.
   */
  async get(domainId: string): Promise<ResendDomainResponse> {
    const key = apiKey();
    if (!key) throw new ResendNotConfiguredError();

    const res = await fetch(`${RESEND_DOMAINS_URL}/${domainId}`, {
      method: 'GET',
      headers: { authorization: `Bearer ${key}` },
    });

    const data = (await res.json().catch(() => ({}))) as {
      id?: string;
      name?: string;
      status?: ResendDomainStatus;
      records?: ResendDomainRecordRaw[];
      message?: string;
    };

    if (!res.ok) {
      throw new Error(
        data.message ?? `Resend domain API returned ${res.status}`,
      );
    }

    return {
      id: data.id ?? domainId,
      name: data.name ?? '',
      status: data.status ?? 'pending',
      records: normalizeRecords(data.records),
    };
  },

  /**
   * Remove a registered domain from Resend. Best-effort: failures are
   * logged but never block the caller.
   */
  async remove(domainId: string): Promise<boolean> {
    const key = apiKey();
    if (!key) return false;

    try {
      const res = await fetch(`${RESEND_DOMAINS_URL}/${domainId}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${key}` },
      });
      return res.ok;
    } catch (err) {
      console.error(`[resend-domains] Remove failed for ${domainId}:`, err);
      return false;
    }
  },
};