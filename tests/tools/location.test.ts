import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { createTestHarness } from '@chrischall/mcp-utils/test';
import { client } from '../../src/client.js';
import { registerLocationTools } from '../../src/tools/location.js';

const mockGet = vi.spyOn(client, 'get').mockResolvedValue({});

// A real `/locations/{id}` record, trimmed to the keys under test (captured
// live against Terra; shape pinned in docs/TRIPADVISOR-API.md). The only media
// this payload carries is the rating-star `icon_url`.
const DETAILS = {
  id: 188151,
  geo: 'Paris',
  names: [{ language: 'en', value: 'Eiffel Tower', primary: true }],
  descriptions: [{ language: 'en', value: 'A colossal landmark.' }],
  photos: { total_count: 107633 },
  addresses: [{ street_address: 'Av. Gustave Eiffel', city: 'Paris', country_code: 'FR' }],
  coordinates: { latitude: 48.858353, longitude: 2.294464 },
  phone_numbers: [{ value: '+33 892 70 12 39', type: 'phone' }],
  urls: { tripadvisor: { main: 'https://www.tripadvisor.com/Attraction_Review-g187147-d188151.html' } },
  opening_hours: { periods: [{ day_of_week: 'Sunday', opens: '09:30', closes: '23:00' }], timezone: 'Europe/Paris' },
  traveler_ratings: {
    overall: { rating: 4.6, count: 144067, icon_url: 'https://www.tripadvisor.com/img/cdsi/img2/ratings/4.5.png' },
    breakdowns: [{ count: 1513, rating: 1, rating_name: 'Terrible' }],
  },
  recommended_visit_length: 2,
};

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

    // Same case as reviews, not as search: the caller asked for the DETAIL
    // record, so `compactLocation` is the wrong rung here even though it reads
    // exactly this shape — it would answer with the search row they already had
    // beside the id, dropping description, phone, hours and coordinates, i.e.
    // everything the detail endpoint exists to add. The incidental media is the
    // rating-star `icon_url`, which a subtractive rung drops without collapsing
    // the record. Fixture keys are from a live capture (docs/TRIPADVISOR-API.md).
    it('strips the rating icon_url BY DEFAULT while keeping every detail field', async () => {
      mockGet.mockResolvedValueOnce(DETAILS);
      const text = ((await harness.callTool('ta_get_location_details', { locationId: 188151 })).content[0] as {
        text: string;
      }).text;
      const out = JSON.parse(text);
      expect(out.traveler_ratings.overall).toEqual({ rating: 4.6, count: 144067 });
      // The fields that make this the DETAIL record all survive — this is the
      // assertion that fails if someone reaches for `compactLocation` instead.
      expect(out.descriptions[0].value).toBe('A colossal landmark.');
      expect(out.phone_numbers[0].value).toBe('+33 892 70 12 39');
      expect(out.coordinates).toEqual({ latitude: 48.858353, longitude: 2.294464 });
      expect(out.opening_hours.timezone).toBe('Europe/Paris');
      expect(text).not.toContain('icon_url');
    });

    it('returns the whole record on view:"full"', async () => {
      mockGet.mockResolvedValueOnce(DETAILS);
      const text = ((await harness.callTool('ta_get_location_details', { locationId: 188151, view: 'full' }))
        .content[0] as { text: string }).text;
      expect(JSON.parse(text)).toEqual(DETAILS);
    });

    // `view` is ours, not Terra's — leaking it into the query string would 400.
    it('does not put view into the Terra query string', async () => {
      await harness.callTool('ta_get_location_details', { locationId: 188151, view: 'full' });
      expect(mockGet).toHaveBeenCalledWith('/locations/188151', { cache: 'static' });
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
