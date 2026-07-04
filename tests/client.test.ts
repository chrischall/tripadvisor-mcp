import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TripAdvisorClient } from '../src/client.js';

const KEY = 'ta-test-key';

function headerOf(init: RequestInit | undefined, name: string): string | null {
  const h = init?.headers;
  if (!h) return null;
  if (h instanceof Headers) return h.get(name);
  const rec = h as Record<string, string>;
  const hit = Object.keys(rec).find((k) => k.toLowerCase() === name.toLowerCase());
  return hit ? rec[hit] : null;
}

const jsonResponse = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

describe('TripAdvisorClient', () => {
  beforeEach(() => {
    process.env.TRIPADVISOR_API_KEY = KEY;
    delete process.env.TRIPADVISOR_REFERER;
  });
  afterEach(() => {
    delete process.env.TRIPADVISOR_API_KEY;
    delete process.env.TRIPADVISOR_REFERER;
    vi.restoreAllMocks();
  });

  it('GET appends the key as a query parameter and sends Accept: application/json', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ data: [] }));
    const c = new TripAdvisorClient({ fetchImpl: fetchImpl as unknown as typeof fetch });
    await c.get('/location/search?searchQuery=Boston');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toBe(
      `https://api.content.tripadvisor.com/api/v1/location/search?searchQuery=Boston&key=${KEY}`,
    );
    expect(headerOf(init, 'accept')).toBe('application/json');
    expect(headerOf(init, 'referer')).toBeNull();
  });

  it('uses ? as the separator when the path has no query string', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}));
    const c = new TripAdvisorClient({ fetchImpl: fetchImpl as unknown as typeof fetch });
    await c.get('/location/12345/details');
    const [url] = fetchImpl.mock.calls[0] as unknown as [string];
    expect(String(url)).toBe(`https://api.content.tripadvisor.com/api/v1/location/12345/details?key=${KEY}`);
  });

  it('sends the Referer header when TRIPADVISOR_REFERER is set', async () => {
    process.env.TRIPADVISOR_REFERER = 'https://example.com';
    const fetchImpl = vi.fn(async () => jsonResponse({}));
    const c = new TripAdvisorClient({ fetchImpl: fetchImpl as unknown as typeof fetch });
    await c.get('/location/1/details');
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(headerOf(init, 'referer')).toBe('https://example.com');
  });

  it('defers the missing-key config error to the first request', async () => {
    delete process.env.TRIPADVISOR_API_KEY;
    const fetchImpl = vi.fn();
    const c = new TripAdvisorClient({ fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(c.get('/location/1/details')).rejects.toThrow(/TRIPADVISOR_API_KEY/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('never leaks the key in error messages', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: { message: 'boom', code: 500 } }, 500));
    const c = new TripAdvisorClient({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const err = await c.get('/location/search?searchQuery=x').catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).not.toContain(KEY);
  });

  it('maps 401 to an invalid-key message and 403 to a restriction message', async () => {
    const fetch401 = vi.fn(async () => jsonResponse({ error: { message: 'Invalid key' } }, 401));
    const c401 = new TripAdvisorClient({ fetchImpl: fetch401 as unknown as typeof fetch });
    await expect(c401.get('/location/1/details')).rejects.toThrow(/invalid/i);

    const fetch403 = vi.fn(async () => jsonResponse({ error: { message: 'Forbidden' } }, 403));
    const c403 = new TripAdvisorClient({ fetchImpl: fetch403 as unknown as typeof fetch });
    await expect(c403.get('/location/1/details')).rejects.toThrow(/restrict/i);
  });

  it('retries once on 429 and honors Retry-After', async () => {
    const sleeps: number[] = [];
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: {} }, 429, { 'retry-after': '2' }))
      .mockResolvedValueOnce(jsonResponse({ data: [] }));
    const c = new TripAdvisorClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    const data = await c.get<{ data: unknown[] }>('/location/search?searchQuery=x');
    expect(data.data).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleeps).toEqual([2000]);
  });

  it('surfaces a quota hint when the 429 retry also fails', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: {} }, 429));
    const c = new TripAdvisorClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep: async () => {},
    });
    await expect(c.get('/location/1/details')).rejects.toThrow(/quota|rate/i);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('caches GET responses within the TTL and refetches after expiry', async () => {
    let n = 0;
    const fetchImpl = vi.fn(async () => jsonResponse({ n: ++n }));
    let t = 1_000;
    const c = new TripAdvisorClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      cacheTtlMs: 5_000,
      now: () => t,
    });
    const a = await c.get('/location/search?searchQuery=x');
    const b = await c.get('/location/search?searchQuery=x');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(b).toEqual(a);
    t += 6_000;
    await c.get('/location/search?searchQuery=x');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('static-tier reads use the longer TTL', async () => {
    let n = 0;
    const fetchImpl = vi.fn(async () => jsonResponse({ n: ++n }));
    let t = 1_000;
    const c = new TripAdvisorClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      cacheTtlMs: 5_000,
      staticCacheTtlMs: 60_000,
      now: () => t,
    });
    await c.get('/location/1/details', { cache: 'static' });
    t += 30_000; // past dynamic TTL, inside static TTL
    await c.get('/location/1/details', { cache: 'static' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    t += 60_000;
    await c.get('/location/1/details', { cache: 'static' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('a TTL of 0 disables caching', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: true }));
    const c = new TripAdvisorClient({ fetchImpl: fetchImpl as unknown as typeof fetch, cacheTtlMs: 0 });
    await c.get('/location/search?searchQuery=x');
    await c.get('/location/search?searchQuery=x');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
