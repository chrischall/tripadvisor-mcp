import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { textResult, McpToolError } from '@chrischall/mcp-utils';
import { client } from '../client.js';
import { Category, LocaleList, pageParams, qs } from './shared.js';
import { compactList } from '../projection.js';

/** `compact` arg shared by the list-returning search tools. */
const compactParam = {
  compact: z
    .boolean()
    .optional()
    .describe('Return a slim summary per result (id, name, category, city, rating, review_count, url) instead of full records'),
};

export function registerSearchTools(server: McpServer): void {
  server.registerTool(
    'ta_search_locations',
    {
      description:
        'Search TripAdvisor locations (restaurants, attractions, hotels) by name. Returns matches with a location id for the detail tools, plus pagination. Pass compact:true for slim summaries.',
      annotations: { readOnlyHint: true, openWorldHint: true },
      inputSchema: {
        query: z.string().min(1).max(500).describe('Text to search location names for'),
        category: Category.optional().describe('Restrict to one category'),
        country_code: z.string().length(2).optional().describe('Alpha-2 country code (e.g. "US")'),
        geo_name: z.string().optional().describe('City, town, or country name to scope the search'),
        postal_code: z.string().optional().describe('Postal/ZIP code (takes precedence over geo_name)'),
        locale: LocaleList,
        ...pageParams,
        ...compactParam,
      },
    },
    async ({ query, category, country_code, geo_name, postal_code, locale, page, size, compact }) => {
      const data = await client.get(
        `/locations/search${qs({ query, category, country_code, geo_name, postal_code, locale, page, size })}`,
        { cache: 'dynamic' },
      );
      return textResult(compact ? compactList(data) : data);
    },
  );

  server.registerTool(
    'ta_search_nearby',
    {
      description:
        'Find TripAdvisor locations near a point within a radius, or inside a bounding box. Center by lat+lon+radius, by a reference location_id+radius, or by a sw/ne bounding box. Returns matches with distance and a location id. Pass compact:true for slim summaries.',
      annotations: { readOnlyHint: true, openWorldHint: true },
      inputSchema: {
        // Center — supply exactly one of: lat+lon, location_id, or the sw/ne box.
        lat: z.number().min(-90).max(90).optional().describe('Center latitude (with lon+radius)'),
        lon: z.number().min(-180).max(180).optional().describe('Center longitude (with lat+radius)'),
        location_id: z.number().int().positive().optional().describe('Reference location as center (with radius)'),
        radius: z.number().positive().optional().describe('Search radius (required with lat/lon or location_id; must be > 0)'),
        unit: z.enum(['MI', 'KM']).optional().describe('Radius unit (default MI)'),
        sw_lat: z.number().min(-90).max(90).optional().describe('Bounding box SW latitude'),
        sw_lon: z.number().min(-180).max(180).optional().describe('Bounding box SW longitude'),
        ne_lat: z.number().min(-90).max(90).optional().describe('Bounding box NE latitude'),
        ne_lon: z.number().min(-180).max(180).optional().describe('Bounding box NE longitude'),
        category: Category.optional().describe('Restrict to one category'),
        min_rating: z.number().min(1).max(5).optional().describe('Minimum traveler rating (1.0–5.0)'),
        include_photo: z.boolean().optional().describe('Include a photo per result'),
        sort: z.enum(['distance', 'rating']).optional().describe('Sort order (default distance)'),
        locale: LocaleList,
        ...pageParams,
        ...compactParam,
      },
    },
    async (args) => {
      const { lat, lon, location_id, radius, sw_lat, sw_lon, ne_lat, ne_lon, compact, ...rest } = args;
      const boxParts = [sw_lat, sw_lon, ne_lat, ne_lon];
      const boxGiven = boxParts.filter((v) => v !== undefined).length;
      // A partial box (1–3 of 4) is never valid: it can't form a center on its
      // own, and if it rode alongside a lat/lon or location_id center it would
      // bleed into the Terra URL and 400. Reject it before the center count.
      if (boxGiven > 0 && boxGiven < 4) {
        throw new McpToolError('ta_search_nearby bounding box needs all four of sw_lat, sw_lon, ne_lat, ne_lon.', {
          hint: 'Provide all four box corners, or use lat+lon+radius or location_id+radius instead.',
        });
      }
      // Same defect class: a lone lat or lon can't form a center and would bleed
      // into the URL alongside another center — require them together or not at all.
      if ((lat === undefined) !== (lon === undefined)) {
        throw new McpToolError('ta_search_nearby needs both lat and lon together (or neither).', {
          hint: 'Provide lat AND lon with a radius, or use location_id+radius or a sw/ne box.',
        });
      }
      const hasLatLon = lat !== undefined && lon !== undefined;
      const hasBox = boxGiven === 4;
      const centers = [hasLatLon, location_id !== undefined, hasBox].filter(Boolean).length;
      if (centers !== 1) {
        throw new McpToolError(
          'ta_search_nearby needs exactly one center: lat+lon (+radius), location_id (+radius), or the sw/ne bounding box.',
          { hint: 'Provide lat AND lon, OR location_id, OR all four of sw_lat/sw_lon/ne_lat/ne_lon — not more than one.' },
        );
      }
      if ((hasLatLon || location_id !== undefined) && radius === undefined) {
        throw new McpToolError('lat/lon and location_id center modes require radius.', {
          hint: 'Add radius (with optional unit MI/KM), or switch to a sw/ne bounding box.',
        });
      }
      const data = await client.get(
        `/locations/nearby${qs({ lat, lon, location_id, radius, sw_lat, sw_lon, ne_lat, ne_lon, ...rest })}`,
        { cache: 'dynamic' },
      );
      return textResult(compact ? compactList(data) : data);
    },
  );
}
