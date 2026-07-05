import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { textResult } from '@chrischall/mcp-utils';
import { client } from '../client.js';
import { LocationId, LocaleList, pageParams, qs } from './shared.js';
import { compactLocationList } from '../projection.js';

export function registerLocationTools(server: McpServer): void {
  server.registerTool(
    'ta_get_locations',
    {
      description:
        'Get details for MULTIPLE locations in one call (batch). Pass an array of location ids — cheaper than repeated ta_get_location_details. Unknown or unlicensed ids are silently omitted. Pass compact:true for slim summaries.',
      annotations: { readOnlyHint: true, openWorldHint: true },
      inputSchema: {
        ids: z.array(LocationId).min(1).max(50).describe('Location IDs to fetch (1–50)'),
        locale: LocaleList,
        compact: z
          .boolean()
          .optional()
          .describe('Return a slim summary per location instead of full records'),
      },
    },
    async ({ ids, locale, compact }) => {
      const data = await client.get(`/locations${qs({ id: ids, locale })}`, { cache: 'static' });
      return textResult(compact ? compactLocationList(data) : data);
    },
  );

  server.registerTool(
    'ta_get_location_details',
    {
      description:
        'Get full details for a TripAdvisor location: names, descriptions, address, coordinates, traveler ratings, phone, category, and listing URLs.',
      annotations: { readOnlyHint: true, openWorldHint: true },
      inputSchema: {
        locationId: LocationId,
        locale: LocaleList,
      },
    },
    async ({ locationId, locale }) => {
      const data = await client.get(`/locations/${locationId}${qs({ locale })}`, { cache: 'static' });
      return textResult(data);
    },
  );

  server.registerTool(
    'ta_get_location_photos',
    {
      description: 'Get photos for a TripAdvisor location (multi-size image URLs, source, dimensions), with pagination.',
      annotations: { readOnlyHint: true, openWorldHint: true },
      inputSchema: {
        locationId: LocationId,
        locale: LocaleList,
        ...pageParams,
      },
    },
    async ({ locationId, locale, page, size }) => {
      const data = await client.get(`/locations/${locationId}/photos${qs({ locale, page, size })}`, {
        cache: 'static',
      });
      return textResult(data);
    },
  );

  server.registerTool(
    'ta_get_location_reviews',
    {
      description: 'Get traveler reviews for a TripAdvisor location, with pagination.',
      annotations: { readOnlyHint: true, openWorldHint: true },
      inputSchema: {
        locationId: LocationId,
        locale: LocaleList,
        ...pageParams,
      },
    },
    async ({ locationId, locale, page, size }) => {
      const data = await client.get(`/locations/${locationId}/reviews${qs({ locale, page, size })}`, {
        cache: 'static',
      });
      return textResult(data);
    },
  );
}
