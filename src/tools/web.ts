import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerBridgeHealthcheckTool } from '@chrischall/mcp-utils/fetchproxy';
import { McpToolError, textResult } from '@chrischall/mcp-utils';
import { webClient } from '../web/client.js';
import { parseLocationDetail } from '../web/parse.js';
import { LocationId } from './shared.js';

/**
 * A small, real page GET the probe round-trips — the homepage exercises the
 * exact bridge + bot-wall guards every web tool uses.
 */
export const HEALTHCHECK_PROBE_PATH = '/';

/**
 * Register `ta_web_healthcheck` — round-trips the probe path through the
 * fetchproxy bridge and reports role/port/timing plus an actionable hint
 * ladder. The transport is reached lazily through `webClient.bridge()` so
 * registration never constructs it at server startup.
 */
export function registerWebTools(server: McpServer): void {
  registerBridgeHealthcheckTool({
    server,
    prefix: 'ta_web',
    probePath: HEALTHCHECK_PROBE_PATH,
    hostLabel: 'www.tripadvisor.com',
    transport: {
      // runProbe must go through the STARTED transport (start() loads the
      // identity and must precede any verb), hence the async delegate.
      runProbe: async (fetchFn, probePath) => (await webClient.bridgeReady()).runProbe(fetchFn, probePath),
      status: () => webClient.bridge().status(),
    },
    probeFn: (path) => webClient.getHtml(path),
  });

  server.registerTool(
    'ta_web_get_location',
    {
      description:
        "Get a TripAdvisor location's core details (name, rating, review count, address, coordinates, phone, photo, listing URL) by location ID, read from the public page via the browser bridge. Works without an API key — use this when ta_get_location_details is unavailable or its key is blocked. Covers attractions, hotels, and restaurants. Does not return individual review text.",
      annotations: { readOnlyHint: true, openWorldHint: true },
      inputSchema: {
        locationId: LocationId,
      },
    },
    async ({ locationId }) => {
      const html = await webClient.getLocationHtml(locationId);
      const detail = parseLocationDetail(html);
      if (!detail) {
        throw new McpToolError(`Could not parse location ${locationId} from its TripAdvisor page.`, {
          hint: 'The page may be a bot-challenge shell or the id may be wrong — run ta_web_healthcheck and confirm a signed-in www.tripadvisor.com tab is open, then retry.',
        });
      }
      return textResult({ location_id: locationId, ...detail });
    },
  );
}
