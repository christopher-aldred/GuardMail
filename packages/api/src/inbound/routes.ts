/**
 * Inbound email endpoint — internal only.
 *
 * Called by the `smtp-server` package (or any external mail ingress)
 * after it has parsed a received message. Resolves each recipient to a
 * user via their custom email address, creates an `Email` row, and
 * enqueues it for the security processing pipeline.
 *
 * Protected by `INTERNAL_API_KEY` (header `x-internal-key`).
 */
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import type { ApiResponse } from '@guardmail/shared';
import { emailRepository, userRepository, attachmentRepository } from '../db';
import { emailQueue } from '../services/email-queue';
import { isReservedCustomEmail } from '../services/reserved-addresses';
import { getAdminForwardEmail, forwardToAdmin } from '../services/admin-forward';

export const inboundRoutes = new Hono();

const MAX_ATTACHMENT_BYTES = Number(process.env.MAX_ATTACHMENT_SIZE_MB ?? 25) * 1024 * 1024;
// Base64 encoding expands bytes by ~4/3, so allow ~137% of the raw cap.
const MAX_ATTACHMENT_B64 = Math.ceil(MAX_ATTACHMENT_BYTES * 1.37);

const inboundAttachmentSchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(127).default('application/octet-stream'),
  size: z.number().int().min(0).max(MAX_ATTACHMENT_BYTES),
  content: z.string().max(MAX_ATTACHMENT_B64), // Base64-encoded bytes
});

const inboundSchema = z.object({
  from: z.string().email(),
  to: z.array(z.string().email()).min(1).max(50),
  subject: z.string().max(500).default(''),
  body: z.string().max(500_000).default(''),
  bodyHtml: z.string().max(1_000_000).optional(),
  messageId: z.string().max(500).optional(),
  attachments: z.array(inboundAttachmentSchema).max(50).default([]),
});

/** Simple internal-key guard. */
inboundRoutes.use('*', async (c, next) => {
  const internalKey = process.env.INTERNAL_API_KEY ?? '';
  if (!internalKey) {
    throw new HTTPException(503, { message: 'INTERNAL_API_KEY not configured' });
  }
  const key = c.req.header('x-internal-key');
  if (key !== internalKey) {
    throw new HTTPException(401, { message: 'Invalid internal key' });
  }
  await next();
});

// POST /api/inbound
inboundRoutes.post('/', async (c) => {
  const parsed = inboundSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? 'Invalid input' });
  }
  const { from, to, subject, body, bodyHtml, messageId, attachments } = parsed.data;

  const created: { emailId: string; recipient: string }[] = [];
  const rejected: string[] = [];
  const forwarded: string[] = [];

  for (const recipient of to) {
    const addr = recipient.toLowerCase();

    // Reserved service addresses have no user mailbox; forward to admin.
    if (isReservedCustomEmail(addr) && getAdminForwardEmail()) {
      try {
        await forwardToAdmin({
          from,
          to: [recipient],
          subject,
          body,
          bodyHtml,
        });
        forwarded.push(addr);
      } catch (err) {
        console.error(`[inbound] Admin forward failed for ${addr}:`, err);
      }
      continue;
    }

    const user = await userRepository.findByCustomEmail(addr);
    if (!user) {
      rejected.push(recipient);
      continue;
    }
    const email = await emailRepository.create({
      userId: user.id,
      from,
      to: [recipient],
      subject,
      body,
      bodyHtml,
      status: 'scanning', // hold until scan completes, then route to inbox/spam/quarantine
      inReplyTo: messageId ?? undefined,
      threadId: uuid(),
    });

    // Persist attachments (Base64 bytes from the SMTP server's
    // mailparser output) so ClamAV can scan the actual content.
    for (const att of attachments) {
      await attachmentRepository.create({
        emailId: email!.id,
        filename: att.filename,
        mimeType: att.mimeType,
        size: att.size,
        storagePath: '',
        content: att.content,
      });
    }
    await emailQueue.enqueue({
      emailId: email!.id,
      userId: user.id,
      receivedAt: new Date(),
      source: 'smtp',
    });
    created.push({ emailId: email!.id, recipient });
  }

  const body2: ApiResponse<{ created: typeof created; rejected: string[]; forwarded: string[] }> = {
    success: true,
    data: { created, rejected, forwarded },
  };
  // 202 Accepted — message received and queued, processing async.
  return c.json(body2, 202);
});