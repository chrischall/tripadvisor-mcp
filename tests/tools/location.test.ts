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

describe('location tools', () => {
  it('setup', async () => {
    harness = await createTestHarness((server) => registerLocationTools(server));
  });

  describe('ta_get_location_details', () => {
    it('calls /location/{id}/details on the static cache tier', async () => {
      await harness.callTool('ta_get_location_details', { locationId: 89575 });
      expect(mockGet).toHaveBeenCalledWith('/location/89575/details', { cache: 'static' });
    });

    it('passes language and currency through', async () => {
      await harness.callTool('ta_get_location_details', {
        locationId: 89575,
        language: 'fr',
        currency: 'EUR',
      });
      expect(mockGet).toHaveBeenCalledWith('/location/89575/details?language=fr&currency=EUR', {
        cache: 'static',
      });
    });

    it('rejects a non-integer locationId', async () => {
      const result = await harness.callTool('ta_get_location_details', { locationId: 1.5 });
      expect(result.isError).toBe(true);
      expect(mockGet).not.toHaveBeenCalled();
    });
  });

  describe('ta_get_location_photos', () => {
    it('calls /location/{id}/photos with paging and source filter', async () => {
      await harness.callTool('ta_get_location_photos', {
        locationId: 89575,
        limit: 5,
        offset: 10,
        source: 'Traveler,Expert',
      });
      expect(mockGet).toHaveBeenCalledWith(
        '/location/89575/photos?limit=5&offset=10&source=Traveler%2CExpert',
        { cache: 'static' },
      );
    });

    it('rejects an invalid source list', async () => {
      const result = await harness.callTool('ta_get_location_photos', {
        locationId: 89575,
        source: 'Paparazzi',
      });
      expect(result.isError).toBe(true);
      expect(mockGet).not.toHaveBeenCalled();
    });
  });

  describe('ta_get_location_reviews', () => {
    it('calls /location/{id}/reviews', async () => {
      await harness.callTool('ta_get_location_reviews', { locationId: 89575, limit: 5 });
      expect(mockGet).toHaveBeenCalledWith('/location/89575/reviews?limit=5', { cache: 'static' });
    });
  });
});
