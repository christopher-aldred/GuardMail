/**
 * Guardmail API server bootstrap.
 *
 * Composes auth + email + settings routes, applies middleware,
 * starts the email-processing worker, and exposes `/api/health`.
 */
import 'dotenv/config';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import type { ApiResponse } from '@guardmail/shared';
import { authRoutes } from './auth/routes';
import { emailRoutes } from './emails/routes';
import { settingsRoutes } from './settings/routes';
import { inboundRoutes } from './inbound/routes';
import { resendWebhookRoutes } from './webhooks/resend';
import { stripeWebhookRoutes } from './webhooks/stripe';
import { adminRoutes } from './admin/routes';
import { corsMiddleware, errorHandler, rateLimitMiddleware } from './middleware/common';
import { requireAuthOrApiKey, requireAdmin } from './middleware/auth';
import type { AuthEnv } from './middleware/auth';
import { closeDb, ensureSchema } from './db';
import { closeRedis } from './services/email-queue';
import { startWorker } from './services/email-processor';
import { llmGuardClient } from './services/llm-guard';
import { clamavClient } from './services/clamav';

const app = new Hono();

// --- Global middleware -------------------------------------------------------
app.use('*', logger());
app.use('*', corsMiddleware);
app.use('*', rateLimitMiddleware);
app.onError(errorHandler);

// --- Health check ------------------------------------------------------------
app.get('/api/health', async (c) => {
  const [llm, clam] = await Promise.all([
    llmGuardClient.isHealthy(),
    clamavClient.isHealthy(),
  ]);
  const body: ApiResponse<{
    status: string;
    llmGuard: boolean;
    clamav: boolean;
    time: string;
  }> = {
    success: true,
    data: {
      status: 'ok',
      llmGuard: llm,
      clamav: clam,
      time: new Date().toISOString(),
    },
  };
  return c.json(body);
});

// --- Routes ------------------------------------------------------------------
app.route('/api/auth', authRoutes);
app.route('/api/inbound', inboundRoutes);
app.route('/api/webhooks/resend', resendWebhookRoutes);
app.route('/api/webhooks/stripe', stripeWebhookRoutes);

const protectedApi = new Hono<import('./middleware/auth').AuthEnv>();
protectedApi.use('*', requireAuthOrApiKey);
protectedApi.route('/emails', emailRoutes);
protectedApi.route('/settings', settingsRoutes);
app.route('/api', protectedApi);

// --- Admin-only routes -------------------------------------------------------
const adminApi = new Hono<AuthEnv>();
adminApi.use('*', requireAuthOrApiKey);
adminApi.use('*', requireAdmin);
adminApi.route('/', adminRoutes);
app.route('/api/admin', adminApi);

// --- Shutdown ----------------------------------------------------------------
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  console.log('[api] Shutting down...');
  await Promise.allSettled([closeDb(), closeRedis()]);
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// --- Start -------------------------------------------------------------------
const PORT = Number(process.env.API_PORT ?? 3000);

if (require.main === module) {
  (async () => {
    try {
      await ensureSchema();
    } catch (e) {
      console.error('[api] Schema ensure failed (continuing):', e);
    }
    if (process.env.EMAIL_WORKER_ENABLED === '1') {
      startWorker().catch((e) => console.error('[api] Worker failed:', e));
    }
    serve({ fetch: app.fetch, port: PORT, hostname: '0.0.0.0' }, (info) => {
      console.log(`[api] Guardmail API listening on http://localhost:${info.port}`);
    });
  })();
}

export { app };