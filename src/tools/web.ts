import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerBridgeHealthcheckTool } from '@chrischall/mcp-utils/fetchproxy';
import { webClient } from '../web/client.js';

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
}
