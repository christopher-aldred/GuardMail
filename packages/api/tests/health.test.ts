/**
 * API endpoint tests using Hono's built-in `app.request` helper.
 * These exercise the route wiring without a live DB (health only).
 */
import { app } from '../src/index';

describe('GET /api/health', () => {
  it('returns 200 with ok status', async () => {
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.status).toBe('ok');
    // LLM Guard / ClamAV health booleans (may be false in CI — that's ok).
    expect(typeof json.data.llmGuard).toBe('boolean');
    expect(typeof json.data.clamav).toBe('boolean');
  });
});

describe('protected routes reject unauthenticated requests', () => {
  it('GET /api/emails/inbox → 401', async () => {
    const res = await app.request('/api/emails/inbox');
    expect(res.status).toBe(401);
  });

  it('GET /api/settings/spam → 401', async () => {
    const res = await app.request('/api/settings/spam');
    expect(res.status).toBe(401);
  });
});