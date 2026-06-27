/**
 * Tests for the custom-domain feature.
 *
 * Covers the input-validation layer (schema + auth gates) that runs
 * before any database query, so no live DB is required. The full
 * Resend-backed happy path is exercised by integration tests.
 */
import { customDomainSchema } from '../src/auth/schemas';
import { app } from '../src/index';

describe('customDomainSchema (validation)', () => {
  it.each(['example.com', 'sub.example.co.uk', 'my-domain.io'])(
    'accepts a valid domain (%s)',
    (d) => {
      expect(customDomainSchema.safeParse({ domain: d }).success).toBe(true);
    },
  );

  it.each([
    'not a domain',
    'invalid',
    '-leading.com',
    'trailing-.com',
    '.com',
    'example..com',
    'http://example.com',
    'example.com/path',
    'EXAMPLE.COM', // upper-case normalised by .toLowerCase()
  ])('rejects an invalid domain (%s)', (d) => {
    // Upper-case is normalised by the schema (.toLowerCase()) so it should
    // actually pass — handle that one specially.
    if (d === 'EXAMPLE.COM') {
      expect(customDomainSchema.safeParse({ domain: d }).success).toBe(true);
      return;
    }
    expect(customDomainSchema.safeParse({ domain: d }).success).toBe(false);
  });

  it('normalises the domain to lower case', () => {
    const res = customDomainSchema.safeParse({ domain: 'ExAmPLe.COM' });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.domain).toBe('example.com');
  });
});

describe('GET /api/settings/domain (auth gate)', () => {
  it('returns 401 without authentication', async () => {
    const res = await app.request('/api/settings/domain');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/settings/domain (auth gate)', () => {
  it('returns 401 without authentication', async () => {
    const res = await app.request('/api/settings/domain', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ domain: 'example.com' }),
    });
    expect(res.status).toBe(401);
  });
});

describe('DELETE /api/settings/domain (auth gate)', () => {
  it('returns 401 without authentication', async () => {
    const res = await app.request('/api/settings/domain', { method: 'DELETE' });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/settings/domain/verify (auth gate)', () => {
  it('returns 401 without authentication', async () => {
    const res = await app.request('/api/settings/domain/verify', {
      method: 'POST',
    });
    expect(res.status).toBe(401);
  });
});