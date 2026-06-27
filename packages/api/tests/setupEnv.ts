// Disable the global rate limiter for the API test suite so that
// validation tests (which fire many requests rapidly from one IP) are
// not throttled. The rate-limit middleware is exercised directly in
// tests/rate-limit.test.ts, which re-enables it.
process.env.RATE_LIMIT_DISABLED = '1';
