// Smoke test — verifies the API client shape compiles & exposes expected methods.
import { api } from '../src/api';

describe('api client', () => {
  it('exposes the expected methods', () => {
    expect(typeof api.register).toBe('function');
    expect(typeof api.login).toBe('function');
    expect(typeof api.listInbox).toBe('function');
    expect(typeof api.sendEmail).toBe('function');
    expect(typeof api.getSpamSettings).toBe('function');
  });
});