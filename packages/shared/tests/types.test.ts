import { isEmailStatus, isSpamSensitivity } from '../src';

describe('shared type guards', () => {
  it('validates EmailStatus values', () => {
    expect(isEmailStatus('inbox')).toBe(true);
    expect(isEmailStatus('quarantine')).toBe(true);
    expect(isEmailStatus('deleted')).toBe(false);
    expect(isEmailStatus(42)).toBe(false);
  });

  it('validates SpamSensitivity values', () => {
    expect(isSpamSensitivity('low')).toBe(true);
    expect(isSpamSensitivity('custom')).toBe(true);
    expect(isSpamSensitivity('extreme')).toBe(false);
  });
});