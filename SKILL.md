---
name: tripadvisor-mcp
description: TripAdvisor travel data via the official Content API through MCP. Use when the user asks to find hotels, restaurants, attractions, or destinations, look up a place's TripAdvisor rating/reviews/photos, compare places to stay or eat, or find what's near a location. Triggers on phrases like "find a hotel in", "best restaurants near", "TripAdvisor reviews for", "what's the rating of", "things to do in", or "attractions near me". Requires the @chrischall/tripadvisor-mcp package installed and the tripadvisor server registered (see Setup), plus a TripAdvisor Content API key.
---

# tripadvisor-mcp

MCP server for the **TripAdvisor Content API** — location search, details, photos, and reviews for hotels, restaurants, attractions, and destinations, exposed to Claude over stdio.

- **npm:** [npmjs.com/package/@chrischall/tripadvisor-mcp](https://www.npmjs.com/package/@chrischall/tripadvisor-mcp)
- **Source:** [github.com/chrischall/tripadvisor-mcp](https://github.com/chrischall/tripadvisor-mcp)

## Setup

### Option A — npx (recommended)

Add to `.mcp.json` in your project or `~/.claude/mcp.json`:

```json
{
  "mcpServers": {
    "tripadvisor": {
      "command": "npx",
      "args": ["-y", "@chrischall/tripadvisor-mcp"],
      "env": {
        "TRIPADVISOR_API_KEY": "your-content-api-key-here"
      }
    }
  }
}
```

Get a key at [tripadvisor.com/developers](https://www.tripadvisor.com/developers). The free tier is **5,000 calls/month**; the server caches responses in-memory to stretch it.

### Option B — from source

```bash
git clone https://github.com/chrischall/tripadvisor-mcp
cd tripadvisor-mcp
npm install && npm run build
```

## Environment

| Var | Required | Purpose |
| --- | --- | --- |
| `TRIPADVISOR_API_KEY` | yes | Content API key (sent as the `key` query parameter). |
| `TRIPADVISOR_REFERER` | no | `Referer` header — required if your key was created with a domain restriction. |
| `TRIPADVISOR_CACHE_TTL` | no | Seconds to cache identical search responses (default: 300; `0` disables). |
| `TRIPADVISOR_STATIC_CACHE_TTL` | no | Longer TTL for details/photos/reviews (default: 3600; `0` disables). |

## Tools

| Tool | Use for |
| --- | --- |
| `ta_search_locations` | Find places by name — `searchQuery` required; filter with `category` (hotels/attractions/restaurants/geos), `latLong` + `radius`/`radiusUnit`, `address`, `phone`, `language`. Returns up to 10 matches with `location_id`. |
| `ta_search_nearby` | Find places near coordinates — `latLong` ("lat,long") required; same filters. |
| `ta_get_location_details` | Full listing for a `location_id`: rating, ranking, subratings, awards, review count, amenities, hours, URLs. Optional `language`, `currency`. |
| `ta_get_location_photos` | Photos (multi-size URLs + captions). Page with `limit`/`offset`; filter `source` to `Expert`, `Management`, `Traveler`. |
| `ta_get_location_reviews` | Up to 5 most-recent reviews per call; page with `offset`. |

## Workflow

1. `ta_search_locations` (or `ta_search_nearby`) to get `location_id`s.
2. `ta_get_location_details` for ratings/amenities; `ta_get_location_reviews` and `ta_get_location_photos` for review text and images.

Notes:
- Everything is **read-only** — the Content API has no write endpoints.
- A `403` usually means a domain/IP-restricted key: set `TRIPADVISOR_REFERER` to a matching domain.
- Reviews come back at most 5 per call — page with `offset` for more.
