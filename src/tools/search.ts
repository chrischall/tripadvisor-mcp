import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { textResult } from '@chrischall/mcp-utils';
import { client } from '../client.js';
import { LatLong, searchFilterParams, qs } from './shared.js';

export function registerSearchTools(server: McpServer): void {
  server.registerTool(
    'ta_search_locations',
    {
      description:
        'Search TripAdvisor locations (hotels, restaurants, attractions, geos) by name. Returns up to 10 matches with location_id for the detail tools.',
      annotations: { readOnlyHint: true, openWorldHint: true },
      inputSchema: {
        searchQuery: z.string().min(1).describe('Text to search location names for'),
        latLong: LatLong.optional().describe('Center point to scope the search, e.g. "42.3455,-71.10767"'),
        ...searchFilterParams,
      },
    },
    async ({ searchQuery, latLong, category, phone, address, radius, radiusUnit, language }) => {
      const data = await client.get(
        `/location/search${qs({ searchQuery, category, phone, address, latLong, radius, radiusUnit, language })}`,
        { cache: 'dynamic' },
      );
      return textResult(data);
    },
  );

  server.registerTool(
    'ta_search_nearby',
    {
      description:
        'Find TripAdvisor locations near a latitude/longitude. Returns up to 10 locations with location_id for the detail tools.',
      annotations: { readOnlyHint: true, openWorldHint: true },
      inputSchema: {
        latLong: LatLong.describe('Center point, e.g. "42.3455,-71.10767"'),
        ...searchFilterParams,
      },
    },
    async ({ latLong, category, phone, address, radius, radiusUnit, language }) => {
      const data = await client.get(
        `/location/nearby_search${qs({ latLong, category, phone, address, radius, radiusUnit, language })}`,
        { cache: 'dynamic' },
      );
      return textResult(data);
    },
  );
}
