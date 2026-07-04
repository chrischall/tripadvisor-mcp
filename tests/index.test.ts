import { describe, it, expect } from 'vitest';
import { createTestHarness } from '@chrischall/mcp-utils/test';
import { registerSearchTools } from '../src/tools/search.js';
import { registerLocationTools } from '../src/tools/location.js';

describe('tool roster', () => {
  it('registers exactly the expected tools', async () => {
    const h = await createTestHarness((s) => {
      registerSearchTools(s);
      registerLocationTools(s);
    });
    const names = (await h.listTools()).map((t) => t.name).sort();
    expect(names).toEqual([
      'ta_get_location_details',
      'ta_get_location_photos',
      'ta_get_location_reviews',
      'ta_search_locations',
      'ta_search_nearby',
    ]);
    await h.close();
  });
});
