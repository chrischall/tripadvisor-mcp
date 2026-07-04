import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDotenvSafely, readEnvVar, formatApiError, McpToolError } from '@chrischall/mcp-utils';

// Load .env for local dev; silently skip if dotenv is unavailable (e.g. the
// .mcpb bundle). loadDotenvSafely never lets .env override a host-provided value.
const __dirname = dirname(fileURLToPath(import.meta.url));
await loadDotenvSafely({ path: join(__dirname, '..', '.env'), override: false });

const BASE_URL = 'https://api.content.tripadvisor.com/api/v1';
const SERVICE = 'TripAdvisor Content API';
const REQUEST_TIMEOUT_MS = 30_000;
// The Content API free tier is 5,000 calls/month, so identical GETs in quick
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
  private readonly referer: string | undefined;
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
    this.referer = readEnvVar('TRIPADVISOR_REFERER');
    const key = readEnvVar('TRIPADVISOR_API_KEY');
    if (!key) {
      this.apiKey = null;
      this.configError = new McpToolError('TRIPADVISOR_API_KEY environment variable is required', {
        hint: 'Create a Content API key at https://www.tripadvisor.com/developers and set TRIPADVISOR_API_KEY in your MCP host env or .env (free tier: 5,000 calls/month).',
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
    const sep = path.includes('?') ? '&' : '?';
    const url = `${BASE_URL}${path}${sep}key=${encodeURIComponent(key)}`;
    const headers: Record<string, string> = { Accept: 'application/json' };
    // A domain-restricted key requires a matching Referer on every request.
    if (this.referer) headers.Referer = this.referer;
    const res = await this.fetchImpl(url, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (res.ok) return (await res.json()) as T;

    const text = await res.text();
    if (res.status === 429 && !isRetry) {
      const retryAfter = Number(res.headers.get('retry-after'));
      const delayMs = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, MAX_RETRY_AFTER_MS) : 1_000;
      await this.sleep(delayMs);
      return this.request<T>(path, true);
    }
    // `path` deliberately excludes the key, so these messages can't leak it.
    if (res.status === 401) {
      throw new McpToolError(`${SERVICE} returned 401 Unauthorized — TRIPADVISOR_API_KEY is missing or invalid.`, {
        hint: 'Check the key in your MCP host env or .env; create one at https://www.tripadvisor.com/developers',
      });
    }
    if (res.status === 403) {
      // Observed live: an unusable key answers 403 with the AWS-gateway body
      // "User is not authorized … explicit deny in an identity-based policy" —
      // that's key-level, and a Referer won't fix it.
      throw new McpToolError(
        `${SERVICE} returned 403 Forbidden — the key exists but is blocked: it has no payment method attached (TripAdvisor requires a card on file even for the free tier), or its IP restriction excludes this address, or its domain restriction needs a matching Referer.`,
        {
          hint: 'Check the key at https://www.tripadvisor.com/developers: attach billing, and either add this IP to the key or switch it to domain restriction and set TRIPADVISOR_REFERER to a matching https://domain.',
        },
      );
    }
    if (res.status === 429) {
      throw new McpToolError(`${SERVICE} rate limit or monthly quota exceeded (429).`, {
        hint: 'The free tier is 5,000 calls/month — check usage at https://www.tripadvisor.com/developers. Cached reads (TRIPADVISOR_CACHE_TTL) stretch the quota.',
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
