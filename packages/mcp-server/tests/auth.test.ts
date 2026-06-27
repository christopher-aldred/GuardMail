/**
 * Tests for MCP server authentication.
 *
 * Verifies that:
 *   1. The x-api-key header middleware normalises to Authorization: Bearer
 *   2. verifyAccessToken returns AuthInfo with a far-future expiresAt
 *   3. verifyAccessToken throws for invalid API keys
 *   4. verifyApiKey calls the correct API endpoint (/api/auth/verify-key)
 */
import { apiKeyHeaderMiddleware } from '../src/api-key-middleware';
import { oauthProvider } from '../src/auth-provider';

// Mock global fetch
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

// Helper: create a minimal Express-like request object
function mockReq(headers: Record<string, string | undefined>) {
  return {
    headers: { ...headers } as Record<string, string>,
  } as any;
}

function mockRes() {
  return {} as any;
}

describe('apiKeyHeaderMiddleware', () => {
  it('converts x-api-key to Authorization: Bearer', () => {
    const req = mockReq({ 'x-api-key': 'test-key-123' });
    const next = jest.fn();
    apiKeyHeaderMiddleware(req, mockRes(), next);
    expect(req.headers.authorization).toBe('Bearer test-key-123');
    expect(next).toHaveBeenCalled();
  });

  it('does not overwrite an existing Authorization header', () => {
    const req = mockReq({ 'x-api-key': 'test-key-123', authorization: 'Bearer existing-token' });
    const next = jest.fn();
    apiKeyHeaderMiddleware(req, mockRes(), next);
    expect(req.headers.authorization).toBe('Bearer existing-token');
    expect(next).toHaveBeenCalled();
  });

  it('passes through when no x-api-key header is present', () => {
    const req = mockReq({ authorization: 'Bearer existing-token' });
    const next = jest.fn();
    apiKeyHeaderMiddleware(req, mockRes(), next);
    expect(req.headers.authorization).toBe('Bearer existing-token');
    expect(next).toHaveBeenCalled();
  });

  it('passes through when no auth headers are present', () => {
    const req = mockReq({});
    const next = jest.fn();
    apiKeyHeaderMiddleware(req, mockRes(), next);
    expect(req.headers.authorization).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });
});

describe('oauthProvider.verifyAccessToken', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('returns AuthInfo with a far-future expiresAt for a valid API key', async () => {
    // Simulate a successful API key verification
    mockFetch.mockResolvedValue({ ok: true } as Response);

    const authInfo = await oauthProvider.verifyAccessToken('valid-api-key');

    expect(authInfo.token).toBe('valid-api-key');
    expect(authInfo.clientId).toBe('guardmail-user');
    expect(authInfo.scopes).toEqual(['mail']);
    // expiresAt must be a number (seconds since epoch) in the far future
    expect(typeof authInfo.expiresAt).toBe('number');
    expect(authInfo.expiresAt!).toBeGreaterThan(Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60);
  });

  it('throws for an invalid API key', async () => {
    // Simulate a failed API key verification (401 from API)
    mockFetch.mockResolvedValue({ ok: false } as Response);

    await expect(oauthProvider.verifyAccessToken('invalid-key')).rejects.toThrow(
      'Invalid access token',
    );
  });

  it('calls /api/auth/verify-key endpoint (not /api/settings/api-key)', async () => {
    mockFetch.mockResolvedValue({ ok: true } as Response);

    await oauthProvider.verifyAccessToken('some-key');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('/api/auth/verify-key');
    expect(calledUrl).not.toContain('/api/settings/api-key');
  });

  it('passes the API key as x-api-key header to the verify endpoint', async () => {
    mockFetch.mockResolvedValue({ ok: true } as Response);

    await oauthProvider.verifyAccessToken('my-special-key');

    const callInit = mockFetch.mock.calls[0][1] as RequestInit;
    expect((callInit.headers as Record<string, string>)['x-api-key']).toBe('my-special-key');
  });

  it('handles network errors gracefully (returns rejection)', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    await expect(oauthProvider.verifyAccessToken('any-key')).rejects.toThrow();
  });
});