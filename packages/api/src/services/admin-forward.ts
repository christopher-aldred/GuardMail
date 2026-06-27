/**
 * Admin email forwarding.
 *
 * Forwards a copy of inbound emails that are **received at** one of the
 * configured support/mailbox addresses (e.g. help@aiguard.email) to the
 * admin's personal email, so the project owner has visibility into all
 * mail sent to those addresses even when it lands in a user's mailbox.
 *
 * Configuration (env vars):
 *   ADMIN_FORWARD_EMAIL      — destination admin email (e.g. chris@aldred.dev).
 *                             When unset, forwarding is disabled entirely.
 *   FORWARD_FROM_ADDRESSES   — comma-separated list of mailbox addresses
 *                             whose *received* mail triggers forwarding.
 *                             Defaults to the project's support addresses.
 *                             (Name kept for backwards compatibility; these
 *                             are the addresses mail arrives *for*, not from.)
 *
 * Forwarding uses the existing Resend relay (`deliverEmail`), so it only
 * fires when SMTP_PASS is configured. Forwarded messages carry the
 * original subject/body (no attachments are re-sent) and are sent from
 * the project's SMTP_FROM address with reply_to set to the original
 * sender, so the admin can reply directly.
 */
import { deliverEmail } from './smtp-relay';

/**
 * Default mailbox addresses whose received inbound email is forwarded
 * to the admin.
 */
const DEFAULT_FORWARD_MAILBOXES = [
  'help@aiguard.email',
  'contact@aiguard.email',
  'info@aiguard.info',
  'support@aiguard.email',
];

/** Parse the FORWARD_FROM_ADDRESSES env var into a lowercased set. */
function getForwardMailboxes(): Set<string> {
  const raw = process.env.FORWARD_FROM_ADDRESSES;
  if (!raw) return new Set(DEFAULT_FORWARD_MAILBOXES);
  const list = raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return new Set(list.length > 0 ? list : DEFAULT_FORWARD_MAILBOXES);
}

/** The admin destination email, or null if forwarding is disabled. */
export function getAdminForwardEmail(): string | null {
  const addr = process.env.ADMIN_FORWARD_EMAIL?.trim();
  return addr || null;
}

/** Extract a bare email address from "Name <addr@domain>" or "addr@domain". */
function bareAddress(value: string): string {
  const normalized = value.trim().toLowerCase();
  const match = normalized.match(/<([^>]+)>/);
  return match ? match[1] : normalized;
}

/**
 * True when any recipient of the email is one of the configured support
 * mailbox addresses. Forwards are triggered by *who the email was sent
 * to*, not who sent it.
 */
export function shouldForwardToAdmin(to: string[]): boolean {
  if (!getAdminForwardEmail()) return false;
  const mailboxes = getForwardMailboxes();
  return to.some((recipient) => mailboxes.has(bareAddress(recipient)));
}

export interface ForwardableEmail {
  from: string;
  to: string[];
  subject: string;
  body: string;
  bodyHtml?: string;
}

/**
 * Forward a copy of `email` to the configured admin address.
 * Returns the delivery result. No-op (delivered: false) when forwarding
 * is disabled or the relay is not configured.
 */
export async function forwardToAdmin(
  email: ForwardableEmail,
): Promise<{ forwarded: boolean; error?: string }> {
  const adminEmail = getAdminForwardEmail();
  if (!adminEmail) return { forwarded: false, error: 'Admin forwarding not configured' };

  const forwardFrom = process.env.SMTP_FROM ?? 'help@aiguard.email';
  const prefix = email.subject.toLowerCase().startsWith('fwd:') ? '' : 'Fwd: ';
  const subject = `${prefix}${email.subject || '(no subject)'}`;

  const header = [
    `---------- Forwarded message ----------`,
    `From: ${email.from}`,
    `To: ${email.to.join(', ')}`,
    `Subject: ${email.subject || '(no subject)'}`,
    ``,
  ].join('\n');

  const text = `${header}${email.body || ''}`;

  const htmlHeader = [
    `<div style="font-family:sans-serif">`,
    `<div style="color:#64748b;font-size:13px;margin-bottom:16px;padding:8px 0;border-bottom:1px solid #e2e8f0">`,
    `<div><strong>From:</strong> ${escapeHtml(email.from)}</div>`,
    `<div><strong>To:</strong> ${escapeHtml(email.to.join(', '))}</div>`,
    `<div><strong>Subject:</strong> ${escapeHtml(email.subject || '(no subject)')}</div>`,
    `</div>`,
  ].join('');
  const htmlFooter = `</div>`;
  const htmlBody = email.bodyHtml
    ? `${htmlHeader}<div>${email.bodyHtml}</div>${htmlFooter}`
    : `${htmlHeader}<pre style="white-space:pre-wrap;font-family:sans-serif">${escapeHtml(email.body || '')}</pre>${htmlFooter}`;

  const result = await deliverEmail({
    from: forwardFrom,
    to: adminEmail,
    subject,
    text,
    html: htmlBody,
    inReplyTo: undefined,
  });

  if (result.delivered) {
    console.log(`[admin-forward] Forwarded email to ${email.to.join(', ')} → ${adminEmail}`);
  } else {
    console.warn(`[admin-forward] Failed to forward to ${adminEmail}: ${result.error}`);
  }

  return { forwarded: result.delivered, error: result.error };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}