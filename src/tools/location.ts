import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { textResult } from '@chrischall/mcp-utils';
import { client } from '../client.js';
import { LocationId, qs } from './shared.js';

/** Photo source filter: comma-separated list of the three allowed origins. */
const PhotoSource = z
  .string()
  .regex(
    /^(Expert|Management|Traveler)(,(Expert|Management|Traveler))*$/,
    'must be a comma-separated list of: Expert, Management, Traveler',
  );

export function registerLocationTools(server: McpServer): void {
  server.registerTool(
    'ta_get_location_details',
    {
      description:
        'Get full details for a TripAdvisor location: name, address, coordinates, rating, ranking, subratings, awards, review count, amenities, hours, and listing URLs.',
      annotations: { readOnlyHint: true, openWorldHint: true },
      inputSchema: {
        locationId: LocationId,
        language: z.string().optional().describe('Result language code (default: en)'),
        currency: z.string().optional().describe('ISO 4217 currency code for prices (default: USD)'),
      },
    },
    async ({ locationId, language, currency }) => {
      const data = await client.get(`/location/${locationId}/details${qs({ language, currency })}`, {
        cache: 'static',
      });
      return textResult(data);
    },
  );

  server.registerTool(
    'ta_get_location_photos',
    {
      description: 'Get photos for a TripAdvisor location (multi-size image URLs, captions, sources).',
      annotations: { readOnlyHint: true, openWorldHint: true },
      inputSchema: {
        locationId: LocationId,
        language: z.string().optional().describe('Caption language code (default: en)'),
        limit: z.number().int().positive().optional().describe('Number of photos to return'),
        offset: z.number().int().min(0).optional().describe('Index of the first photo'),
        source: PhotoSource.optional().describe(
          'Comma-separated photo sources to allow: Expert, Management, Traveler (default: all)',
        ),
      },
    },
    async ({ locationId, language, limit, offset, source }) => {
      const data = await client.get(`/location/${locationId}/photos${qs({ language, limit, offset, source })}`, {
        cache: 'static',
      });
      return textResult(data);
    },
  );

  server.registerTool(
    'ta_get_location_reviews',
    {
      description: 'Get the most recent reviews for a TripAdvisor location (up to 5 per call; page with offset).',
      annotations: { readOnlyHint: true, openWorldHint: true },
      inputSchema: {
        locationId: LocationId,
        language: z.string().optional().describe('Review language code (default: en)'),
        limit: z.number().int().positive().optional().describe('Number of reviews to return'),
        offset: z.number().int().min(0).optional().describe('Index of the first review'),
      },
    },
    async ({ locationId, language, limit, offset }) => {
      const data = await client.get(`/location/${locationId}/reviews${qs({ language, limit, offset })}`, {
        cache: 'static',
      });
      return textResult(data);
    },
  );
}
