import { evaluateSpam } from '../src/services/spam-filter';

const baseConfig = {
  userId: 'u1',
  enabled: true,
  sensitivity: 'medium' as const,
  allowlist: [] as string[],
  blocklist: [] as string[],
  keywordRules: [] as { keyword: string; action: 'flag' | 'block'; score: number }[],
  blockContentTypes: [] as string[],
  updatedAt: new Date(),
};

describe('spam filter engine', () => {
  it('passes clean emails', () => {
    const r = evaluateSpam(baseConfig, { from: 'a@b.com', subject: 'Hello', body: 'Meeting tomorrow?' });
    expect(r.outcome.passed).toBe(true);
    expect(r.outcome.riskScore).toBeLessThan(0.5);
  });

  it('hard-blocks senders on the blocklist', () => {
    const r = evaluateSpam(
      { ...baseConfig, blocklist: ['spammer@evil.com'] },
      { from: 'spammer@evil.com', subject: 'Hi', body: 'x' },
    );
    expect(r.outcome.passed).toBe(false);
    expect(r.outcome.blocked).toBe(true);
    expect(r.outcome.riskScore).toBe(1);
  });

  it('allowlist short-circuits even with bad keywords', () => {
    const r = evaluateSpam(
      { ...baseConfig, allowlist: ['friend@x.com'], keywordRules: [{ keyword: 'win', action: 'block', score: 1 }] },
      { from: 'friend@x.com', subject: 'win', body: 'win a prize' },
    );
    expect(r.outcome.passed).toBe(true);
  });

  it('flags when keyword score exceeds threshold', () => {
    const r = evaluateSpam(
      { ...baseConfig, sensitivity: 'high', keywordRules: [{ keyword: 'casino', action: 'flag', score: 0.5 }] },
      { from: 'a@b.com', subject: 'casino night', body: 'come play' },
    );
    expect(r.outcome.passed).toBe(false);
  });

  it('respects disabled config', () => {
    const r = evaluateSpam(
      { ...baseConfig, enabled: false, blocklist: ['x@y.com'] },
      { from: 'x@y.com', subject: '', body: '' },
    );
    expect(r.outcome.passed).toBe(true);
  });
});