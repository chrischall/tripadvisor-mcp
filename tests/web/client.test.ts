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
    const r = await c.fetchRaw('/');
    expect(r.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith({ method: 'GET', path: '/', headers: {} });
  });

  it('start() is single-flight across concurrent calls', async () => {
    const fetchMock = vi.fn(async () => ({ status: 200, body: 'ok', url: '' }));
    const transport = stubTransport(fetchMock);
    const c = new TripAdvisorWebClient({ transport });
    await Promise.all([c.fetchRaw('/a'), c.fetchRaw('/b')]);
    expect(transport.start).toHaveBeenCalledTimes(1);
  });

  it('getHtml throws an actionable error on non-2xx', async () => {
    const fetchMock = vi.fn(async () => ({ status: 500, body: 'oops', url: '' }));
    const c = new TripAdvisorWebClient({ transport: stubTransport(fetchMock) });
    await expect(c.getHtml('/x')).rejects.toThrow(/answered 500/);
  });

  it('exposes only the GET-HTML surface the tools use (no JSON/POST helpers)', () => {
    const c = new TripAdvisorWebClient({ transport: stubTransport(vi.fn()) });
    expect((c as unknown as Record<string, unknown>).getJson).toBeUndefined();
    expect(c.fetchRaw.length).toBe(1); // path only — GET is implied, no method/body
  });

  it('surfaces a DataDome interstitial as a bot-wall error', async () => {
    const body = '<html><head><script src="https://ct.captcha-delivery.com/c.js"></script>datadome</head></html>';
    const fetchMock = vi.fn(async () => ({ status: 403, body, url: '' }));
    const c = new TripAdvisorWebClient({ transport: stubTransport(fetchMock) });
    await expect(c.getHtml('/x')).rejects.toThrow(/bot wall/);
  });
});
