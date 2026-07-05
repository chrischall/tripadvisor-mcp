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
  });

  describe('ta_get_location_reviews', () => {
    it('calls /locations/{id}/reviews', async () => {
      await harness.callTool('ta_get_location_reviews', { locationId: 89575, size: 5 });
      expect(mockGet).toHaveBeenCalledWith('/locations/89575/reviews?size=5', { cache: 'static' });
    });
  });
});
