import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { createTestHarness } from '@chrischall/mcp-utils/test';
import { webClient } from '../../src/web/client.js';
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
    expect(text).toContain('"location_id": 104675');
    expect(text).toContain('"name": "Golden Gate Bridge"');
    expect(text).toContain('"rating": 4.7');
    expect(text).toContain('"review_count": 49969');
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
});
