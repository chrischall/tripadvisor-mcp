import { describe, it, expect, vi } from 'vitest';
import { TripAdvisorWebClient } from '../../src/web/client.js';
import type { FetchproxyTransport } from '../../src/web/transport.js';

/** Minimal transport stub: start() resolves, fetch() returns the queued result. */
function stubTransport(fetchMock: ReturnType<typeof vi.fn>): FetchproxyTransport {
  return {
    start: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    fetch: fetchMock,
  } as unknown as FetchproxyTransport;
}

describe('TripAdvisorWebClient', () => {
  it('fetchRaw round-trips through the injected transport', async () => {
    const fetchMock = vi.fn(async () => ({ status: 200, body: 'ok', url: 'https://www.tripadvisor.com/' }));
    const c = new TripAdvisorWebClient({ transport: stubTransport(fetchMock) });
    const r = await c.fetchRaw('GET', '/');
    expect(r.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith({ method: 'GET', path: '/', headers: {} });
  });

  it('start() is single-flight across concurrent calls', async () => {
    const fetchMock = vi.fn(async () => ({ status: 200, body: 'ok', url: '' }));
    const transport = stubTransport(fetchMock);
    const c = new TripAdvisorWebClient({ transport });
    await Promise.all([c.fetchRaw('GET', '/a'), c.fetchRaw('GET', '/b')]);
    expect(transport.start).toHaveBeenCalledTimes(1);
  });

  it('getHtml throws an actionable error on non-2xx', async () => {
    const fetchMock = vi.fn(async () => ({ status: 500, body: 'oops', url: '' }));
    const c = new TripAdvisorWebClient({ transport: stubTransport(fetchMock) });
    await expect(c.getHtml('/x')).rejects.toThrow(/answered 500/);
  });

  it('getJson parses a JSON 2xx', async () => {
    const fetchMock = vi.fn(async () => ({ status: 200, body: '{"results":[1,2]}', url: '' }));
    const c = new TripAdvisorWebClient({ transport: stubTransport(fetchMock) });
    const data = await c.getJson<{ results: number[] }>('/data/x');
    expect(data.results).toEqual([1, 2]);
  });

  it('getJson flags a non-JSON 2xx as a bot-challenge interstitial', async () => {
    const fetchMock = vi.fn(async () => ({ status: 200, body: '<html>challenge</html>', url: '' }));
    const c = new TripAdvisorWebClient({ transport: stubTransport(fetchMock) });
    await expect(c.getJson('/data/x')).rejects.toThrow(/interstitial/);
  });

  it('surfaces a DataDome interstitial as a bot-wall error', async () => {
    const body = '<html><head><script src="https://ct.captcha-delivery.com/c.js"></script>datadome</head></html>';
    const fetchMock = vi.fn(async () => ({ status: 403, body, url: '' }));
    const c = new TripAdvisorWebClient({ transport: stubTransport(fetchMock) });
    await expect(c.getHtml('/x')).rejects.toThrow(/bot wall/);
  });
});
