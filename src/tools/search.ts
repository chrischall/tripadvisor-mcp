import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { textResult } from '@chrischall/mcp-utils';
import { client } from '../client.js';
import { Category, LocaleList, pageParams, qs } from './shared.js';

export function registerSearchTools(server: McpServer): void {
  server.registerTool(
    'ta_search_locations',
    {
      description:
        'Search TripAdvisor locations (restaurants, attractions, hotels) by name. Returns matches with a location id for the detail tools, plus pagination.',
      annotations: { readOnlyHint: true, openWorldHint: true },
      inputSchema: {
        query: z.string().min(1).max(500).describe('Text to search location names for'),
        category: Category.optional().describe('Restrict to one category'),
        country_code: z.string().length(2).optional().describe('Alpha-2 country code (e.g. "US")'),
        geo_name: z.string().optional().describe('City, town, or country name to scope the search'),
        postal_code: z.string().optional().describe('Postal/ZIP code (takes precedence over geo_name)'),
        locale: LocaleList,
        ...pageParams,
      },
    },
    async ({ query, category, country_code, geo_name, postal_code, locale, page, size }) => {
      const data = await client.get(
        `/locations/search${qs({ query, category, country_code, geo_name, postal_code, locale, page, size })}`,
        { cache: 'dynamic' },
      );
      return textResult(data);
    },
  );

  server.registerTool(
    'ta_search_nearby',
    {
      description:
        'Find TripAdvisor locations near a latitude/longitude within a radius. Returns matches with distance and a location id for the detail tools.',
      annotations: { readOnlyHint: true, openWorldHint: true },
      inputSchema: {
        lat: z.number().min(-90).max(90).describe('Center latitude'),
        lon: z.number().min(-180).max(180).describe('Center longitude'),
        radius: z.number().positive().describe('Search radius (must be > 0)'),
        unit: z.enum(['MI', 'KM']).optional().describe('Radius unit (default MI)'),
        category: Category.optional().describe('Restrict to one category'),
        min_rating: z.number().min(1).max(5).optional().describe('Minimum traveler rating (1.0–5.0)'),
        include_photo: z.boolean().optional().describe('Include a photo per result'),
        sort: z.enum(['distance', 'rating']).optional().describe('Sort order (default distance)'),
        locale: LocaleList,
        ...pageParams,
      },
    },
    async ({ lat, lon, radius, unit, category, min_rating, include_photo, sort, locale, page, size }) => {
      const data = await client.get(
        `/locations/nearby${qs({ lat, lon, radius, unit, category, min_rating, include_photo, sort, locale, page, size })}`,
        { cache: 'dynamic' },
      );
      return textResult(data);
    },
  );
}
