# tripadvisor-mcp

[![npm](https://img.shields.io/npm/v/@chrischall/tripadvisor-mcp)](https://www.npmjs.com/package/@chrischall/tripadvisor-mcp)

MCP server for the **TripAdvisor Content API** — travel data for Claude. Search hotels, restaurants, attractions, and destinations by name or coordinates, then pull full details, photos, and recent reviews, all over stdio.

> Developed and maintained by AI (Claude Code). Use at your own discretion.

## Quick start

```json
{
  "mcpServers": {
    "tripadvisor": {
      "command": "npx",
      "args": ["-y", "@chrischall/tripadvisor-mcp"],
      "env": { "TRIPADVISOR_API_KEY": "your-content-api-key-here" }
    }
  }
}
```

Get a key at [tripadvisor.com/developers](https://www.tripadvisor.com/developers). The free tier is **5,000 calls/month**; responses are cached in-memory to stretch it.

## Tools

| Tool | What it does |
| --- | --- |
| `ta_search_locations` | Search locations by name (optionally scoped by category, lat/long + radius, address, phone) — up to 10 matches |
| `ta_search_nearby` | Find locations near a latitude/longitude — up to 10 matches |
| `ta_get_location_details` | Full details: rating, ranking, subratings, awards, review count, amenities, hours, listing URLs |
| `ta_get_location_photos` | Photos with multi-size image URLs, captions, and source filter |
| `ta_get_location_reviews` | Most recent reviews (up to 5 per call, pageable with `offset`) |

All tools are read-only — the Content API has no write endpoints.

## Environment

| Var | Required | Purpose |
| --- | --- | --- |
| `TRIPADVISOR_API_KEY` | yes | Content API key, sent as the `key` query parameter. |
| `TRIPADVISOR_REFERER` | no | `Referer` header for domain-restricted keys (the API 403s without a matching referer). |
| `TRIPADVISOR_CACHE_TTL` | no | Seconds to cache search responses (default: 300; `0` disables). |
| `TRIPADVISOR_STATIC_CACHE_TTL` | no | Seconds to cache details/photos/reviews (default: 3600; `0` disables). |

## Development

```bash
npm install
npm run build   # tsc + esbuild bundle
npm test        # vitest (no real network)
```

Endpoint request shapes are pinned in [docs/TRIPADVISOR-API.md](docs/TRIPADVISOR-API.md). With a key in `.env`, `node scripts/live-probe.mjs` exercises every read path through the built client.

## License

MIT
