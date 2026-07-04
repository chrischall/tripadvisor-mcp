import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { createTestHarness } from '@chrischall/mcp-utils/test';
import { client } from '../../src/client.js';
import { registerSearchTools } from '../../src/tools/search.js';

// Tool registrars use the module-level `client` singleton; spy on its `get`.
const mockGet = vi.spyOn(client, 'get').mockResolvedValue({ data: [] });

let harness: Awaited<ReturnType<typeof createTestHarness>>;

beforeEach(() => mockGet.mockClear());
afterAll(async () => {
  if (harness) await harness.close();
});

describe('search tools', () => {
  it('setup', async () => {
    harness = await createTestHarness((server) => registerSearchTools(server));
  });

  describe('ta_search_locations', () => {
    it('calls /location/search with searchQuery only', async () => {
      const result = await harness.callTool('ta_search_locations', { searchQuery: 'Fenway Park' });
      expect(mockGet).toHaveBeenCalledWith('/location/search?searchQuery=Fenway%20Park', { cache: 'dynamic' });
      expect(result.isError).toBeFalsy();
    });

    it('passes every optional filter through', async () => {
      await harness.callTool('ta_search_locations', {
        searchQuery: 'pizza',
        category: 'restaurants',
        latLong: '42.3455,-71.10767',
        radius: 5,
        radiusUnit: 'km',
        language: 'en',
        address: 'Boston',
        phone: '617 555 1212',
      });
      const path = mockGet.mock.calls[0][0] as string;
      expect(path).toContain('/location/search?');
      expect(path).toContain('searchQuery=pizza');
      expect(path).toContain('category=restaurants');
      expect(path).toContain('latLong=42.3455%2C-71.10767');
      expect(path).toContain('radius=5');
      expect(path).toContain('radiusUnit=km');
      expect(path).toContain('language=en');
      expect(path).toContain('address=Boston');
      expect(path).toContain('phone=617%20555%201212');
    });

    it('rejects an invalid category', async () => {
      const result = await harness.callTool('ta_search_locations', {
        searchQuery: 'x',
        category: 'museums',
      });
      expect(result.isError).toBe(true);
      expect(mockGet).not.toHaveBeenCalled();
    });
  });

  describe('ta_search_nearby', () => {
    it('calls /location/nearby_search with latLong', async () => {
      await harness.callTool('ta_search_nearby', { latLong: '42.3455,-71.10767' });
      expect(mockGet).toHaveBeenCalledWith('/location/nearby_search?latLong=42.3455%2C-71.10767', {
        cache: 'dynamic',
      });
    });

    it('rejects a malformed latLong', async () => {
      const result = await harness.callTool('ta_search_nearby', { latLong: 'Boston' });
      expect(result.isError).toBe(true);
      expect(mockGet).not.toHaveBeenCalled();
    });

    it('passes radius filters through', async () => {
      await harness.callTool('ta_search_nearby', {
        latLong: '42.3455,-71.10767',
        category: 'hotels',
        radius: 2,
        radiusUnit: 'mi',
      });
      const path = mockGet.mock.calls[0][0] as string;
      expect(path).toContain('/location/nearby_search?');
      expect(path).toContain('category=hotels');
      expect(path).toContain('radius=2');
      expect(path).toContain('radiusUnit=mi');
    });
  });
});
