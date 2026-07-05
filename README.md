# tripadvisor-mcp

[![npm](https://img.shields.io/npm/v/@chrischall/tripadvisor-mcp)](https://www.npmjs.com/package/@chrischall/tripadvisor-mcp)

MCP server for the **TripAdvisor Terra API** — travel data for Claude. Search hotels, restaurants, and attractions by name or coordinates, then pull full details, photos, and reviews, all over stdio. (Terra is TripAdvisor's current API; the legacy Content API is sunset on 2026-08-31.)

> Developed and maintained by AI (Claude Code). Use at your own discretion.

## Quick start

```json
{
  "mcpServers": {
    "tripadvisor": {
      "command": "npx",
      "args": ["-y", "@chrischall/tripadvisor-mcp"],
      "env": { "TRIPADVISOR_API_KEY": "your-terra-api-key-here" }
    }
  }
}
```

Get a key at [tripadvisor.com/developers](https://www.tripadvisor.com/developers). The free **Discover** tier is pay-as-you-go (10 QPS, **10,000 calls/day**); responses are cached in-memory to stretch it. Make sure it's a **Terra** key — a legacy Content API key returns 403.

## Tools

| Tool | What it does |
| --- | --- |
| `ta_search_locations` | Search locations by name (optionally scoped by category, country/geo/postal code) — paginated; `compact:true` for slim summaries |
| `ta_search_nearby` | Find locations near a lat/lon+radius, a `location_id`+radius, or inside a sw/ne bounding box (category, min rating, sort) — `compact:true` supported |
| `ta_get_location_details` | Full details: names, descriptions, address, coordinates, traveler ratings, phone, listing URLs |
| `ta_get_locations` | Batch — details for **multiple** location ids in one call (cheaper than N detail calls); `compact:true` supported |
| `ta_get_location_photos` | Photos with multi-size image URLs, source, and dimensions — paginated |
| `ta_get_location_reviews` | Traveler reviews — paginated |
| `ta_web_healthcheck` | Diagnose the optional tripadvisor.com browser-bridge connection (see below) |
| `ta_web_get_location` | Location details (rating, address, coords, phone, photo) read from the public page via the browser bridge — **no API key needed** |

All tools are read-only — Terra has no write endpoints.

### Browser bridge (optional)

`ta_web_healthcheck` is the first tool of an optional second tier that reaches
tripadvisor.com's consumer site (bot-walled, so unreachable server-side) by
routing same-origin fetches through your signed-in browser tab via the
[fetchproxy](https://github.com/chrischall/fetchproxy) Transporter extension.
It needs the extension installed and a one-time pairing approval; the Content
API tools above never touch the bridge.

`ta_web_get_location` uses this bridge to read a location's details straight
from its public TripAdvisor page — so it works **without an API key**,
covering attractions, hotels, and restaurants. It returns core business data
(rating, review count, address, coordinates, phone, primary photo, listing
URL) but not individual review text. Request shapes are pinned in
[docs/TRIPADVISOR-WEB-API.md](docs/TRIPADVISOR-WEB-API.md).

## Environment

| Var | Required | Purpose |
| --- | --- | --- |
| `TRIPADVISOR_API_KEY` | yes | Terra API key, sent as the `X-API-Key` header. |
| `TRIPADVISOR_CACHE_TTL` | no | Seconds to cache search responses (default: 300; `0` disables). |
| `TRIPADVISOR_STATIC_CACHE_TTL` | no | Seconds to cache details/photos/reviews (default: 3600; `0` disables). |
| `TRIPADVISOR_REQUEST_TIMEOUT_MS` | no | Per-request timeout for the optional browser bridge (default: 30000). |
| `TRIPADVISOR_DEBUG_LOG` | no | Set to `1` to log browser-bridge requests to stderr. |

## Development

```bash
npm install
npm run build   # tsc + esbuild bundle
npm test        # vitest (no real network)
```

Endpoint request shapes are pinned in [docs/TRIPADVISOR-API.md](docs/TRIPADVISOR-API.md). With a key in `.env`, `node scripts/live-probe.mjs` exercises every read path through the built client.

## License

MIT
