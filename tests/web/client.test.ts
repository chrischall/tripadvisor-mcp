import { describe, it, expect, vi } from 'vitest';
import { TripAdvisorWebClient } from '../../src/web/client.js';
import type { FetchproxyTransport } from '../../src/web/transport.js';
import { EdgeBlockedError, McpToolError } from '@chrischall/mcp-utils';
import { classifyBotWall } from '@chrischall/mcp-utils/fetchproxy';
import {
  CLOUDFLARE_JS_CHALLENGE_HTML,
  PAGE_MENTIONING_CHALLENGE_HOST_HTML,
} from '../fixtures/cloudflare-challenge.js';

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

  // fleet-audit #1182: the "Just a moment…" JS challenge is a different page
  // from the "Attention Required!" block page, and it can arrive as a 200.
  it.each([403, 503, 200])(
    'surfaces a Cloudflare "Just a moment" JS challenge (status %i) as a bot-wall error',
    async (status) => {
      const fetchMock = vi.fn(async () => ({ status, body: CLOUDFLARE_JS_CHALLENGE_HTML, url: '' }));
      const c = new TripAdvisorWebClient({ transport: stubTransport(fetchMock) });
      const err = await c.getHtml('/x').then(
        () => undefined,
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(McpToolError);
      expect((err as Error).message).toMatch(/bot wall \(cloudflare\)/i);
      expect((err as McpToolError).hint).toMatch(/complete any challenge/);
      expect((err as Error).cause).toBeInstanceOf(EdgeBlockedError);
    },
  );

  it('returns a normal page that merely mentions challenges.cloudflare.com', async () => {
    const fetchMock = vi.fn(async () => ({ status: 200, body: PAGE_MENTIONING_CHALLENGE_HOST_HTML, url: '' }));
    const c = new TripAdvisorWebClient({ transport: stubTransport(fetchMock) });
    await expect(c.getHtml('/x')).resolves.toBe(PAGE_MENTIONING_CHALLENGE_HOST_HTML);
  });

  // The library classifier the client falls back to must agree on its own
  // (@fetchproxy/server >= 3.6.1), not lean on detectEdgeBlock alone.
  it('the library bot-wall classifier flags the JS challenge and not a page mentioning the challenge host', () => {
    expect(classifyBotWall(CLOUDFLARE_JS_CHALLENGE_HTML, 200)).toEqual({ blocked: true, vendor: 'cloudflare' });
    expect(classifyBotWall(CLOUDFLARE_JS_CHALLENGE_HTML, 403)).toEqual({ blocked: true, vendor: 'cloudflare' });
    expect(classifyBotWall(PAGE_MENTIONING_CHALLENGE_HOST_HTML, 200)).toEqual({ blocked: false });
  });
});
