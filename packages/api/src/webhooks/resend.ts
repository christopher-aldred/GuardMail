/**
 * Resend inbound email webhook.
 *
 * Resend forwards incoming emails as POST requests to this endpoint.
 * Configure the webhook URL in Resend dashboard → Webhooks.
 *
 * Authenticated via Svix signature verification (svix-signature header)
 * using the RESEND_WEBHOOK_SECRET (signing secret from Resend dashboard).
 */
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { createHmac } from 'node:crypto';
import { v4 as uuid } from 'uuid';
import type { ApiResponse } from '@guardmail/shared';
import { emailRepository, userRepository, attachmentRepository } from '../db';
import { emailQueue } from '../services/email-queue';
import { isReservedCustomEmail } from '../services/reserved-addresses';
import { getAdminForwardEmail, forwardToAdmin } from '../services/admin-forward';

// Store raw body between middleware and route handler
let cachedRawBody: string | null = null;

export const resendWebhookRoutes = new Hono();

/**
 * Verify Svix webhook signature.
 * https://docs.svix.com/receiving/verifying-payloads/how-to-manually-verify-a-payload
 */
function verifySvixSignature(
  body: string,
  svixId: string,
  svixTimestamp: string,
  svixSignature: string,
  secret: string,
): boolean {
  try {
    const rawSecret = secret.startsWith('whsec_') ? secret.slice(6) : secret;
    const key = Buffer.from(rawSecret, 'base64');

    const signedContent = `${svixId}.${svixTimestamp}.${body}`;
    const computedSig = createHmac('sha256', key).update(signedContent).digest('base64');

    const signatures = svixSignature.split(' ').map((s) => {
      const parts = s.split(',');
      return parts.length > 1 ? parts[1] : s;
    });

    return signatures.some((sig) => sig === computedSig);
  } catch {
    return false;
  }
}

/**
 * Fetch the full email object from the Resend API.
 *
 * Resend's inbound webhook payload only includes metadata (from, to,
 * subject, message_id, etc.) — it does NOT include the email body
 * (text/html) or headers.  To get the full content we must call
 * GET https://api.resend.com/emails/receiving/{email_id} using the
 * Resend API key.
 *
 * Note: outbound emails use GET /emails/{id}, but inbound (received)
 * emails require the /emails/receiving/{id} endpoint.
 *
 * The response looks like:
 * {
 *   "object": "email",
 *   "id": "...",
 *   "from": "...",
 *   "to": ["..."],
 *   "subject": "...",
 *   "text": "Ignore all previous instructions\n",
 *   "html": "",
 *   "headers": { ... },
 *   "attachments": [ ... ],
 *   ...
 * }
 */
interface ResendEmailObject {
  text?: string;
  html?: string;
  headers?: Record<string, string>;
  attachments?: Array<{
    filename?: string;
    name?: string;
    content_type?: string;
    mimeType?: string;
    size?: number;
    content?: string;
    url?: string;
    download_url?: string;
  }>;
}

async function fetchEmailFromResend(
  emailId: string,
): Promise<ResendEmailObject | null> {
  // Prefer a dedicated RESEND_API_KEY; fall back to SMTP_PASS which is
  // also the Resend API key in this project's configuration.
  const apiKey = process.env.RESEND_API_KEY ?? process.env.SMTP_PASS;
  if (!apiKey) {
    console.warn(
      '[resend-webhook] RESEND_API_KEY / SMTP_PASS not configured — cannot fetch email body',
    );
    return null;
  }

  try {
    const res = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
      method: 'GET',
      headers: { authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      console.warn(
        `[resend-webhook] Resend API returned ${res.status} for email ${emailId}`,
      );
      return null;
    }
    return (await res.json()) as ResendEmailObject;
  } catch (err) {
    console.warn(`[resend-webhook] Failed to fetch email ${emailId} from Resend API:`, err);
    return null;
  }
}

/** Auth guard — verify the Svix webhook signature. */
resendWebhookRoutes.use('*', async (c, next) => {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    throw new HTTPException(503, { message: 'RESEND_WEBHOOK_SECRET not configured' });
  }

  const svixId = c.req.header('svix-id');
  const svixTimestamp = c.req.header('svix-timestamp');
  const svixSignature = c.req.header('svix-signature');

  // If Svix headers are present, verify the signature
  if (svixId && svixTimestamp && svixSignature) {
    cachedRawBody = await c.req.text();
    const valid = verifySvixSignature(cachedRawBody, svixId, svixTimestamp, svixSignature, secret);
    if (!valid) {
      console.warn('[resend-webhook] Invalid Svix signature');
      throw new HTTPException(401, { message: 'Invalid webhook signature' });
    }
  } else {
    // Fallback: allow query-param secret only in non-production for
    // manual testing. In production this would let a leaked secret
    // travel in URLs/logs and enable webhook forgery.
    if (process.env.NODE_ENV === 'production') {
      throw new HTTPException(401, { message: 'Missing Svix signature headers' });
    }
    const querySecret = c.req.query('secret');
    if (querySecret !== secret) {
      throw new HTTPException(401, { message: 'Missing Svix headers or invalid secret' });
    }
    cachedRawBody = null;
  }

  await next();
});

// POST /api/webhooks/resend
resendWebhookRoutes.post('/', async (c) => {
  const body = cachedRawBody
    ? JSON.parse(cachedRawBody)
    : await c.req.json().catch(() => null);

  cachedRawBody = null;

  if (!body) {
    throw new HTTPException(400, { message: 'Invalid JSON payload' });
  }

  // Resend webhook payload: { type: "email.received", data: { ... } }
  const emailData = body.data ?? body.email ?? body;

  const from: string = emailData?.from ?? emailData?.sender ?? emailData?.envelope?.from ?? '';
  const toRaw = emailData?.to ?? emailData?.recipients ?? emailData?.envelope?.to ?? [];
  const to: string[] = Array.isArray(toRaw)
    ? toRaw
    : typeof toRaw === 'string'
      ? [toRaw]
      : [];
  const subject: string = emailData?.subject ?? '(no subject)';

  // Resend inbound webhook payloads do NOT include the email body (text/html)
  // or attachments — only metadata. Fetch the full email object from the
  // Resend API to get the body content needed for LLM Guard scanning.
  const resendEmailId: string | undefined = emailData?.email_id ?? emailData?.id;
  let textBody: string = emailData?.text ?? emailData?.body ?? emailData?.text_body ?? emailData?.content ?? '';
  let htmlBody: string | undefined = emailData?.html ?? emailData?.html_body;
  let rawAttachments = emailData?.attachments ?? [];
  let emailHeaders: Record<string, string> | undefined = emailData?.headers;

  if (!textBody && !htmlBody && resendEmailId) {
    console.log(`[resend-webhook] Fetching full email from Resend API: ${resendEmailId}`);
    const fullEmail = await fetchEmailFromResend(resendEmailId);
    if (fullEmail) {
      textBody = fullEmail.text ?? '';
      htmlBody = fullEmail.html ?? undefined;
      emailHeaders = fullEmail.headers ?? emailHeaders;
      if (fullEmail.attachments) {
        rawAttachments = fullEmail.attachments;
      }
      console.log(
        `[resend-webhook] Fetched email body: text=${textBody.length} chars, html=${htmlBody?.length ?? 0} chars`,
      );
    } else {
      console.warn(
        `[resend-webhook] Could not fetch email body from Resend API — email will be stored with empty body`,
      );
    }
  }

  if (!from || to.length === 0) {
    console.warn('[resend-webhook] Missing from or to fields', { from, to, keys: Object.keys(emailData) });
    return c.json({ success: true, data: { created: [], rejected: [], note: 'Missing from/to fields' } }, 200);
  }

  console.log(`[resend-webhook] Inbound email from ${from} to ${to.join(', ')}: ${subject}`);

  const created: { emailId: string; recipient: string }[] = [];
  const rejected: string[] = [];
  const forwarded: string[] = [];

  for (const recipient of to) {
    const emailMatch = recipient.match(/<([^>]+)>/);
    const emailAddr = (emailMatch ? emailMatch[1] : recipient).toLowerCase().trim();

    // Reserved service addresses (help/contact/info/support/…) have no
    // user mailbox. Forward them straight to the admin instead of
    // relying on the processing pipeline (which only runs for emails
    // owned by a registered user).
    if (isReservedCustomEmail(emailAddr) && getAdminForwardEmail()) {
      try {
        await forwardToAdmin({
          from,
          to: [recipient],
          subject,
          body: textBody,
          bodyHtml: htmlBody,
        });
        forwarded.push(emailAddr);
      } catch (err) {
        console.error(`[resend-webhook] Admin forward failed for ${emailAddr}:`, err);
      }
      continue;
    }

    const user = await userRepository.findByCustomEmail(emailAddr);
    if (!user) {
      rejected.push(emailAddr);
      continue;
    }

    const email = await emailRepository.create({
      userId: user.id,
      from,
      to: [recipient],
      subject,
      body: textBody,
      bodyHtml: htmlBody,
      status: 'scanning', // hold until scan completes, then route to inbox/spam/quarantine
      inReplyTo: undefined, // message_id is not a UUID, don't use as inReplyTo
      threadId: uuid(),
    });

    // Save attachments metadata
    for (const att of rawAttachments) {
      await attachmentRepository.create({
        emailId: email!.id,
        filename: att.filename || att.name || 'unnamed',
        mimeType: att.content_type || att.mimeType || 'application/octet-stream',
        size: att.size || att.content?.length || 0,
        storagePath: att.url || att.download_url || '', // URL or empty if inline
      });
    }

    await emailQueue.enqueue({
      emailId: email!.id,
      userId: user.id,
      receivedAt: new Date(),
      source: 'smtp',
    });

    created.push({ emailId: email!.id, recipient: emailAddr });
    console.log(`[resend-webhook] Created email ${email!.id} for ${emailAddr}`);
  }

  const response: ApiResponse<{ created: typeof created; rejected: string[]; forwarded: string[] }> = {
    success: true,
    data: { created, rejected, forwarded },
  };
  return c.json(response, 202);
});
