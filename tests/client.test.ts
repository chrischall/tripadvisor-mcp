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

describe('TripAdvisorClient (Terra)', () => {
  beforeEach(() => {
    process.env.TRIPADVISOR_API_KEY = KEY;
  });
  afterEach(() => {
    delete process.env.TRIPADVISOR_API_KEY;
    vi.restoreAllMocks();
  });

  it('GET hits the Terra base URL, sends X-API-Key, and never puts the key in the URL', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ data: [] }));
    const c = new TripAdvisorClient({ fetchImpl: fetchImpl as unknown as typeof fetch });
    await c.get('/locations/search?query=Boston');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toBe('https://terra.tripadvisor.com/api/locations/search?query=Boston');
    expect(headerOf(init, 'x-api-key')).toBe(KEY);
    expect(headerOf(init, 'accept')).toBe('application/json');
    expect(String(url)).not.toContain(KEY);
  });

  it('defers the missing-key config error to the first request', async () => {
    delete process.env.TRIPADVISOR_API_KEY;
    const fetchImpl = vi.fn();
    const c = new TripAdvisorClient({ fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(c.get('/locations/1')).rejects.toThrow(/TRIPADVISOR_API_KEY/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('never leaks the key in error messages', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ message: 'boom' }, 500));
    const c = new TripAdvisorClient({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const err = await c.get('/locations/search?query=x').catch((e: Error) => e);
    expect((err as Error).message).not.toContain(KEY);
  });

  it('maps 401/403 to a Terra-vs-legacy key message', async () => {
    for (const status of [401, 403]) {
      const fetchImpl = vi.fn(async () => jsonResponse({ message: 'no' }, status));
      const c = new TripAdvisorClient({ fetchImpl: fetchImpl as unknown as typeof fetch });
      await expect(c.get('/locations/1')).rejects.toThrow(/Terra|not authorized/i);
    }
  });

  it('surfaces the structured 400 validation detail', async () => {
    const body = { detail: 'Parameter is not valid', field_errors: [{ field: 'radius', message: 'required' }] };
    const fetchImpl = vi.fn(async () => jsonResponse(body, 400));
    const c = new TripAdvisorClient({ fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(c.get('/locations/nearby')).rejects.toThrow(/400/);
  });

  it('retries once on 429 honoring Retry-After', async () => {
    const sleeps: number[] = [];
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 429, { 'retry-after': '2' }))
      .mockResolvedValueOnce(jsonResponse({ data: [] }));
    const c = new TripAdvisorClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    await c.get('/locations/search?query=x');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleeps).toEqual([2000]);
  });

  it('surfaces a quota hint when the 429 retry also fails', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, 429));
    const c = new TripAdvisorClient({ fetchImpl: fetchImpl as unknown as typeof fetch, sleep: async () => {} });
    await expect(c.get('/locations/1')).rejects.toThrow(/quota|rate/i);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('caches GET responses within the TTL and refetches after expiry', async () => {
    let n = 0;
    const fetchImpl = vi.fn(async () => jsonResponse({ n: ++n }));
    let t = 1_000;
    const c = new TripAdvisorClient({ fetchImpl: fetchImpl as unknown as typeof fetch, cacheTtlMs: 5_000, now: () => t });
    const a = await c.get('/locations/search?query=x');
    const b = await c.get('/locations/search?query=x');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(b).toEqual(a);
    t += 6_000;
    await c.get('/locations/search?query=x');
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
    await c.get('/locations/1', { cache: 'static' });
    t += 30_000;
    await c.get('/locations/1', { cache: 'static' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('a TTL of 0 disables caching', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: true }));
    const c = new TripAdvisorClient({ fetchImpl: fetchImpl as unknown as typeof fetch, cacheTtlMs: 0 });
    await c.get('/locations/search?query=x');
    await c.get('/locations/search?query=x');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
