/**
 * MCP resource handlers for Guardmail.
 *
 * Resources expose mailboxes as URIs an LLM agent can read:
 *   guardmail://inbox
 *   guardmail://spam
 *   guardmail://quarantine
 *   guardmail://settings/spam
 *
 * Security invariant: unscanned email content is never exposed to an
 * MCP consumer. The list helpers below drop/redact any email whose
 * security scan has not completed.
 */
import { isEmailScanned, isQuarantined, redactQuarantinedForMcp, type EmailStatus } from '@guardmail/shared';
import type { ApiClient } from '../api-client';

type EmailLike = {
  status?: string;
  scanResults?: unknown[];
};

function scanCount(e: EmailLike): number {
  return Array.isArray(e.scanResults) ? e.scanResults.length : 0;
}

function filterUnscannedList(emails: unknown): unknown {
  if (!Array.isArray(emails)) return emails;
  // NEVER expose unscanned email content to an MCP consumer.
  return (emails as EmailLike[]).filter((e) =>
    isEmailScanned(e as { status: EmailStatus }, scanCount(e)),
  );
}

/**
 * Defense-in-depth for the MCP layer: redact quarantined email content
 * so the prompt-injection payload LLM Guard flagged cannot enter an
 * LLM agent's context window. Metadata is preserved.
 */
function redactQuarantinedList(emails: unknown): unknown {
  if (!Array.isArray(emails)) return emails;
  return (emails as EmailLike[]).map((e) =>
    isQuarantined(e as { status: EmailStatus })
      ? redactQuarantinedForMcp(e as { subject: string; body: string; bodyHtml?: string | null })
      : e,
  );
}

export interface ResourceDef {
  uri: string;
  description: string;
  mimeType: string;
  read: (client: ApiClient) => Promise<string>;
}

export const resources: ResourceDef[] = [
  {
    uri: 'guardmail://inbox',
    description: "The authenticated user's inbox with security scan status.",
    mimeType: 'application/json',
    read: async (c) => JSON.stringify(redactQuarantinedList(filterUnscannedList(await c.listInbox()))),
  },
  {
    uri: 'guardmail://spam',
    description: 'Emails flagged as spam by the spam filter.',
    mimeType: 'application/json',
    read: async (c) => JSON.stringify(redactQuarantinedList(filterUnscannedList(await c.listSpam()))),
  },
  {
    uri: 'guardmail://quarantine',
    description: 'Emails quarantined by LLM Guard or ClamAV.',
    mimeType: 'application/json',
    read: async (c) => JSON.stringify(redactQuarantinedList(filterUnscannedList(await c.listQuarantine()))),
  },
  {
    uri: 'guardmail://settings/spam',
    description: 'The authenticated user\'s spam filter configuration.',
    mimeType: 'application/json',
    read: async (c) => JSON.stringify(await c.getSpamSettings()),
  },
  {
    uri: 'guardmail://settings/security',
    description:
      'The authenticated user\'s security settings (outbound LLM Guard toggle).',
    mimeType: 'application/json',
    read: async (c) => JSON.stringify(await c.getSecuritySettings()),
  },
  {
    uri: 'guardmail://subscription',
    description:
      'The authenticated user\'s subscription tier and email quota usage (monthly/daily limits + current sent/received counts). Useful for an agent to check remaining quota before sending.',
    mimeType: 'application/json',
    read: async (c) => JSON.stringify(await c.getSubscription()),
  },
];
