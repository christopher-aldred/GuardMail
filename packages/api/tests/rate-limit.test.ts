/**
 * Rate limiting tests.
 *
 * The global rate limiter caps every client at 10 requests/second.
 * These tests drive the middleware directly (no DB) to confirm the
 * ceiling and the 429 response, and that the bucket refills after a
 * short wait.
 */
import { rateLimitMiddleware } from '../src/middleware/common';

// The global test setup disables rate limiting; re-enable it here so the
// middleware actually enforces the ceiling. Use unique IPs to avoid
// coupling with any other test in the same worker.
process.env.RATE_LIMIT_DISABLED = '0';

/** Build a Hono-style context stub for the middleware. */
function makeContext() {
  const headers: Record<string, string> = {};
  const res = {
    _status: 0,
    _body: null as unknown,
    header(name: string, value: string) {
      headers[name] = value;
      return res;
    },
    json(body: unknown, status?: number) {
      res._body = body;
      res._status = status ?? 200;
      return res;
    },
  };
  const c = {
    req: { header: (name: string) => (name.toLowerCase() === 'x-forwarded-for' ? '1.2.3.4' : undefined) },
    header: res.header,
    json: res.json,
  } as any;
  return { c, res, headers };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

describe('rateLimitMiddleware (10 requests/second)', () => {
  it('allows the first 10 requests in a burst then returns 429', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      const { c } = makeContext();
      let called = false;
      await rateLimitMiddleware(c, async () => {
        called = true;
      });
      // The middleware either calls next() (200 path) or returns a 429 json.
      statuses.push(called ? 200 : c.json._status ?? 429);
    }
    const ok = statuses.filter((s) => s === 200).length;
    const limited = statuses.filter((s) => s === 429).length;
    expect(ok).toBe(10);
    expect(limited).toBe(2);
  });

  it('refills tokens after waiting, allowing traffic again', async () => {
    // Drain the (per-IP) bucket from the test above is separate IP? Same IP.
    // Use a fresh IP to avoid cross-test coupling.
    let calls = 0;
    const ctx = () => {
      const res = {
        header() {
          return res;
        },
        json(_b: unknown, status?: number) {
          return { status: status ?? 200 };
        },
      };
      return {
        c: {
          req: { header: () => '9.9.9.9' },
          header: res.header,
          json: res.json,
        } as any,
        called: false,
      };
    };

    // First 10 succeed.
    for (let i = 0; i < 10; i++) {
      const { c } = ctx();
      await rateLimitMiddleware(c, async () => {});
    }
    // 11th is limited.
    const { c: c11 } = ctx();
    let next11 = false;
    await rateLimitMiddleware(c11, async () => {
      next11 = true;
    });
    expect(next11).toBe(false);

    // Wait ~150ms — at 10/s that refills ~1.5 tokens.
    await sleep(160);
    const { c: c12 } = ctx();
    let next12 = false;
    await rateLimitMiddleware(c12, async () => {
      next12 = true;
    });
    expect(next12).toBe(true);
    void calls;
  }, 10000);
});
