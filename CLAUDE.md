# CLAUDE.md — tripadvisor-mcp

Guidance for Claude working in this repo.

## TL;DR

**TripAdvisor Terra API** MCP server, plus an optional browser-bridge tier.
The primary tier wraps the read-only Terra REST API
(`https://terra.tripadvisor.com/api`) and exposes 5 tools to Claude over stdio:
location search, nearby search, location details, photos, and reviews. Terra is
TripAdvisor's current API; the legacy Content API is sunset on 2026-08-31 (an
earlier build of this repo targeted it — see git history). A second tier
reaches the bot-walled consumer site via fetchproxy: `ta_web_healthcheck`
(bridge diagnostics) and `ta_web_get_location` (location details parsed from the
public page's schema.org ld+json — works with no API key, covering
attractions/hotels/restaurants). Web-tier shapes are pinned in
`docs/TRIPADVISOR-WEB-API.md`.

Auth for the primary tier is a Terra key (`TRIPADVISOR_API_KEY`) sent as the
**`X-API-Key` header**, via a thin custom `fetch` client (not `createApiClient`).
The key never touches the URL, so cache keys and error messages are key-free by
construction. A **legacy** Content API key gets a 403 on Terra (and vice-versa);
that's the tell diagnosed in the 403 error. No writes (Terra has no write
endpoints — nothing is confirm-gated because nothing mutates). Terra responses
wrap list results as `{data:[…], pagination}`; the location object keys names/
descriptions/addresses as language-tagged **arrays** (primary = `primary:true`).

The web tier (`src/web/`) is the fleet's fetchproxy archetype: DataDome fronts
tripadvisor.com, so those requests run as same-origin fetches in the user's
signed-in tab via the bridge (fleet-shared port 37149). `@fetchproxy/server`
is inlined by esbuild (not externalized), so the `.mcpb` bundle boots bare —
guarded by `tests/server-boot.test.ts`. The primary API tools never touch the
bridge.

## Environment

```
TRIPADVISOR_API_KEY=<key>            # Required. A Terra key. Create at https://www.tripadvisor.com/developers
TRIPADVISOR_CACHE_TTL=<secs>         # Optional. Search read-cache TTL (default 300; 0 disables)
TRIPADVISOR_STATIC_CACHE_TTL=<secs>  # Optional. Details/photos/reviews TTL (default 3600; 0 disables)
TRIPADVISOR_REQUEST_TIMEOUT_MS=<ms>  # Optional. Web-bridge per-request timeout (default 30000)
TRIPADVISOR_DEBUG_LOG=1              # Optional. Log web-bridge requests to stderr
TRIPADVISOR_WS_PORT=<port>           # Optional, tests only. Bridge port override (default 37149)
```

`client.get(path, { cache })` is backed by an in-memory cache keyed by the
path, with two TTL tiers to stretch the Discover tier's 10,000-calls/day quota:
**dynamic** (default 300s) for the two search tools, **static** (default
3600s) for details/photos/reviews. A 429 gets one retry honoring `Retry-After`
(capped at 10s); 401/403 → "key isn't a valid/authorized Terra key"; 400 →
surfaces Terra's structured validation `detail` (it names the bad field).

Loaded via `loadDotenvSafely` from `.env` next to `dist/` (failure swallowed —
the .mcpb bundle has no dotenv). The config error is **deferred**: the server
boots without a key and the actionable error surfaces on the first tool call,
so the host's install-time `tools/list` probe still succeeds.

## Layout

- `src/client.ts` — `TripAdvisorClient` (deferred config; custom `get()` with
  the `X-API-Key` header, two-tier TTL cache, 429 retry, status-specific errors).
- `src/tools/shared.ts` — `LocationId`/`Category`/`LocaleList` schemas, the
  shared `pageParams`, and `qs()` (arrays → repeated params, e.g. `locale`).
- `src/tools/search.ts` — `ta_search_locations`, `ta_search_nearby` (three
  center modes: lat/lon+radius, location_id+radius, or sw/ne box — exactly one).
- `src/tools/location.ts` — `ta_get_location_details`, `ta_get_locations`
  (batch multi-get), `ta_get_location_photos`, `ta_get_location_reviews`.
- `src/projection.ts` — pure opt-in `compact` projectors (`compactList` for
  `{data:[{location}]}`, `compactLocationList` for `{data:[Location]}`); derive
  category from the URL prefix; drift-fallback to raw on unexpected shapes.
- `src/tools/web.ts` — `ta_web_healthcheck`, `ta_web_get_location`.
- `src/web/{transport,client,config}.ts` — the fetchproxy bridge tier
  (transport on port 37149, generic web client with bot-wall guards, config).
- `src/web/parse.ts` — pure ld+json → `LocationDetail` projection (unit-tested
  against captured bytes; the business node is the one with name+aggregateRating).
- `src/index.ts` — wires the registrars via `runMcp`; version from
  `src/version.ts` (single release-please-managed source).
- `docs/TRIPADVISOR-API.md` — Terra request/response shapes, captured live.
- `scripts/live-probe.mjs` — read-only probe through the BUILT client
  (`dist/client.js`); needs a real Terra key in `.env`. Space between calls.

## Conventions

- **Path-injection guards.** `locationId` is a positive-int zod schema
  interpolated into the URL path; `category`/`unit`/`sort` are enums.
- **TDD.** Tests mock `client.get` (tools) or `fetchImpl` (client); no real
  network in CI. `tests/server-boot.test.ts` spawns the real bundle/bin.
- **Version sync.** `package.json`, `src/version.ts`, `manifest.json`,
  `server.json`, `.claude-plugin/*` must agree — `tests/version-sync.test.ts`
  guards it; release-please bumps them (never hand-bump).
- **Live verification is gated on a human-supplied key** — see the status
  section at the bottom of `docs/TRIPADVISOR-API.md`.

## Pull requests & release notes

Apply exactly one label per PR so it files under the right release-notes section (`enhancement` → Features, `bug` → Bug Fixes, `dependencies` → Dependencies, etc.), and give the PR title a Conventional-Commit prefix — release-please parses the squash-merged title to pick the version bump and changelog section.

**Exception for first-party dependency bumps.** When bumping a package we own (`@chrischall/mcp-utils`, `@chrischall/realty-core`, `@fetchproxy/server` — anything published from a chrischall-owned repo), label the PR `enhancement` or `bug` instead of `dependencies`, and use the matching Conventional-Commit prefix (`feat:` or `fix:`) instead of `chore:`/`build(deps):`. Those bumps deliver real product fixes or features through us, so they should drive a release-please version bump and show up under Features/Bug Fixes in the release notes — not get hidden under "Dependencies" (which doesn't trigger a release).
