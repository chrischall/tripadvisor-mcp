import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { createTestHarness } from '@chrischall/mcp-utils/test';
import { client } from '../../src/client.js';
import { registerSearchTools } from '../../src/tools/search.js';

const mockGet = vi.spyOn(client, 'get').mockResolvedValue({ data: [], pagination: {} });

let harness: Awaited<ReturnType<typeof createTestHarness>>;

beforeEach(() => mockGet.mockClear());
afterAll(async () => {
  if (harness) await harness.close();
});

describe('search tools (Terra)', () => {
  it('setup', async () => {
    harness = await createTestHarness((server) => registerSearchTools(server));
  });

  describe('ta_search_locations', () => {
    it('calls /locations/search with the query on the dynamic cache tier', async () => {
      await harness.callTool('ta_search_locations', { query: 'Fenway Park' });
      expect(mockGet).toHaveBeenCalledWith('/locations/search?query=Fenway%20Park', { cache: 'dynamic' });
    });

    it('passes filters and repeats locale', async () => {
      await harness.callTool('ta_search_locations', {
        query: 'pizza',
        category: 'RESTAURANT',
        country_code: 'US',
        geo_name: 'Boston',
        postal_code: '02115',
        locale: ['en', 'es'],
        page: 2,
        size: 10,
      });
      const path = mockGet.mock.calls[0][0] as string;
      expect(path).toContain('category=RESTAURANT');
      expect(path).toContain('country_code=US');
      expect(path).toContain('geo_name=Boston');
      expect(path).toContain('postal_code=02115');
      expect(path).toContain('locale=en&locale=es');
      expect(path).toContain('page=2');
      expect(path).toContain('size=10');
    });

    it('rejects an invalid category and an over-max size', async () => {
      expect((await harness.callTool('ta_search_locations', { query: 'x', category: 'geos' })).isError).toBe(true);
      expect((await harness.callTool('ta_search_locations', { query: 'x', size: 50 })).isError).toBe(true);
      expect(mockGet).not.toHaveBeenCalled();
    });

    it('projects to compact when requested', async () => {
      mockGet.mockResolvedValueOnce({
        data: [{ location: { id: 7, names: [{ value: 'Z', primary: true }] }, matched_value: { value: 'Z' } }],
        pagination: { page: 1 },
      });
      const result = await harness.callTool('ta_search_locations', { query: 'z', compact: true });
      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('"id": 7');
      expect(text).toContain('"name": "Z"');
      expect(text).not.toContain('matched_value');
    });
  });

  describe('ta_search_nearby', () => {
    it('calls /locations/nearby with lat/lon/radius', async () => {
      await harness.callTool('ta_search_nearby', { lat: 42.3455, lon: -71.10767, radius: 5, unit: 'KM' });
      const path = mockGet.mock.calls[0][0] as string;
      expect(path).toContain('/locations/nearby?');
      expect(path).toContain('lat=42.3455');
      expect(path).toContain('lon=-71.10767');
      expect(path).toContain('radius=5');
      expect(path).toContain('unit=KM');
      expect(mockGet.mock.calls[0][1]).toEqual({ cache: 'dynamic' });
    });

    it('accepts a bounding box (no radius)', async () => {
      await harness.callTool('ta_search_nearby', { sw_lat: 37.8, sw_lon: -122.5, ne_lat: 37.83, ne_lon: -122.45 });
      const path = mockGet.mock.calls[0][0] as string;
      expect(path).toContain('sw_lat=37.8');
      expect(path).toContain('ne_lon=-122.45');
      expect(path).not.toContain('radius');
    });

    it('accepts a location_id center with radius', async () => {
      await harness.callTool('ta_search_nearby', { location_id: 104675, radius: 3 });
      expect(mockGet.mock.calls[0][0]).toContain('location_id=104675');
      expect(mockGet.mock.calls[0][0]).toContain('radius=3');
    });

    it('rejects zero or multiple center modes', async () => {
      // none
      expect((await harness.callTool('ta_search_nearby', { radius: 5 })).isError).toBe(true);
      // two (lat/lon AND location_id)
      expect(
        (await harness.callTool('ta_search_nearby', { lat: 1, lon: 2, location_id: 3, radius: 5 })).isError,
      ).toBe(true);
      expect(mockGet).not.toHaveBeenCalled();
    });

    it('rejects a partial bounding box (1–3 of 4 corners), even with another valid center', async () => {
      // partial box alone
      expect((await harness.callTool('ta_search_nearby', { sw_lat: 37.8, sw_lon: -122.5 })).isError).toBe(true);
      // partial box bleeding alongside a valid lat/lon center
      expect(
        (await harness.callTool('ta_search_nearby', { lat: 1, lon: 2, radius: 5, sw_lat: 37.8 })).isError,
      ).toBe(true);
      expect(mockGet).not.toHaveBeenCalled();
    });

    it('rejects a lone lat or lon', async () => {
      expect((await harness.callTool('ta_search_nearby', { lat: 1, radius: 5 })).isError).toBe(true);
      expect((await harness.callTool('ta_search_nearby', { location_id: 3, radius: 5, lon: 2 })).isError).toBe(true);
      expect(mockGet).not.toHaveBeenCalled();
    });

    it('requires radius for lat/lon and location_id modes', async () => {
      expect((await harness.callTool('ta_search_nearby', { lat: 42.3, lon: -71.1 })).isError).toBe(true);
      expect((await harness.callTool('ta_search_nearby', { location_id: 5 })).isError).toBe(true);
      expect(mockGet).not.toHaveBeenCalled();
    });

    it('passes optional filters through', async () => {
      await harness.callTool('ta_search_nearby', {
        lat: 42.3,
        lon: -71.1,
        radius: 2,
        category: 'HOTEL',
        min_rating: 4,
        include_photo: true,
        sort: 'rating',
      });
      const path = mockGet.mock.calls[0][0] as string;
      expect(path).toContain('category=HOTEL');
      expect(path).toContain('min_rating=4');
      expect(path).toContain('include_photo=true');
      expect(path).toContain('sort=rating');
    });
  });
});
