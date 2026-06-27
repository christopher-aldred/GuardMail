/**
 * Tests for email routes — auth gating and route presence.
 *
 * These exercise the middleware/route layer that runs *before* any
 * database query, so no live DB is required (the auth middleware
 * rejects before hitting the repositories).
 */
import { app } from '../src/index';

describe('POST /api/emails/:id/move-to-inbox (auth + route)', () => {
  it('returns 401 without an Authorization header', async () => {
    const res = await app.request(
      '/api/emails/11111111-1111-1111-1111-111111111111/move-to-inbox',
      { method: 'POST', headers: { 'content-type': 'application/json' } },
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 with an invalid Bearer token', async () => {
    const res = await app.request(
      '/api/emails/11111111-1111-1111-1111-111111111111/move-to-inbox',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer not-a-real-token',
        },
      },
    );
    expect(res.status).toBe(401);
  });
});