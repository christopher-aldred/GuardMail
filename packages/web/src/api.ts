/**
 * API client for the Guardmail web UI. Thin fetch wrapper that injects
 * the JWT from localStorage and unwraps the ApiResponse envelope.
 */
import type { ApiResponse } from '@guardmail/shared';

const BASE =
  (typeof window !== 'undefined' && (window as unknown as { __GUARDMAIL_API_URL__?: string }).__GUARDMAIL_API_URL__) ||
  'http://localhost:3000';

function token() {
  return localStorage.getItem('guardmail_token') ?? '';
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token() ? { authorization: `Bearer ${token()}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as ApiResponse<T>;
  if (!res.ok || !json.success) {
    throw new Error(json.error?.message ?? `Request failed (${res.status})`);
  }
  return json.data as T;
}

export const api = {
  register: (i: { username: string; email: string; password: string }) =>
    req<{ user: { id: string; username: string; customEmail: string; role: string }; token: string; customEmail: string }>('POST', '/api/auth/register', i),
  login: (i: { username: string; password: string }) =>
    req<{ user: { id: string; username: string; customEmail: string; role: string }; token: string }>('POST', '/api/auth/login', i),
  deleteAccount: (password: string) =>
    req<{ message: string }>('DELETE', '/api/auth/account', { password }),
  listInbox: (limit = 50, offset = 0) => req<unknown[]>('GET', `/api/emails/inbox?limit=${limit}&offset=${offset}`),
  listSent: (limit = 50, offset = 0) => req<unknown[]>('GET', `/api/emails/sent?limit=${limit}&offset=${offset}`),
  listPending: (limit = 50, offset = 0) => req<unknown[]>('GET', `/api/emails/pending?limit=${limit}&offset=${offset}`),
  listSpam: (limit = 50, offset = 0) => req<unknown[]>('GET', `/api/emails/spam?limit=${limit}&offset=${offset}`),
  listQuarantine: (limit = 50, offset = 0) => req<unknown[]>('GET', `/api/emails/quarantine?limit=${limit}&offset=${offset}`),
  listScanning: (limit = 50, offset = 0) => req<unknown[]>('GET', `/api/emails/scanning?limit=${limit}&offset=${offset}`),
  getEmail: (id: string) => req<unknown>('GET', `/api/emails/${id}`),
  sendEmail: (i: { to: string[]; subject: string; body: string; bodyHtml?: string }) =>
    req<{ id: string; status: string }>('POST', '/api/emails/send', i),
  deleteEmail: (id: string) => req<null>('DELETE', `/api/emails/${id}`),
  getSpamSettings: () => req<unknown>('GET', '/api/settings/spam'),
  updateSpamSettings: (i: unknown) => req<unknown>('PUT', '/api/settings/spam', i),
  getSecuritySettings: () => req<{ llmGuardOutboundEnabled: boolean }>('GET', '/api/settings/security'),
  updateSecuritySettings: (i: { llmGuardOutboundEnabled: boolean }) => req<{ llmGuardOutboundEnabled: boolean }>('PUT', '/api/settings/security', i),
  getApiKey: () => req<{ apiKey: string | null }>('GET', '/api/settings/api-key'),
  regenerateApiKey: () => req<{ apiKey: string }>('POST', '/api/settings/api-key/regenerate'),
  getCustomDomain: () =>
    req<{
      domain: string;
      status: 'pending' | 'verified' | 'rejected';
      resendId?: string | null;
      records?: { record: string; name: string; type: string; value: string; priority?: number; ttl?: number }[] | null;
      verifiedAt?: string | null;
      createdAt?: string | null;
    } | null>('GET', '/api/settings/domain'),
  setCustomDomain: (domain: string) =>
    req<{
      domain: string;
      status: 'pending' | 'verified' | 'rejected';
      resendId: string;
      records: { record: string; name: string; type: string; value: string; priority?: number; ttl?: number }[];
      verifiedAt: string | null;
      createdAt: string;
    }>('POST', '/api/settings/domain', { domain }),
  verifyCustomDomain: () =>
    req<{
      domain: string;
      status: 'pending' | 'verified' | 'rejected';
      resendId?: string | null;
      records?: { record: string; name: string; type: string; value: string; priority?: number; ttl?: number }[] | null;
      verifiedAt?: string | null;
      createdAt?: string | null;
    }>('POST', '/api/settings/domain/verify'),
  removeCustomDomain: () =>
    req<{ message: string }>('DELETE', '/api/settings/domain'),
  getSubscription: () =>
    req<{
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
    }>('GET', '/api/settings/subscription'),
  startCheckout: (tier: string) =>
    req<{ url: string }>('POST', '/api/settings/billing/checkout', { tier }),
  openBillingPortal: () =>
    req<{ url: string }>('POST', '/api/settings/billing/portal'),
  forgotPassword: (email: string) => req<{ message: string }>('POST', '/api/auth/forgot-password', { email }),
  resetPassword: (token: string, password: string) => req<{ message: string }>('POST', '/api/auth/reset-password', { token, password }),
  verifyEmail: (token: string) => req<{ message: string }>('POST', '/api/auth/verify-email', { token }),
  resendVerification: (email: string) => req<{ message: string }>('POST', '/api/auth/resend-verification', { email }),
  getAdminStats: () =>
    req<{
      totalUsers: number;
      uniqueLogins24h: number;
      emailsSent: number;
      emailsReceived: number;
      emailsSent24h: number;
      emailsReceived24h: number;
    }>('GET', '/api/admin/stats'),
  getAdminUsers: (page = 1, limit = 10) =>
    req<{
      users: {
        id: string;
        username: string;
        email: string;
        customEmail: string;
        tier: string;
        role: string;
        disabled: boolean;
        emailVerified: boolean;
        lastLoginAt: string | null;
        createdAt: string;
      }[];
      total: number;
      page: number;
      limit: number;
    }>('GET', `/api/admin/users?page=${page}&limit=${limit}`),
  getAdminLogins: (page = 1, limit = 10) =>
    req<{
      users: {
        id: string;
        username: string;
        email: string;
        customEmail: string;
        tier: string;
        role: string;
        disabled: boolean;
        emailVerified: boolean;
        lastLoginAt: string | null;
        createdAt: string;
      }[];
      total: number;
      page: number;
      limit: number;
    }>('GET', `/api/admin/logins?page=${page}&limit=${limit}`),
  getAdminEmailsSent: (page = 1, limit = 10) =>
    req<{
      emails: {
        id: string;
        userId: string;
        username: string;
        customEmail: string;
        from: string;
        to: string[];
        subject: string;
        status: string;
        createdAt: string;
      }[];
      total: number;
      page: number;
      limit: number;
    }>('GET', `/api/admin/emails/sent?page=${page}&limit=${limit}`),
  getAdminEmailsReceived: (page = 1, limit = 10) =>
    req<{
      emails: {
        id: string;
        userId: string;
        username: string;
        customEmail: string;
        from: string;
        to: string[];
        subject: string;
        status: string;
        createdAt: string;
      }[];
      total: number;
      page: number;
      limit: number;
    }>('GET', `/api/admin/emails/received?page=${page}&limit=${limit}`),
  adminDisableUser: (id: string) =>
    req<{ message: string }>('POST', `/api/admin/users/${id}/disable`),
  adminEnableUser: (id: string) =>
    req<{ message: string }>('POST', `/api/admin/users/${id}/enable`),
  adminDeleteUser: (id: string) =>
    req<{ message: string }>('DELETE', `/api/admin/users/${id}`),
};