/**
 * Tests for the /api/attachments routes.
 *
 * These exercise the signed-URL gating logic (token verification,
 * expiry, signature mismatch) and the auth guard on the mint endpoint.
 * The paths under test return *before* any database lookup, so no DB
 * fixture is required.
 */
import { app } from '../src/index';

const UUID = '11111111-1111-1111-1111-111111111111';

describe('POST /api/attachments/:id/download-url (auth)', () => {
  it('rejects unauthenticated requests with 401', async () => {
    const res = await app.request(`/api/attachments/${UUID}/download-url`, {
      method: 'POST',
    });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/attachments/:id/download (signed URL)', () => {
  it('rejects requests missing the signed parameters with 401', async () => {
    const res = await app.request(`/api/attachments/${UUID}/download`);
    expect(res.status).toBe(401);
  });

  it('rejects an invalid exp with 400', async () => {
    const res = await app.request(
      `/api/attachments/${UUID}/download?exp=not-a-number&sig=abc`,
    );
    expect(res.status).toBe(400);
  });

  it('rejects an expired URL with 401', async () => {
    const exp = Math.floor(Date.now() / 1000) - 60; // 1 minute ago
    const res = await app.request(
      `/api/attachments/${UUID}/download?exp=${exp}&sig=anysig`,
    );
    expect(res.status).toBe(401);
  });

  it('rejects a tampered signature with 403 (without reaching the DB)', async () => {
    process.env.ATTACHMENT_URL_SECRET = 'test-secret';
    try {
      const exp = Math.floor(Date.now() / 1000) + 300;
      const res = await app.request(
        `/api/attachments/${UUID}/download?exp=${exp}&sig=tampered`,
      );
      expect(res.status).toBe(403);
    } finally {
      delete process.env.ATTACHMENT_URL_SECRET;
    }
  });
});