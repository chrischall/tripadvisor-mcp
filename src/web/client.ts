// ────────────────────────────────────────────────────────────────────────────
// TripAdvisor web client — every tripadvisor.com request rides the bridge
// ────────────────────────────────────────────────────────────────────────────
//
// The consumer site is DataDome-fronted, so web-tier requests run as
// same-origin fetches inside the user's open tripadvisor.com tab via the
// fetchproxy bridge (src/web/transport.ts). The browser carries its own
// cookies; nothing is captured or persisted here. This client is deliberately
// generic (GET path → {status, body}) — endpoint knowledge lives in the
// tools, pinned by docs/TRIPADVISOR-WEB-API.md captures.

import { EdgeBlockedError, McpToolError, detectEdgeBlock } from '@chrischall/mcp-utils';
import { bridgeErrorInfo, classifyBotWall, type FetchproxyTransport } from '@chrischall/mcp-utils/fetchproxy';
import { debugLogEnabled } from './config.js';
import { createTripAdvisorTransport } from './transport.js';
import { locationDetailPath } from './parse.js';

/** One bridge response — the `{status, body}` pair the tools inspect. */
export interface BridgeResult {
  status: number;
  body: string;
}

export class TripAdvisorWebClient {
  private transport: FetchproxyTransport | undefined;
  private startPromise: Promise<void> | undefined;

  constructor(private readonly injected: { transport?: FetchproxyTransport } = {}) {}

  /**
   * The bridge transport, created lazily (construction is cheap — the port
   * only binds on the first verb call). Public so the healthcheck tool can
   * probe/report bridge state without re-creating it.
   */
  bridge(): FetchproxyTransport {
    if (!this.transport) {
      this.transport = this.injected.transport ?? createTripAdvisorTransport();
    }
    return this.transport;
  }

  /**
   * The bridge transport, started. Runs single-flight (concurrent callers
   * share one start) and clears on rejection so a transient failure is retried
   * on the next request instead of sticking forever.
   */
  async bridgeReady(): Promise<FetchproxyTransport> {
    const transport = this.bridge();
    if (!this.startPromise) {
      this.startPromise = transport.start().catch((e: unknown) => {
        this.startPromise = undefined;
        throw e;
      });
    }
    await this.startPromise;
    return transport;
  }

  /**
   * GET one path through the signed-in tab; bridge failures become actionable
   * errors. GET-only by design: no tool needs JSON/POST (search would mean the
   * brittle persisted-query GraphQL route docs/TRIPADVISOR-WEB-API.md rejects).
   */
  async fetchRaw(path: string): Promise<BridgeResult> {
    if (debugLogEnabled()) console.error(`[tripadvisor-debug] → GET ${path}`);
    let result: BridgeResult;
    try {
      const transport = await this.bridgeReady();
      result = await transport.fetch({ method: 'GET', path, headers: {} });
    } catch (e) {
      const info = bridgeErrorInfo(e);
      throw new McpToolError(`TripAdvisor bridge: ${info.message}`, {
        ...(info.hint ? { hint: info.hint } : {}),
      });
    }
    if (debugLogEnabled()) console.error(`[tripadvisor-debug] ← ${result.status}`);
    return result;
  }

  /** GET an HTML page. Throws on non-2xx or a bot-wall interstitial. */
  async getHtml(path: string): Promise<string> {
    const { status, body } = await this.fetchRaw(path);
    this.assertNotWalled(status, body, path);
    if (status < 200 || status >= 300) {
      throw new McpToolError(`tripadvisor.com answered ${status} for ${path}`, {
        hint: 'If this persists, run ta_web_healthcheck and make sure a tripadvisor.com tab is open.',
      });
    }
    return body;
  }

  /** Fetch a location detail page's HTML by numeric d-id (canonicalized by TripAdvisor). */
  async getLocationHtml(locationId: number): Promise<string> {
    return this.getHtml(locationDetailPath(locationId));
  }

  /**
   * Throw on a bot wall or CDN/WAF refusal page. The shared `detectEdgeBlock`
   * rule is checked first (it names CloudFront/Akamai/Imperva refusal pages
   * that `classifyBotWall` does not), and either way the thrown error carries
   * an `EdgeBlockedError` as `cause`, so `ta_web_healthcheck` reports
   * `edge_blocked` rather than an unclassified failure (mcp-host#1015).
   */
  private assertNotWalled(status: number, body: string, path: string): void {
    const edge = detectEdgeBlock({ body, status });
    const wall = edge === null ? classifyBotWall(body, status) : undefined;
    const vendor = edge?.vendor ?? (wall?.blocked ? wall.vendor : undefined);
    if (vendor !== undefined) {
      throw new McpToolError(`tripadvisor.com bot wall (${vendor}) blocked ${path}.`, {
        hint: 'Open a www.tripadvisor.com tab in the paired browser, complete any challenge, then retry.',
        cause: new EdgeBlockedError(status, vendor, { service: 'tripadvisor.com', method: 'GET', path }),
      });
    }
  }
}

/** Module-level singleton shared by the web tool modules (lazy — nothing binds at import). */
export const webClient = new TripAdvisorWebClient();
