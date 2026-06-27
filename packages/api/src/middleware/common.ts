/**
 * Global error handler, rate limiting, and CORS middleware.
 */
import type { Context, Next } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import type { ApiResponse } from '@guardmail/shared';

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

const allowedOrigins = (process.env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);

export const corsMiddleware = cors({
  origin: (origin) => {
    if (allowedOrigins.length > 0) {
      return allowedOrigins.includes(origin) ? origin : '';
    }
    // No allowlist configured: fail closed in production (no CORS
    // headers), allow any origin in non-production for local dev.
    if (process.env.NODE_ENV === 'production') return '';
    return origin ?? '';
  },
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  credentials: true,
});

// ---------------------------------------------------------------------------
// Error handler
// ---------------------------------------------------------------------------

export function errorHandler(err: Error, c: Context) {
  if (err instanceof HTTPException) {
    const res = err.getResponse();
    const body: ApiResponse<never> = {
      success: false,
      error: { code: String(err.status), message: err.message },
    };
    return c.json(body, res.status as 400);
  }
  console.error('[error] Unhandled:', err);
  const body: ApiResponse<never> = {
    success: false,
    error: { code: 'INTERNAL', message: 'Internal server error' },
  };
  return c.json(body, 500);
}

// ---------------------------------------------------------------------------
// Rate limiting
//
// All accounts are rate limited to 10 requests per second (token bucket
// per client IP, capacity 10, refill 10/s). This bounds abusive burst
// traffic while allowing short legitimate spikes. Set
// RATE_LIMIT_RPS to override the per-second ceiling.
// ---------------------------------------------------------------------------

const RPS = Number(process.env.RATE_LIMIT_RPS ?? 10);
const REFILL_MS = 1000 / RPS; // ms between tokens

const buckets = new Map<string, { tokens: number; last: number }>();

export async function rateLimitMiddleware(c: Context, next: Next) {
  // Escape hatch for tests / internal callers that bypass the limiter.
  if (process.env.RATE_LIMIT_DISABLED === '1') {
    await next();
    return;
  }
  // Trust the Railway proxy's x-real-ip first; otherwise use the
  // rightmost (trusted-proxy-appended) hop of X-Forwarded-For. The
  // leftmost value is client-controlled and must not be trusted.
  const xRealIp = c.req.header('x-real-ip');
  let ip = xRealIp?.trim();
  if (!ip) {
    const xff = c.req.header('x-forwarded-for');
    const hops = xff?.split(',').map((s) => s.trim()).filter(Boolean);
    ip = hops?.length ? hops[hops.length - 1] : '';
  }
  ip = ip || 'unknown';
  const now = Date.now();
  let bucket = buckets.get(ip);
  if (!bucket) {
    bucket = { tokens: RPS, last: now };
    buckets.set(ip, bucket);
  }
  // Refill tokens based on elapsed time.
  const elapsed = now - bucket.last;
  bucket.tokens = Math.min(RPS, bucket.tokens + elapsed / REFILL_MS);
  bucket.last = now;

  c.header('X-RateLimit-Limit', String(RPS));
  c.header('X-RateLimit-Remaining', String(Math.floor(bucket.tokens)));

  if (bucket.tokens < 1) {
    c.header('Retry-After', '1');
    const body: ApiResponse<never> = {
      success: false,
      error: { code: 'RATE_LIMIT', message: 'Too many requests (limit: 10/second)' },
    };
    return c.json(body, 429);
  }
  bucket.tokens -= 1;
  await next();
}