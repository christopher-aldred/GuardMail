import { deliverToApi } from '../src/index';

const okResponse = (body: unknown) =>
  ({ ok: true, status: 202, json: async () => body } as unknown as Response);

describe('deliverToApi', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('forwards parsed mail to /api/inbound with the internal key', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      okResponse({
        success: true,
        data: { created: [{ emailId: 'e1', recipient: 'demo@mydomain.com' }], rejected: [] },
      }),
    );
    global.fetch = fetchMock;

    const result = await deliverToApi({
      from: 'a@b.com',
      to: ['demo@mydomain.com'],
      subject: 'hi',
      body: 'hello',
    });

    expect(result.created).toHaveLength(1);
    const [call] = fetchMock.mock.calls;
    expect(call[0]).toBe('http://localhost:3000/api/inbound');
    const opts = call[1] as RequestInit;
    expect(opts.method).toBe('POST');
    expect((opts.headers as Record<string, string>)['x-internal-key']).toBeDefined();
    expect((opts.headers as Record<string, string>)['content-type']).toBe('application/json');
  });

  it('throws when the API rejects the message', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ success: false, error: { message: 'Invalid internal key' } }),
    } as unknown as Response);
    await expect(
      deliverToApi({ from: 'a@b.com', to: ['x@y.com'], subject: '', body: '' }),
    ).rejects.toThrow('Invalid internal key');
  });
});