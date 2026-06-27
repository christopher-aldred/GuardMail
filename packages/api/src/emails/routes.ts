/**
 * Email routes: inbox/spam/quarantine listing, send, get, delete.
 *
 * Security invariant: when the caller authenticated via an API key
 * (`auth.isApiKey`, i.e. an MCP consumer), unscanned email content is
 * NEVER exposed. See `isEmailScanned` / `redactEmailBody` in the
 * shared security module.
 */
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { v4 as uuid } from 'uuid';
import type { ApiResponse, EmailStatus, Tier } from '@guardmail/shared';
import { TIERS, isEmailScanned, isQuarantined, redactQuarantinedForMcp } from '@guardmail/shared';
import type { AuthEnv } from '../middleware/auth';
import {
  emailRepository,
  scanResultRepository,
  attachmentRepository,
} from '../db';
import { sendEmailSchema } from '../auth/schemas';
import { emailQueue } from '../services/email-queue';
import { isSmtpConfigured } from '../services/smtp-relay';

export const emailRoutes = new Hono<AuthEnv>();

// ---------------------------------------------------------------------------
// Send limits — driven by the user's subscription tier (see shared TIERS).
// ---------------------------------------------------------------------------

/**
 * Unverified Free accounts have a lifetime cap on sent emails so they
 * cannot abuse the mailbox before proving they control their address.
 */
const UNVERIFIED_LIFETIME_LIMIT = Number(process.env.UNVERIFIED_SEND_LIMIT ?? 100);

/** Returns the UTC midnight that begins the current day. */
function startOfTodayUtc(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Returns the UTC midnight that begins the current calendar month. */
function startOfMonthUtc(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/** Resolve the tier config for a user, falling back to Free. */
function tierOf(user: { tier?: Tier | null }) {
  return TIERS[(user.tier ?? 'free') as Tier] ?? TIERS.free;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a list response and, for MCP (API-key) callers, enforce the
 * "never expose unscanned content" invariant:
 *   - drop emails whose status is a holding/pending status, or that
 *     have no persisted scan results, and
 *   - redact the body of anything that still slips through.
 */
async function buildListResponse(
  auth: AuthEnv['Variables']['auth'],
  status: EmailStatus,
  limit: number,
  offset: number,
) {
  const rows = await emailRepository.listByUserStatus(auth.user.id, status, limit, offset);
  const scans = await scanResultRepository.listByEmails(rows.map((r) => r.id));
  const scansByEmail = new Map<string, typeof scans>();
  const countByEmail = new Map<string, number>();
  for (const s of scans) {
    if (!scansByEmail.has(s.emailId)) scansByEmail.set(s.emailId, []);
    scansByEmail.get(s.emailId)!.push(s);
    countByEmail.set(s.emailId, (countByEmail.get(s.emailId) ?? 0) + 1);
  }

  let data = rows.map((r) => ({
    ...r,
    scanResults: scansByEmail.get(r.id) ?? [],
  }));

  if (auth.isApiKey) {
    // NEVER expose unscanned email content to an MCP consumer. Drop any
    // email whose scan has not completed (holding status OR no persisted
    // scan results). Subject/sender are scanned too, so the whole record
    // is withheld rather than just the body.
    data = data.filter(
      (r) => isEmailScanned(r, countByEmail.get(r.id) ?? 0),
    );
    // Quarantined emails were flagged by LLM Guard / ClamAV and therefore
    // carry a prompt-injection (or other LLM-threat) payload in the
    // subject/body/html. Redact those fields before exposing to an MCP
    // consumer so the payload cannot enter the agent's context window.
    // Metadata (sender, date, scan verdict, risk score) is preserved.
    data = data.map((r) =>
      isQuarantined(r) ? redactQuarantinedForMcp(r) : r,
    );
  }
  return data;
}

// GET /api/emails/inbox
emailRoutes.get('/inbox', async (c) => {
  const auth = c.get('auth');
  const limit = Number(c.req.query('limit') ?? 50);
  const offset = Number(c.req.query('offset') ?? 0);
  const data = await buildListResponse(auth, 'inbox', limit, offset);
  const body: ApiResponse<typeof data> = { success: true, data };
  return c.json(body);
});

// GET /api/emails/scanning  (web UI only — MCP consumers never see this)
emailRoutes.get('/scanning', async (c) => {
  const auth = c.get('auth');
  if (auth.isApiKey) {
    // MCP consumers must never see emails that are still being scanned.
    const body: ApiResponse<never[]> = { success: true, data: [] };
    return c.json(body);
  }
  const limit = Number(c.req.query('limit') ?? 50);
  const offset = Number(c.req.query('offset') ?? 0);
  const data = await buildListResponse(auth, 'scanning', limit, offset);
  const body: ApiResponse<typeof data> = { success: true, data };
  return c.json(body);
});

// GET /api/emails/sent
emailRoutes.get('/sent', async (c) => {
  const auth = c.get('auth');
  const limit = Number(c.req.query('limit') ?? 50);
  const offset = Number(c.req.query('offset') ?? 0);
  const data = await buildListResponse(auth, 'sent', limit, offset);
  const body: ApiResponse<typeof data> = { success: true, data };
  return c.json(body);
});

// GET /api/emails/pending  (web UI only — MCP consumers never see this)
emailRoutes.get('/pending', async (c) => {
  const auth = c.get('auth');
  if (auth.isApiKey) {
    const body: ApiResponse<never[]> = { success: true, data: [] };
    return c.json(body);
  }
  const limit = Number(c.req.query('limit') ?? 50);
  const offset = Number(c.req.query('offset') ?? 0);
  const data = await buildListResponse(auth, 'pending', limit, offset);
  const body: ApiResponse<typeof data> = { success: true, data };
  return c.json(body);
});

// GET /api/emails/spam
emailRoutes.get('/spam', async (c) => {
  const auth = c.get('auth');
  const limit = Number(c.req.query('limit') ?? 50);
  const offset = Number(c.req.query('offset') ?? 0);
  const data = await buildListResponse(auth, 'spam', limit, offset);
  const body: ApiResponse<typeof data> = { success: true, data };
  return c.json(body);
});

// GET /api/emails/quarantine
emailRoutes.get('/quarantine', async (c) => {
  const auth = c.get('auth');
  const limit = Number(c.req.query('limit') ?? 50);
  const offset = Number(c.req.query('offset') ?? 0);
  const data = await buildListResponse(auth, 'quarantine', limit, offset);
  const body: ApiResponse<typeof data> = { success: true, data };
  return c.json(body);
});

// GET /api/emails/:id
emailRoutes.get('/:id', async (c) => {
  const auth = c.get('auth');
  const email = await emailRepository.findById(c.req.param('id'));
  if (!email) throw new HTTPException(404, { message: 'Email not found' });
  if (email.userId !== auth.user.id) throw new HTTPException(403, { message: 'Forbidden' });

  const scans = await scanResultRepository.listByEmail(email.id);
  const attachments = await attachmentRepository.listByEmail(email.id);

  // MCP consumers must never receive unscanned email content.
  if (auth.isApiKey && !isEmailScanned(email, scans.length)) {
    throw new HTTPException(403, {
      message:
        'Email is still being scanned and is not yet available. Please try again once scanning completes.',
    });
  }

  // Quarantined emails carry the very prompt-injection payload LLM Guard
  // flagged; redact it before exposing to an MCP consumer. Metadata the
  // agent legitimately needs (sender, date, scan verdict, risk score) is
  // preserved so the user can still see *that* an email was quarantined
  // and why, without reading the injection itself.
  const payload =
    auth.isApiKey && isQuarantined(email) ? redactQuarantinedForMcp(email) : email;
  const data = { ...payload, scanResults: scans, attachments };
  const body: ApiResponse<typeof data> = { success: true, data };
  return c.json(body);
});

// DELETE /api/emails/:id
emailRoutes.delete('/:id', async (c) => {
  const auth = c.get('auth');
  const email = await emailRepository.findById(c.req.param('id'));
  if (!email) throw new HTTPException(404, { message: 'Email not found' });
  if (email.userId !== auth.user.id) throw new HTTPException(403, { message: 'Forbidden' });

  await emailRepository.delete(email.id);
  const body: ApiResponse<null> = { success: true, data: null };
  return c.json(body);
});

// POST /api/emails/send
emailRoutes.post('/send', async (c) => {
  const auth = c.get('auth');
  const parsed = sendEmailSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? 'Invalid input' });
  }
  const { to, subject, body, bodyHtml, inReplyTo } = parsed.data;

  // --- Enforce sending limits (tier-based) -----------------------------
  const verified = !!auth.user.emailVerifiedAt;
  if (!verified) {
    const sentLifetime = await emailRepository.countOutboundByUser(auth.user.id);
    if (sentLifetime >= UNVERIFIED_LIFETIME_LIMIT) {
      throw new HTTPException(403, {
        message:
          `You have reached the ${UNVERIFIED_LIFETIME_LIMIT}-email sending limit for unverified accounts. ` +
          'Verify your email address to send up to your plan’s daily limit.',
      });
    }
  }

  const tier = tierOf(auth.user);
  const sentToday = await emailRepository.countByUser(
    auth.user.id,
    startOfTodayUtc(),
  );
  if (sentToday >= tier.dailyLimit) {
    throw new HTTPException(429, {
      message: `Daily email limit (${tier.dailyLimit} emails/day on the ${tier.name} plan, sent + received) reached. Try again tomorrow.`,
    });
  }
  if (tier.monthlyLimit !== null) {
    const sentThisMonth = await emailRepository.countByUser(
      auth.user.id,
      startOfMonthUtc(),
    );
    if (sentThisMonth >= tier.monthlyLimit) {
      throw new HTTPException(429, {
        message: `Monthly email limit (${tier.monthlyLimit} emails/month on the ${tier.name} plan, sent + received) reached. Upgrade your plan to send more.`,
      });
    }
  }

  // Create the email with 'pending' status — will become 'sent' after scan+delivery.
  const email = await emailRepository.create({
    userId: auth.user.id,
    from: auth.user.customEmail,
    to,
    subject,
    body,
    bodyHtml,
    status: 'pending',
    inReplyTo,
    threadId: inReplyTo ?? uuid(),
  });

  // Enqueue for background processing (LLM Guard scan + spam filter + delivery).
  await emailQueue.enqueue({
    emailId: email!.id,
    userId: auth.user.id,
    receivedAt: new Date(),
    source: 'api',
  });

  // For local/inline testing, process immediately if no worker is running.
  if (process.env.EMAIL_INLINE_PROCESS === '1') {
    import('../services/email-processor').then((m) =>
      m.processEmail(email!.id).catch((e: unknown) => console.error('[send] inline process failed:', e)),
    );
  }

  const body2: ApiResponse<{ id: string; status: string; smtpConfigured: boolean }> = {
    success: true,
    data: { id: email!.id, status: 'pending', smtpConfigured: isSmtpConfigured() },
  };
  return c.json(body2, 201);
});
