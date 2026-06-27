import { tools } from '../src/tools';
import { resources } from '../src/resources';
import { ApiError } from '../src/api-client';
import type { ApiClient } from '../src/api-client';

describe('MCP tools', () => {
  it('exposes all expected tools', () => {
    const names = tools.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'send_email',
        'list_inbox',
        'list_spam',
        'list_quarantine',
        'get_email',
        'register_user',
        'update_spam_settings',
        'update_security_settings',
        'get_quota',
        'get_attachment_url',
        'move_to_inbox',
      ]),
    );
    expect(names.length).toBe(11);
  });

  it('each tool has a JSON Schema input schema with descriptions', () => {
    for (const t of tools) {
      expect(t.inputSchema).toHaveProperty('type', 'object');
      expect(typeof t.description).toBe('string');
      expect(typeof t.handler).toBe('function');
      // Smithery: parameter descriptions
      expect(t.annotations).toBeDefined();
      expect(t.outputSchema).toBeDefined();
      expect(t.title).toBeDefined();
      const props = (t.inputSchema as any).properties ?? {};
      for (const [key, schema] of Object.entries(props)) {
        expect(typeof (schema as any).description).toBe('string'); // param "${key}" must have a description
      }
    }
  });

  it('rejects invalid send_email input with a structured VALIDATION error', async () => {
    const send = tools.find((t) => t.name === 'send_email')!;
    const out = JSON.parse(await send.handler({} as any, { to: 'not-an-email', subject: '', body: '' }));
    expect(out.success).toBe(false);
    expect(out.error).toEqual(
      expect.objectContaining({ code: 'VALIDATION', message: expect.any(String) }),
    );
  });

  it('rejects unknown get_email id', async () => {
    const get = tools.find((t) => t.name === 'get_email')!;
    const out = await get.handler({} as any, { emailId: 'not-a-uuid' });
    expect(JSON.parse(out).success).toBe(false);
  });

  describe('get_attachment_url', () => {
    it('mints a short-lived signed download URL via the API', async () => {
      const payload = {
        id: '11111111-1111-1111-1111-111111111111',
        filename: 'report.pdf',
        mimeType: 'application/pdf',
        size: 1234,
        url: 'https://api.example.com/api/attachments/.../download?exp=1&sig=abc',
        expiresAt: '2026-01-01T00:00:00.000Z',
      };
      const client = {
        getAttachmentDownloadUrl: async () => payload,
      } as unknown as ApiClient;
      const tool = tools.find((t) => t.name === 'get_attachment_url')!;
      const out = JSON.parse(
        await tool.handler(client, { attachmentId: payload.id }),
      );
      expect(out.success).toBe(true);
      expect(out.data).toEqual(payload);
      expect(out.data.url).toMatch(/\/download\?exp=/);
    });

    it('rejects a non-UUID attachmentId', async () => {
      const tool = tools.find((t) => t.name === 'get_attachment_url')!;
      const out = JSON.parse(await tool.handler({} as any, { attachmentId: 'not-a-uuid' }));
      expect(out.success).toBe(false);
      expect(out.error.code).toBe('VALIDATION');
    });
  });

  it('surfaces API errors as structured errors (code + status)', async () => {
    // A mock client whose sendEmail throws a structured ApiError, as the
    // real ApiClient does when the API returns a 429 quota error.
    const client = {
      sendEmail: async () => {
        throw new ApiError('429', 'Monthly email limit reached', 429);
      },
    } as unknown as ApiClient;
    const send = tools.find((t) => t.name === 'send_email')!;
    const out = JSON.parse(
      await send.handler(client, { to: ['a@b.com'], subject: 'hi', body: 'x' }),
    );
    expect(out.success).toBe(false);
    expect(out.error).toEqual({ code: '429', message: 'Monthly email limit reached', status: 429 });
  });

  it('maps a generic (non-ApiError) throw to an INTERNAL code', async () => {
    const client = {
      sendEmail: async () => {
        throw new Error('boom');
      },
    } as unknown as ApiClient;
    const send = tools.find((t) => t.name === 'send_email')!;
    const out = JSON.parse(
      await send.handler(client, { to: ['a@b.com'], subject: 'hi', body: 'x' }),
    );
    expect(out.success).toBe(false);
    expect(out.error.code).toBe('INTERNAL');
    expect(out.error.message).toBe('boom');
  });

  describe('get_quota', () => {
    it('returns the subscription / quota snapshot', async () => {
      const sub = {
        tier: 'free',
        name: 'Free',
        monthlyLimit: 3000,
        dailyLimit: 100,
        priceCents: 0,
        available: true,
        sentThisMonth: 42,
        sentToday: 3,
        emailVerified: true,
        email: 'owner@example.com',
        unverifiedSendLimit: null,
        sentLifetimeOutbound: 0,
      };
      const client = { getSubscription: async () => sub } as unknown as ApiClient;
      const getQuota = tools.find((t) => t.name === 'get_quota')!;
      const out = JSON.parse(await getQuota.handler(client, {}));
      expect(out.success).toBe(true);
      expect(out.data).toEqual(sub);
    });

    it('accepts no arguments (empty object)', async () => {
      const getQuota = tools.find((t) => t.name === 'get_quota')!;
      const out = JSON.parse(await getQuota.handler({ getSubscription: async () => ({}) } as any, {}));
      expect(out.success).toBe(true);
    });

    it('rejects unexpected arguments', async () => {
      const getQuota = tools.find((t) => t.name === 'get_quota')!;
      const out = JSON.parse(
        await getQuota.handler({ getSubscription: async () => ({}) } as any, { surprise: true }),
      );
      expect(out.success).toBe(false);
      expect(out.error.code).toBe('VALIDATION');
    });
  });

  it('exposes a guardmail://subscription resource', () => {
    const uris = resources.map((r) => r.uri);
    expect(uris).toContain('guardmail://subscription');
  });
});
