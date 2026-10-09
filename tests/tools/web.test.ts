import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { createTestHarness } from '@chrischall/mcp-utils/test';
import { TripAdvisorWebClient, webClient } from '../../src/web/client.js';
import {
  CLOUDFLARE_JS_CHALLENGE_HTML,
  PAGE_MENTIONING_CHALLENGE_HOST_HTML,
} from '../fixtures/cloudflare-challenge.js';
import { registerWebTools } from '../../src/tools/web.js';

const businessHtml = (over: Record<string, unknown> = {}) =>
  `<script type="application/ld+json">${JSON.stringify({
    '@type': 'LocalBusiness',
    name: 'Golden Gate Bridge',
    url: 'https://www.tripadvisor.com/Attraction_Review-g60713-d104675-Reviews-x.html',
    aggregateRating: { ratingValue: '4.7', reviewCount: 49969, bestRating: 5 },
    geo: { latitude: 37.82, longitude: -122.478 },
    telephone: '+1 415-921-5858',
    address: { '@type': 'PostalAddress', addressLocality: 'San Francisco' },
    ...over,
  })}</script>`;

const mockGetLocationHtml = vi.spyOn(webClient, 'getLocationHtml').mockResolvedValue(businessHtml());

let harness: Awaited<ReturnType<typeof createTestHarness>>;
beforeEach(() => mockGetLocationHtml.mockClear());
afterAll(async () => {
  if (harness) await harness.close();
});

describe('ta_web_get_location', () => {
  it('setup', async () => {
    harness = await createTestHarness((s) => registerWebTools(s));
  });

  it('fetches by id and returns the parsed detail', async () => {
    const result = await harness.callTool('ta_web_get_location', { locationId: 104675 });
    expect(mockGetLocationHtml).toHaveBeenCalledWith(104675);
    expect(result.isError).toBeFalsy();
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('"location_id":104675');
    expect(text).toContain('"name":"Golden Gate Bridge"');
    expect(text).toContain('"rating":4.7');
    expect(text).toContain('"review_count":49969');
  });

  it('rejects a non-integer id before any fetch', async () => {
    const result = await harness.callTool('ta_web_get_location', { locationId: 1.5 });
    expect(result.isError).toBe(true);
    expect(mockGetLocationHtml).not.toHaveBeenCalled();
  });

  it('errors when the page has no business node', async () => {
    mockGetLocationHtml.mockResolvedValueOnce('<html><head></head><body>shell</body></html>');
    const result = await harness.callTool('ta_web_get_location', { locationId: 104675 });
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toMatch(/could not parse/i);
  });

  it('passes the requested id to the parser and errors on a different listing instead of mislabelling it', async () => {
    mockGetLocationHtml.mockResolvedValueOnce(businessHtml());
    const result = await harness.callTool('ta_web_get_location', { locationId: 60713 });
    expect(result.isError).toBe(true);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toMatch(/d104675/);
    expect(text).not.toMatch(/ta_web_healthcheck/);
  });

  it('returns a zero-review listing without a rating instead of a bot-challenge error', async () => {
    mockGetLocationHtml.mockResolvedValueOnce(businessHtml({ aggregateRating: undefined }));
    const result = await harness.callTool('ta_web_get_location', { locationId: 104675 });
    expect(result.isError).toBeFalsy();
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('"name":"Golden Gate Bridge"');
    expect(text).not.toContain('"rating"');
  });

  // fleet-audit #1182: run the REAL getLocationHtml (bot-wall guard included)
  // over a stubbed bridge response, so the tool sees what the bridge returns.
  function serveFromBridge(status: number, body: string) {
    mockGetLocationHtml.mockImplementationOnce((id: number) =>
      TripAdvisorWebClient.prototype.getLocationHtml.call(webClient, id),
    );
    return vi.spyOn(webClient, 'fetchRaw').mockResolvedValueOnce({ status, body });
  }

  it('reports a Cloudflare "Just a moment" challenge as a bot wall, not content or a parse failure', async () => {
    const fetchRaw = serveFromBridge(200, CLOUDFLARE_JS_CHALLENGE_HTML);
    const result = await harness.callTool('ta_web_get_location', { locationId: 104675 });
    fetchRaw.mockRestore();
    expect(result.isError).toBe(true);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toMatch(/bot wall \(cloudflare\)/i);
    expect(text).toMatch(/complete any challenge, then retry/);
    expect(text).not.toMatch(/could not parse/i);
  });

  it('does not treat a page that merely mentions challenges.cloudflare.com as a bot wall', async () => {
    const fetchRaw = serveFromBridge(200, PAGE_MENTIONING_CHALLENGE_HOST_HTML);
    const result = await harness.callTool('ta_web_get_location', { locationId: 104675 });
    fetchRaw.mockRestore();
    // The page reaches the parser (it has no business node, so it's a parse
    // error) — the point is it was never classified as a wall.
    const text = (result.content[0] as { text: string }).text;
    expect(text).not.toMatch(/bot wall/);
    expect(text).toMatch(/could not parse/i);
  });
});
