/**
 * Attachment download routes.
 *
 * Exposes two endpoints:
 *
 *   POST /api/attachments/:id/download-url
 *     — Authenticated (JWT or API key). Verifies the caller owns the
 *       email the attachment belongs to, then mints a short-lived
 *       HMAC-signed download URL and returns it (plus attachment
 *       metadata). This is the endpoint MCP agents call via the
 *       `get_attachment_url` tool.
 *
 *   GET  /api/attachments/:id/download?exp=<unix>&sig=<hex>
 *     — Public (no auth header), but gated by the signed token minted
 *       above. Validates `exp` has not elapsed and the HMAC signature
 *       matches, then streams the attachment bytes (Base64-decoded from
 *       the stored `content` column). When the bytes were not captured
 *       (metadata-only inbound row) but a Resend `download_url` was
 *       stored, redirects to it so the agent can still fetch the file
 *       while that URL is valid.
 *
 * Signed URLs let an LLM agent (or a human it shares the link with)
 * fetch attachment bytes over plain HTTP without having to attach an
 * `X-API-Key` / `Authorization` header to the binary request — the
 * token binds the URL to a single attachment id and a short expiry.
 */
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ApiResponse } from '@guardmail/shared';
import type { AuthEnv } from '../middleware/auth';
import { requireAuthOrApiKey } from '../middleware/auth';
import { attachmentRepository, emailRepository } from '../db';

export const attachmentRoutes = new Hono<AuthEnv>();

/**
 * Signing secret for download URLs. A dedicated secret is preferred so
 * attachment URLs can be rotated independently of JWTs; falls back to
 * `JWT_SECRET` so the feature works out of the box without extra config.
 */
function urlSecret(): string {
  return (
    process.env.ATTACHMENT_URL_SECRET ??
    process.env.JWT_SECRET ??
    (process.env.NODE_ENV === 'production'
      ? ''
      : 'dev-attachment-url-secret')
  );
}

/** Lifetime of a signed download URL, in seconds (default 5 minutes). */
const URL_TTL_SECONDS = Number(process.env.ATTACHMENT_URL_TTL_SECONDS ?? 300);

/**
 * Externally reachable base URL of the API (no trailing slash). The
 * signed URL must be fetchable by the MCP agent / end user, so it has
 * to use the *public* API domain — the internal `railway.internal`
 * hostname is unreachable from outside the project. Falls back to
 * localhost for local development.
 */
function publicApiBaseUrl(): string {
  const base = (process.env.PUBLIC_API_URL ?? '').trim().replace(/\/+$/, '');
  if (base) return base;
  const port = process.env.API_PORT ?? '3000';
  return `http://localhost:${port}`;
}

/** Compute the HMAC signature for `id` + `exp` (unix seconds, string). */
function sign(id: string, exp: string): string {
  const secret = urlSecret();
  if (!secret) {
    throw new HTTPException(500, {
      message: 'ATTACHMENT_URL_SECRET / JWT_SECRET not configured',
    });
  }
  return createHmac('sha256', secret).update(`${id}|${exp}`).digest('hex');
}

/** Constant-time string comparison to avoid timing oracle attacks. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Sanitise a filename for use in a Content-Disposition header. */
function safeFilename(name: string): string {
  // Strip CR/LF and double quotes to prevent header injection.
  const clean = name.replace(/[\r\n"]/g, '').slice(0, 255) || 'attachment';
  return clean;
}

// ---------------------------------------------------------------------------
// POST /:id/download-url  — mint a short-lived signed download URL
// ---------------------------------------------------------------------------

attachmentRoutes.use('/:id/download-url', requireAuthOrApiKey);

attachmentRoutes.post('/:id/download-url', async (c) => {
  const auth = c.get('auth');
  const id = c.req.param('id');

  const att = await attachmentRepository.findById(id);
  if (!att) throw new HTTPException(404, { message: 'Attachment not found' });

  // Ownership: the attachment's email must belong to the caller.
  const email = await emailRepository.findById(att.emailId);
  if (!email || email.userId !== auth.user.id) {
    // Treat unknown / foreign attachments as 404 to avoid leaking existence.
    throw new HTTPException(404, { message: 'Attachment not found' });
  }

  const exp = Math.floor(Date.now() / 1000) + URL_TTL_SECONDS;
  const sig = sign(id, String(exp));
  const url = `${publicApiBaseUrl()}/api/attachments/${id}/download?exp=${exp}&sig=${sig}`;

  const data = {
    id: att.id,
    filename: att.filename,
    mimeType: att.mimeType,
    size: att.size,
    url,
    expiresAt: new Date(exp * 1000).toISOString(),
  };
  const body: ApiResponse<typeof data> = { success: true, data };
  return c.json(body);
});

// ---------------------------------------------------------------------------
// GET /:id/download  — public, token-gated byte stream
// ---------------------------------------------------------------------------

attachmentRoutes.get('/:id/download', async (c) => {
  const id = c.req.param('id');
  const exp = c.req.query('exp');
  const sig = c.req.query('sig');

  if (!exp || !sig) {
    throw new HTTPException(401, { message: 'Missing signed-url parameters' });
  }
  const expNum = Number(exp);
  if (!Number.isInteger(expNum) || expNum <= 0) {
    throw new HTTPException(400, { message: 'Invalid exp parameter' });
  }
  if (expNum * 1000 < Date.now()) {
    throw new HTTPException(401, { message: 'Download URL has expired' });
  }
  if (!safeEqual(sign(id, exp), sig)) {
    throw new HTTPException(403, { message: 'Invalid signature' });
  }

  const att = await attachmentRepository.findById(id);
  if (!att) throw new HTTPException(404, { message: 'Attachment not found' });

  // Prefer the captured bytes (Base64) so we serve a stable copy that
  // does not depend on a third-party signed URL expiring.
  if (att.content) {
    let bytes: Buffer;
    try {
      bytes = Buffer.from(att.content, 'base64');
    } catch {
      throw new HTTPException(500, { message: 'Attachment content is corrupted' });
    }
    const headers = new Headers();
    headers.set('Content-Type', att.mimeType || 'application/octet-stream');
    headers.set(
      'Content-Disposition',
      `attachment; filename="${safeFilename(att.filename)}"`,
    );
    headers.set('Content-Length', String(bytes.length));
    // Short-lived by nature; discourage intermediary caching.
    headers.set('Cache-Control', 'private, no-store');
    return new Response(bytes, { headers });
  }

  // No captured bytes — fall back to a stored Resend download_url, which
  // is itself a short-lived signed URL (~1h). Redirect rather than proxy
  // so we don't stream large files through the API process.
  if (att.storagePath && /^https?:\/\//i.test(att.storagePath)) {
    return c.redirect(att.storagePath, 302);
  }

  throw new HTTPException(404, {
    message:
      'Attachment content is not available (only metadata was captured at receive time).',
  });
});