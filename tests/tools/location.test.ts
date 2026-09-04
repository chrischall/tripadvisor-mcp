import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { createTestHarness } from '@chrischall/mcp-utils/test';
import { client } from '../../src/client.js';
import { registerLocationTools } from '../../src/tools/location.js';

const mockGet = vi.spyOn(client, 'get').mockResolvedValue({});

let harness: Awaited<ReturnType<typeof createTestHarness>>;

beforeEach(() => mockGet.mockClear());
afterAll(async () => {
  if (harness) await harness.close();
});

describe('location tools (Terra)', () => {
  it('setup', async () => {
    harness = await createTestHarness((server) => registerLocationTools(server));
  });

  describe('ta_get_locations (batch)', () => {
    it('calls /locations with repeated id params', async () => {
      await harness.callTool('ta_get_locations', { ids: [1, 2, 3] });
      expect(mockGet).toHaveBeenCalledWith('/locations?id=1&id=2&id=3', { cache: 'static' });
    });

    it('projects to compact BY DEFAULT', async () => {
      mockGet.mockResolvedValueOnce({
        data: [{ id: 1, names: [{ value: 'A', primary: true }], traveler_ratings: { overall: { rating: 4, count: 2 } } }],
      });
      const result = await harness.callTool('ta_get_locations', { ids: [1] });
      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('"name":"A"');
      expect(text).toContain('"rating":4');
      expect(text).not.toContain('traveler_ratings');
    });

    it('rejects an empty id list', async () => {
      expect((await harness.callTool('ta_get_locations', { ids: [] })).isError).toBe(true);
      expect(mockGet).not.toHaveBeenCalled();
    });
  });

  describe('ta_get_location_details', () => {
    it('calls /locations/{id} on the static cache tier', async () => {
      await harness.callTool('ta_get_location_details', { locationId: 89575 });
      expect(mockGet).toHaveBeenCalledWith('/locations/89575', { cache: 'static' });
    });

    it('repeats the locale param', async () => {
      await harness.callTool('ta_get_location_details', { locationId: 89575, locale: ['fr', 'en'] });
      expect(mockGet).toHaveBeenCalledWith('/locations/89575?locale=fr&locale=en', { cache: 'static' });
    });

    it('rejects a non-integer locationId', async () => {
      expect((await harness.callTool('ta_get_location_details', { locationId: 1.5 })).isError).toBe(true);
      expect(mockGet).not.toHaveBeenCalled();
    });
  });

  describe('ta_get_location_photos', () => {
    it('calls /locations/{id}/photos with paging', async () => {
      await harness.callTool('ta_get_location_photos', { locationId: 89575, page: 1, size: 5 });
      expect(mockGet).toHaveBeenCalledWith('/locations/89575/photos?page=1&size=5', { cache: 'static' });
    });

    // This tool's product IS the image URLs, and a photos item hangs its whole
    // payload off the media key `photo`, so media-stripping would empty the
    // response rather than shrink it. The guard is the SCHEMA: with no `view`
    // param there is no rung a caller (or an injected instruction) can pick
    // that reaches `stripMediaUrls`. Asserting the URLs survive would pass even
    // if someone wired `view` and only defaulted it to `full`; asserting the
    // param is absent is what actually holds the decision in place.
    it('exposes NO view param, and returns the image URLs untouched', async () => {
      const { tools } = await harness.client.listTools();
      const photoTool = tools.find((t) => t.name === 'ta_get_location_photos');
      expect(Object.keys(photoTool!.inputSchema.properties ?? {})).not.toContain('view');
      // …and the sibling that DOES media-strip proves the assertion can fail.
      const reviewTool = tools.find((t) => t.name === 'ta_get_location_reviews');
      expect(Object.keys(reviewTool!.inputSchema.properties ?? {})).toContain('view');

      const photos = { data: [{ id: 7, photo: { original_size_url: 'https://x/p.jpg' } }], pagination: { page: 1 } };
      mockGet.mockResolvedValueOnce(photos);
      const text = ((await harness.callTool('ta_get_location_photos', { locationId: 89575 })).content[0] as {
        text: string;
      }).text;
      expect(JSON.parse(text)).toEqual(photos);
    });
  });

  describe('ta_get_location_reviews', () => {
    it('calls /locations/{id}/reviews', async () => {
      await harness.callTool('ta_get_location_reviews', { locationId: 89575, size: 5 });
      expect(mockGet).toHaveBeenCalledWith('/locations/89575/reviews?size=5', { cache: 'static' });
    });

    // The opposite case to photos: a review's product is its TEXT, so the
    // avatars riding along are incidental and there is no projection to speak
    // for the shape — compact means `stripMediaUrls`. This is also the call
    // that makes that fallback in `viewResponse` reachable at all.
    it('strips reviewer avatars BY DEFAULT while keeping the review text', async () => {
      mockGet.mockResolvedValueOnce({
        data: [{ id: 9, text: 'Windy but spectacular.', user: { username: 'a', avatar: { large: 'https://x/a.jpg' } } }],
      });
      const text = ((await harness.callTool('ta_get_location_reviews', { locationId: 89575 })).content[0] as {
        text: string;
      }).text;
      expect(text).toContain('"text":"Windy but spectacular."');
      expect(text).toContain('"username":"a"');
      expect(text).not.toContain('avatar');
    });

    it('returns the whole record on view:"full"', async () => {
      const raw = { data: [{ id: 9, text: 'Hi', user: { username: 'a', avatar: { large: 'https://x/a.jpg' } } }] };
      mockGet.mockResolvedValueOnce(raw);
      const text = ((await harness.callTool('ta_get_location_reviews', { locationId: 89575, view: 'full' })).content[0] as {
        text: string;
      }).text;
      expect(JSON.parse(text)).toEqual(raw);
    });

    // `view` is ours, not Terra's — leaking it into the query string would 400.
    it('does not put view into the Terra query string', async () => {
      await harness.callTool('ta_get_location_reviews', { locationId: 89575, view: 'full' });
      expect(mockGet).toHaveBeenCalledWith('/locations/89575/reviews', { cache: 'static' });
    });
  });
});
