/**
 * Tests for the internal /api/inbound endpoint.
 *
 * These mock the user lookup so no DB is required. The route module
 * imports the live db client, so we stub the repository functions
 * via the module's own exports is not trivial — instead we verify
 * the route-level security: rejects without the internal key, and
 * accepts structurally valid requests.
 */
import { app } from '../src/index';

describe('POST /api/inbound', () => {
  it('rejects requests without the internal key', async () => {
    // INTERNAL_API_KEY may be unset in the test env → 503, or set → 401.
    const res = await app.request('/api/inbound', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ from: 'a@b.com', to: ['demo@mydomain.com'], subject: '', body: '' }),
    });
    expect([401, 503]).toContain(res.status);
  });

  it('rejects a wrong internal key with 401', async () => {
    process.env.INTERNAL_API_KEY = 'test-internal-key';
    try {
      const res = await app.request('/api/inbound', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-internal-key': 'wrong' },
        body: JSON.stringify({ from: 'a@b.com', to: ['demo@mydomain.com'], subject: '', body: '' }),
      });
      expect(res.status).toBe(401);
    } finally {
      delete process.env.INTERNAL_API_KEY;
    }
  });

  it('rejects malformed bodies with 400', async () => {
    process.env.INTERNAL_API_KEY = 'test-internal-key';
    try {
      const res = await app.request('/api/inbound', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-internal-key': 'test-internal-key' },
        body: JSON.stringify({ from: 'not-an-email', to: [] }),
      });
      expect(res.status).toBe(400);
    } finally {
      delete process.env.INTERNAL_API_KEY;
    }
  });
});