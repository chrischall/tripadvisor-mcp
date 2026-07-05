import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDotenvSafely, readEnvVar, formatApiError, truncateErrorMessage, McpToolError } from '@chrischall/mcp-utils';

// Load .env for local dev; silently skip if dotenv is unavailable (e.g. the
// .mcpb bundle). loadDotenvSafely never lets .env override a host-provided value.
const __dirname = dirname(fileURLToPath(import.meta.url));
await loadDotenvSafely({ path: join(__dirname, '..', '.env'), override: false });

const BASE_URL = 'https://terra.tripadvisor.com/api';
const SERVICE = 'TripAdvisor Terra API';
const REQUEST_TIMEOUT_MS = 30_000;
// The Terra Discover tier is 10,000 calls/day, so identical GETs in quick
// succession are wasteful. Search results get a 5-minute TTL by default;
// override with TRIPADVISOR_CACHE_TTL (seconds; 0 = off).
const DEFAULT_CACHE_TTL_MS = 300_000;
// Location details/photos/reviews change slowly — 1 hour by default.
// Override with TRIPADVISOR_STATIC_CACHE_TTL (seconds; 0 = off).
const DEFAULT_STATIC_CACHE_TTL_MS = 3_600_000;
// Bound the cache so a long-lived server doesn't grow unbounded across many
// distinct paths; oldest entries are evicted first.
const CACHE_MAX_ENTRIES = 256;
// Cap a server-supplied Retry-After so one bad header can't stall a tool call.
const MAX_RETRY_AFTER_MS = 10_000;

/** Resolve a cache TTL (ms) from an env var holding seconds. A blank or
 * non-numeric value falls back to `defaultMs`; a valid `0` disables caching. */
function readCacheTtlMs(envVar: string, defaultMs: number): number {
  const raw = readEnvVar(envVar);
  if (raw === undefined) return defaultMs;
  const secs = Number(raw);
  return Number.isFinite(secs) && secs >= 0 ? secs * 1000 : defaultMs;
}

export class TripAdvisorClient {
  private readonly apiKey: string | null;
  private readonly configError: Error | null;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly cacheTtlMs: number;
  private readonly staticCacheTtlMs: number;
  private readonly now: () => number;
  private readonly cache = new Map<string, { expiresAt: number; value: unknown }>();

  /**
   * Defer the config error so the server still boots (and answers the host's
   * install-time tools/list probe) when TRIPADVISOR_API_KEY isn't set yet. The
   * error is re-raised at request time via requireKey().
   */
  constructor(
    opts: {
      fetchImpl?: typeof fetch;
      sleep?: (ms: number) => Promise<void>;
      cacheTtlMs?: number;
      staticCacheTtlMs?: number;
      now?: () => number;
    } = {},
  ) {
    this.now = opts.now ?? Date.now;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.cacheTtlMs = opts.cacheTtlMs ?? readCacheTtlMs('TRIPADVISOR_CACHE_TTL', DEFAULT_CACHE_TTL_MS);
    this.staticCacheTtlMs =
      opts.staticCacheTtlMs ?? readCacheTtlMs('TRIPADVISOR_STATIC_CACHE_TTL', DEFAULT_STATIC_CACHE_TTL_MS);
    this.fetchImpl = opts.fetchImpl ?? fetch;
    const key = readEnvVar('TRIPADVISOR_API_KEY');
    if (!key) {
      this.apiKey = null;
      this.configError = new McpToolError('TRIPADVISOR_API_KEY environment variable is required', {
        hint: 'Create a Terra API key at https://www.tripadvisor.com/developers and set TRIPADVISOR_API_KEY in your MCP host env or .env (free Discover tier: 10,000 calls/day).',
      });
    } else {
      this.apiKey = key;
      this.configError = null;
    }
  }

  private requireKey(): string {
    if (this.configError) throw this.configError;
    return this.apiKey!;
  }

  /**
   * GET a JSON resource. `path` must already include any query string but NOT
   * the API key — the key is appended here at fetch time so it never appears in
   * cache keys or error messages. Responses are cached by path; `cache:
   * 'static'` selects the longer details/photos/reviews TTL
   * (TRIPADVISOR_STATIC_CACHE_TTL), the default 'dynamic' tier
   * (TRIPADVISOR_CACHE_TTL) is for searches.
   */
  async get<T = unknown>(path: string, opts: { cache?: 'dynamic' | 'static' } = {}): Promise<T> {
    const ttl = opts.cache === 'static' ? this.staticCacheTtlMs : this.cacheTtlMs;
    if (ttl > 0) {
      const hit = this.cache.get(path);
      if (hit && hit.expiresAt > this.now()) return hit.value as T;
    }
    const value = await this.request<T>(path);
    if (ttl > 0) {
      if (this.cache.size >= CACHE_MAX_ENTRIES) {
        // Evict expired entries first; if still full, drop the oldest (Map
        // preserves insertion order, so the first key is the oldest).
        const t = this.now();
        for (const [k, v] of this.cache) if (v.expiresAt <= t) this.cache.delete(k);
        while (this.cache.size >= CACHE_MAX_ENTRIES) {
          const oldest = this.cache.keys().next().value;
          if (oldest === undefined) break;
          this.cache.delete(oldest);
        }
      }
      this.cache.set(path, { expiresAt: this.now() + ttl, value });
    }
    return value;
  }

  private async request<T>(path: string, isRetry = false): Promise<T> {
    const key = this.requireKey();
    // Terra authenticates with the X-API-Key header (not a query param), so the
    // key never touches the URL — cache keys and error messages are key-free.
    const headers: Record<string, string> = { 'X-API-Key': key, Accept: 'application/json' };
    const res = await this.fetchImpl(`${BASE_URL}${path}`, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (res.ok) return (await res.json()) as T;

    const text = await res.text();
    if (res.status === 429 && !isRetry) {
      const retryAfter = Number(res.headers.get('retry-after'));
      const delayMs = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, MAX_RETRY_AFTER_MS) : 1_000;
      await this.sleep(delayMs);
      return this.request<T>(path, true);
    }
    if (res.status === 401 || res.status === 403) {
      throw new McpToolError(
        `${SERVICE} returned ${res.status} — TRIPADVISOR_API_KEY is missing, invalid, or not authorized for Terra. A legacy Content API key does NOT work here (and a Terra key does not work on the legacy endpoint).`,
        { hint: 'Confirm the key on the Terra dashboard at https://www.tripadvisor.com/developers and that its plan is active.' },
      );
    }
    if (res.status === 429) {
      throw new McpToolError(`${SERVICE} rate limit or daily quota exceeded (429).`, {
        hint: 'The Discover tier allows 10 QPS and 10,000 calls/day — check usage at https://www.tripadvisor.com/developers. Cached reads (TRIPADVISOR_CACHE_TTL) stretch the quota.',
      });
    }
    if (res.status === 400) {
      // Terra 400s carry a structured validation body; surface it (it names the bad field).
      throw new McpToolError(`${SERVICE} rejected the request (400): ${truncateErrorMessage(text)}`, {
        hint: 'Check the parameters against docs/TRIPADVISOR-API.md (e.g. category must be RESTAURANT/ATTRACTION/HOTEL; nearby needs lat+lon+radius or a bounding box).',
      });
    }
    throw new McpToolError(formatApiError(res.status, 'GET', path, text, { service: SERVICE }));
  }
}

/**
 * Module-level singleton shared by every tool module. Constructed here (not in
 * index.ts) so the deferred-config-error pattern holds: the server boots and
 * lists tools even without a key — the error surfaces on the first tool call.
 */
export const client = new TripAdvisorClient();
