import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { minifiedResult } from '@chrischall/mcp-utils';
import { client } from '../client.js';
import { LocationId, LocaleList, pageParams, qs } from './shared.js';
import { viewArg, viewResponse } from '../view.js';

export function registerLocationTools(server: McpServer): void {
  server.registerTool(
    'ta_get_locations',
    {
      description:
        'Get details for MULTIPLE locations in one call (batch). Pass an array of location ids — cheaper than repeated ta_get_location_details. Unknown or unlicensed ids are silently omitted. Returns slim summaries by default; pass view:"full" for the whole records.',
      annotations: { readOnlyHint: true, openWorldHint: true },
      inputSchema: {
        ids: z.array(LocationId).min(1).max(50).describe('Location IDs to fetch (1–50)'),
        locale: LocaleList,
        view: viewArg(),
      },
    },
    async ({ ids, locale, view }) => {
      const data = await client.get(`/locations${qs({ id: ids, locale })}`, { cache: 'static' });
      return viewResponse(view, data, 'locationList');
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
      return minifiedResult(data);
    },
  );

  // NO `view` on this tool, deliberately. Its product IS the image URLs: a
  // photos item is `{id, location_id, photo: {key, original_size_url, …}, …}`
  // (docs/TRIPADVISOR-API.md §5), and `photo` is a media KEY — stripping it
  // does not shrink the response, it EMPTIES it, leaving ids and a publish
  // timestamp pointing at nothing. Same rule as `musicbrainz_cover_art`,
  // `alltrails_get_trail_photos`, `sw_get_receipt` and redfin's photo bundles
  // — see @chrischall/mcp-utils' `stripMediaUrls` docs ("Never apply this to a
  // tool whose PRODUCT is the image. The tool's own name is the test.").
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
      return minifiedResult(data);
    },
  );

  // `view` DOES belong here, and it is the opposite case to photos above. A
  // review's product is its TEXT; the image URLs it carries — reviewer avatars,
  // per-review snapshots — are incidental to the thing the caller asked for, so
  // dropping them shrinks the payload instead of emptying it. There is no
  // hand-written projection for this shape, so `viewResponse` falls through to
  // `stripMediaUrls`, which needs no knowledge of the fields.
  server.registerTool(
    'ta_get_location_reviews',
    {
      description:
        'Get traveler reviews for a TripAdvisor location, with pagination. Reviewer avatars and other image URLs ' +
        'are dropped by default; pass view:"full" for TripAdvisor\'s whole records.',
      annotations: { readOnlyHint: true, openWorldHint: true },
      inputSchema: {
        locationId: LocationId,
        locale: LocaleList,
        ...pageParams,
        view: viewArg(),
      },
    },
    async ({ locationId, locale, page, size, view }) => {
      const data = await client.get(`/locations/${locationId}/reviews${qs({ locale, page, size })}`, {
        cache: 'static',
      });
      return viewResponse(view, data);
    },
  );
}
