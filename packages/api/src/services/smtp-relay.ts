/**
 * Outbound email delivery via Resend HTTP API.
 *
 * Configure with SMTP_HOST / SMTP_USER / SMTP_PASS env vars.
 * If SMTP_HOST is not set, delivery is skipped (emails are stored but not sent).
 */

const RESEND_API_URL = 'https://api.resend.com/emails';

export interface SendOptions {
  from: string;
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  inReplyTo?: string;
}

export async function deliverEmail(opts: SendOptions): Promise<{ delivered: boolean; messageId?: string; error?: string }> {
  const apiKey = process.env.SMTP_PASS;
  if (!apiKey) {
    console.log('[smtp-relay] No SMTP_PASS configured — email stored but not delivered');
    return { delivered: false, error: 'SMTP relay not configured' };
  }

  const from = process.env.SMTP_FROM ?? opts.from;
  const to = Array.isArray(opts.to) ? opts.to : [opts.to];

  try {
    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to,
        subject: opts.subject,
        text: opts.text,
        html: opts.html,
        reply_to: opts.from,
      }),
    });

    const data = await res.json().catch(() => ({})) as { id?: string; message?: string };

    if (!res.ok) {
      console.error(`[smtp-relay] Resend API error ${res.status}:`, data.message ?? data);
      return { delivered: false, error: data.message ?? `Resend API returned ${res.status}` };
    }

    console.log(`[smtp-relay] Delivered via Resend: ${data.id} (from: ${from})`);
    return { delivered: true, messageId: data.id };
  } catch (err) {
    console.error('[smtp-relay] Delivery failed:', err);
    return { delivered: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

export function isSmtpConfigured(): boolean {
  return !!process.env.SMTP_PASS;
}
