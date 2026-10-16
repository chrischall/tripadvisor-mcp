import { afterEach, describe, expect, it } from 'vitest';
import { getRequestTimeoutMs } from '../../src/web/config.js';

const KEY = 'TRIPADVISOR_REQUEST_TIMEOUT_MS';

afterEach(() => {
  delete process.env[KEY];
});

describe('getRequestTimeoutMs', () => {
  it('defaults to 30000 when unset', () => {
    expect(getRequestTimeoutMs()).toBe(30_000);
  });

  it('uses a positive integer override', () => {
    process.env[KEY] = ' 5000 ';
    expect(getRequestTimeoutMs()).toBe(5000);
  });

  it.each(['abc', '0', '-5', '', '2.5', '1e3', '${user_config.request_timeout_ms}', 'undefined'])(
    'falls back to the default for %j',
    (v) => {
      process.env[KEY] = v;
      expect(getRequestTimeoutMs()).toBe(30_000);
    },
  );
});
