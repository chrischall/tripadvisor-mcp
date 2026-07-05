# CLAUDE.md — tripadvisor-mcp

Guidance for Claude working in this repo.

## TL;DR

**TripAdvisor Content API** MCP server, plus an optional browser-bridge tier.
The primary tier wraps the official read-only REST API
(`https://api.content.tripadvisor.com/api/v1`) and exposes 5 tools to Claude
over stdio: location search, nearby search, location details, photos, and
reviews. A second tier reaches the bot-walled consumer site via fetchproxy:
`ta_web_healthcheck` (bridge diagnostics) and `ta_web_get_location` (location
details parsed from the public page's schema.org ld+json — works with no API
key, covering attractions/hotels/restaurants). Web-tier shapes are pinned in
`docs/TRIPADVISOR-WEB-API.md`.

Auth for the primary tier is a Content API key (`TRIPADVISOR_API_KEY`) sent as
the **`key` query parameter** — not a header — so this is the direct-API
archetype with a thin custom `fetch` client (not `createApiClient`, whose token
handling is header-shaped). The key is appended at fetch time only: cache keys
and error messages are built from the key-less path and can never leak it. No
writes (the Content API has no write endpoints — nothing is confirm-gated
because nothing mutates).

The web tier (`src/web/`) is the fleet's fetchproxy archetype: DataDome fronts
tripadvisor.com, so those requests run as same-origin fetches in the user's
signed-in tab via the bridge (fleet-shared port 37149). `@fetchproxy/server`
is inlined by esbuild (not externalized), so the `.mcpb` bundle boots bare —
guarded by `tests/server-boot.test.ts`. The primary API tools never touch the
bridge.

## Environment

```
TRIPADVISOR_API_KEY=<key>            # Required. Create at https://www.tripadvisor.com/developers
TRIPADVISOR_REFERER=<url>            # Optional. Referer header for domain-restricted keys
TRIPADVISOR_CACHE_TTL=<secs>         # Optional. Search read-cache TTL (default 300; 0 disables)
TRIPADVISOR_STATIC_CACHE_TTL=<secs>  # Optional. Details/photos/reviews TTL (default 3600; 0 disables)
TRIPADVISOR_REQUEST_TIMEOUT_MS=<ms>  # Optional. Web-bridge per-request timeout (default 30000)
TRIPADVISOR_DEBUG_LOG=1              # Optional. Log web-bridge requests to stderr
TRIPADVISOR_WS_PORT=<port>           # Optional, tests only. Bridge port override (default 37149)
```

`client.get(path, { cache })` is backed by an in-memory cache keyed by the
key-less path, with two TTL tiers to stretch the 5,000-calls/month free quota:
**dynamic** (default 300s) for the two search tools, **static** (default
3600s) for details/photos/reviews. A 429 gets one retry honoring `Retry-After`
(capped at 10s); 401 vs 403 produce distinct actionable errors (invalid key
vs. domain/IP-restriction block — the fix for 403 is usually setting
`TRIPADVISOR_REFERER`).

Loaded via `loadDotenvSafely` from `.env` next to `dist/` (failure swallowed —
the .mcpb bundle has no dotenv). The config error is **deferred**: the server
boots without a key and the actionable error surfaces on the first tool call,
so the host's install-time `tools/list` probe still succeeds.

## Layout

- `src/client.ts` — `TripAdvisorClient` (deferred config; custom `get()` with
  key-appending, two-tier TTL cache, 429 retry, status-specific errors).
- `src/tools/shared.ts` — `LocationId`/`LatLong`/`Category` schemas, the shared
  search filter params, and `qs()`.
- `src/tools/search.ts` — `ta_search_locations`, `ta_search_nearby`.
- `src/tools/location.ts` — `ta_get_location_details`, `ta_get_location_photos`,
  `ta_get_location_reviews`.
- `src/tools/web.ts` — `ta_web_healthcheck`, `ta_web_get_location`.
- `src/web/{transport,client,config}.ts` — the fetchproxy bridge tier
  (transport on port 37149, generic web client with bot-wall guards, config).
- `src/web/parse.ts` — pure ld+json → `LocationDetail` projection (unit-tested
  against captured bytes; the business node is the one with name+aggregateRating).
- `src/index.ts` — wires the registrars via `runMcp`; version from
  `src/version.ts` (single release-please-managed source).
- `docs/TRIPADVISOR-API.md` — pinned request shapes from the official reference.
- `scripts/live-probe.mjs` — read-only probe through the BUILT client
  (`dist/client.js`); needs a real key in `.env`. Space between calls; the API
  free tier is small.

## Conventions

- **Path-injection guards.** `locationId` is a positive-int zod schema
  interpolated into the URL path; `latLong` and photo `source` are
  regex-validated.
- **TDD.** Tests mock `client.get` (tools) or `fetchImpl` (client); no real
  network in CI. `tests/server-boot.test.ts` spawns the real bundle/bin.
- **Version sync.** `package.json`, `src/version.ts`, `manifest.json`,
  `server.json`, `.claude-plugin/*` must agree — `tests/version-sync.test.ts`
  guards it; release-please bumps them (never hand-bump).
- **Live verification is gated on a human-supplied key** — see the status
  section at the bottom of `docs/TRIPADVISOR-API.md`.
