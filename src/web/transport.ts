// ────────────────────────────────────────────────────────────────────────────
// Fetchproxy bridge transport — the hot path for every tripadvisor.com request
// ────────────────────────────────────────────────────────────────────────────
//
// tripadvisor.com fronts its consumer site with DataDome, which fingerprints
// the HTTP client itself (TLS/JA3) — Node-originated requests are rejected
// regardless of cookie freshness. So web-tier requests run through the
// fetchproxy bridge: each one is a same-origin fetch executed in the user's
// open tripadvisor.com tab, and the bot wall never sees Node. The official
// Terra API tools (src/client.ts) are unaffected — they never touch the
// bridge.
//
// This is the fleet's fetchproxy archetype (alltrails/redfin/zillow): a thin
// factory over @chrischall/mcp-utils' createFetchproxyTransport, which owns
// the FetchproxyServer construction, the start/close/status lifecycle, and
// the fetch/requestJson/runProbe verb adapters.

import {
  createFetchproxyTransport,
  type FetchproxyServer,
  type FetchproxyServerOpts,
  type FetchproxyTransport,
} from '@chrischall/mcp-utils/fetchproxy';
import { getRequestTimeoutMs, getWsPort } from './config.js';
import { VERSION } from '../version.js';

export type { FetchproxyTransport } from '@chrischall/mcp-utils/fetchproxy';

/**
 * Build the TripAdvisor bridge transport. Construction is cheap — the port
 * only binds (and the extension only pairs) on the first verb call, so callers
 * can create this eagerly without touching the bridge.
 *
 * @param createServer Test seam forwarded to `createFetchproxyTransport`: a
 *   factory that builds the underlying `FetchproxyServer`. Tests pass a
 *   capturing mock; production omits it.
 */
export function createTripAdvisorTransport(
  createServer?: (opts: FetchproxyServerOpts) => FetchproxyServer,
): FetchproxyTransport {
  return createFetchproxyTransport({
    port: getWsPort(),
    serverName: 'tripadvisor-mcp',
    version: VERSION,
    // 'tripadvisor.com' matches www.tripadvisor.com (the extension treats each
    // domain as "exact host or any subdomain of it").
    domains: ['tripadvisor.com'],
    defaultSubdomain: 'www',
    capabilities: ['fetch'],
    // Canonical fleet startup banner on start() — stderr only (stdout is the
    // JSON-RPC channel).
    logListening: true,
    debugEnvVar: 'TRIPADVISOR_DEBUG_LOG',
    fetchTimeoutMs: getRequestTimeoutMs(),
    ...(createServer ? { createServer } : {}),
  });
}
