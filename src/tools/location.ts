import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { textResult } from '@chrischall/mcp-utils';
import { client } from '../client.js';
import { LocationId, LocaleList, pageParams, qs } from './shared.js';

export function registerLocationTools(server: McpServer): void {
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
