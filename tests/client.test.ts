import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpToolError, UpstreamFormatError } from '@chrischall/mcp-utils';
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

  // ── Error-message contract, pinned exactly (fleet-audit #1131 moves the
  //    transport onto mcp-utils createApiClient; these must not drift). ──
  it('401 and 403 keep the exact Terra-vs-legacy key message and hint', async () => {
    for (const status of [401, 403]) {
      const fetchImpl = vi.fn(async () => jsonResponse({ message: 'no' }, status));
      const c = new TripAdvisorClient({ fetchImpl: fetchImpl as unknown as typeof fetch });
      const err = await c.get('/locations/1').catch((e) => e);
      expect(err).toBeInstanceOf(McpToolError);
      expect(err.message).toBe(
        `TripAdvisor Terra API returned ${status} — TRIPADVISOR_API_KEY is missing, invalid, or not authorized for Terra. A legacy Content API key does NOT work here (and a Terra key does not work on the legacy endpoint).`,
      );
      expect(err.hint).toMatch(/Terra dashboard/);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  });

  it('a CDN/WAF 403 is reported as an edge block, not as a bad key', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response('<html>blocked</html>', { status: 403, headers: { 'cf-mitigated': 'challenge', 'content-type': 'text/html' } }),
    );
    const c = new TripAdvisorClient({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const err = await c.get('/locations/1').catch((e) => e);
    expect(err).toBeInstanceOf(McpToolError);
    expect(err.message).toMatch(/Cloudflare/);
    expect(err.message).not.toMatch(/TRIPADVISOR_API_KEY/);
  });

  it('400 keeps the exact "rejected the request" message with the validation body', async () => {
    const body = { detail: 'Parameter is not valid', field_errors: [{ field: 'radius', message: 'required' }] };
    const fetchImpl = vi.fn(async () => jsonResponse(body, 400));
    const c = new TripAdvisorClient({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const err = await c.get('/locations/nearby?lat=1').catch((e) => e);
    expect(err).toBeInstanceOf(McpToolError);
    expect(err.message).toBe(`TripAdvisor Terra API rejected the request (400): ${JSON.stringify(body)}`);
    expect(err.hint).toMatch(/TRIPADVISOR-API\.md/);
  });

  it('other non-2xx keep the formatApiError shape', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ message: 'boom' }, 500));
    const c = new TripAdvisorClient({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const err = await c.get('/locations/search?query=x').catch((e) => e);
    expect(err).toBeInstanceOf(McpToolError);
    expect(err.message).toBe('TripAdvisor Terra API error 500 for GET /locations/search?query=x: {"message":"boom"}');
    expect(fetchImpl).toHaveBeenCalledTimes(1); // 500 is not retried
  });

  it('a non-JSON 2xx (e.g. an HTML maintenance page) is an mcp-utils UpstreamFormatError naming the path, not a raw SyntaxError', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response('<html><body>Down for maintenance</body></html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
    );
    const c = new TripAdvisorClient({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const err = await c.get('/locations/1').catch((e) => e);
    expect(err).toBeInstanceOf(UpstreamFormatError);
    expect(err.message).toBe('TripAdvisor Terra API returned a non-JSON response to GET /locations/1 (HTTP 200, text/html).');
    expect(err.message).not.toContain(KEY);
  });

  it('an exhausted 429 keeps the exact quota message', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, 429));
    const c = new TripAdvisorClient({ fetchImpl: fetchImpl as unknown as typeof fetch, sleep: async () => {} });
    const err = await c.get('/locations/1').catch((e) => e);
    expect(err.message).toBe('TripAdvisor Terra API rate limit or daily quota exceeded (429).');
    expect(err.hint).toMatch(/10,000 calls\/day/);
  });

  // ── Timing, with fake timers against the real sleep and timeout ──
  describe('timing (fake timers)', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('waits the Retry-After before the single retry, and no longer', async () => {
      vi.useFakeTimers();
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({}, 429, { 'retry-after': '4' }))
        .mockResolvedValueOnce(jsonResponse({ data: [] }));
      const c = new TripAdvisorClient({ fetchImpl: fetchImpl as unknown as typeof fetch });
      const pending = c.get('/locations/search?query=x');
      await vi.advanceTimersByTimeAsync(3_999);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await expect(pending).resolves.toEqual({ data: [] });
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it('caps a huge Retry-After at 10s', async () => {
      vi.useFakeTimers();
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({}, 429, { 'retry-after': '3600' }))
        .mockResolvedValueOnce(jsonResponse({ data: [] }));
      const c = new TripAdvisorClient({ fetchImpl: fetchImpl as unknown as typeof fetch });
      const pending = c.get('/locations/search?query=x');
      await vi.advanceTimersByTimeAsync(9_999);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await expect(pending).resolves.toEqual({ data: [] });
    });

    it('falls back to 1s when Retry-After is absent', async () => {
      vi.useFakeTimers();
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({}, 429))
        .mockResolvedValueOnce(jsonResponse({ data: [] }));
      const c = new TripAdvisorClient({ fetchImpl: fetchImpl as unknown as typeof fetch });
      const pending = c.get('/locations/search?query=x');
      await vi.advanceTimersByTimeAsync(999);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await expect(pending).resolves.toEqual({ data: [] });
    });

    it('times a hung request out at 30s with an actionable McpToolError', async () => {
      vi.useFakeTimers();
      const fetchImpl = vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
          }),
      );
      const c = new TripAdvisorClient({ fetchImpl: fetchImpl as unknown as typeof fetch });
      const pending = c.get('/locations/1').catch((e) => e);
      await vi.advanceTimersByTimeAsync(29_999);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      const err = await pending;
      expect(err).toBeInstanceOf(McpToolError);
      expect(err.message).toBe('TripAdvisor Terra API request timed out after 30s.');
    });

    it('gives the retry its own fresh 30s window (bounding the body read too)', async () => {
      vi.useFakeTimers();
      let n = 0;
      const fetchImpl = vi.fn(async () => {
        n += 1;
        if (n === 1) return jsonResponse({}, 429, { 'retry-after': '10' });
        // The retry's body stalls; only its own timeout can end it.
        return new Response(new ReadableStream<Uint8Array>({ start() {} }), { status: 200 });
      });
      const c = new TripAdvisorClient({ fetchImpl: fetchImpl as unknown as typeof fetch });
      const pending = c.get('/locations/1').catch((e) => e);
      await vi.advanceTimersByTimeAsync(10_000 + 29_999);
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1);
      expect((await pending).message).toMatch(/timed out after 30s/);
    });
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
