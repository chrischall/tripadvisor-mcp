# TripAdvisor Terra API — pinned request shapes

The MCP targets TripAdvisor's **Terra** API (the successor to the legacy Content API, which is
sunset on 2026-08-31). Shapes below were captured live with a real Discover-plan key on
2026-07-05. All requests are `GET` over https against:

```
https://terra.tripadvisor.com/api
```

## Authentication

- API key in the **`X-API-Key` request header** (the legacy `key` query param is gone).
- Keys are created at https://www.tripadvisor.com/developers (the Terra dashboard). A key must
  have an active plan; the free **Discover** tier is pay-as-you-go (10 QPS, 10,000 calls/day).
- Calling the **legacy** endpoint (`api.content.tripadvisor.com/api/v1`) with a Terra key returns
  `403` with an AWS-gateway body `{"Message":"User is not authorized … explicit deny …"}`. That
  is the tell that a key is Terra, not legacy.

## Endpoints

### 1. Location Search — `GET /locations/search`

| Param | Type | Required | Notes |
| --- | --- | --- | --- |
| `query` | string | yes | 1–500 chars |
| `category` | string | no | `RESTAURANT` \| `ATTRACTION` \| `HOTEL` (UPPERCASE) |
| `search_type` | string | no | Default `NAME` |
| `country_code` | string | no | Alpha-2 (e.g. `US`) |
| `geo_name` | string | no | City/Town/Country name |
| `postal_code` | string | no | Takes precedence over `geo_name` |
| `locale` | string[] | no | Priority-ordered locales for localized fields |
| `page` | integer | no | 1-based |
| `size` | integer | no | Default 20, **max 20** |

### 2. Nearby Search — `GET /locations/nearby`

Center is **`lat`+`lon`+`radius`** (`unit` = `MI` default \| `KM`) **or** a bounding box
(`sw_lat`,`sw_lon`,`ne_lat`,`ne_lon`) **or** `location_id`+`radius`. Plus `category`,
`min_rating` (1.0–5.0), `include_photo` (bool), `sort` (`distance`\|`rating`), `page`, `size`, `locale`.
All three center modes verified live (2026-07-05). The bounding-box mode ignores `radius`.

### 2b. Multiple Locations (batch) — `GET /locations`

Repeated **`id`** query param (`?id=1&id=2&…`), required. Optional `locale[]`. Returns
`{ data: [ <Location>, … ] }` — **no `pagination` wrapper**. Verified live: `id=323690&id=348876`
returned both. IDs you're not licensed for, or that don't exist, are **silently omitted** rather
than failing the request (a malformed id — e.g. one exceeding int32 — does 400, though). Saves
quota vs. N single `/locations/{id}` calls.

### 3. Location Details — `GET /locations/{id}`

Path `id` (int) — **plural `/locations/{id}`** (the docs' llms.txt index says singular; that 404s).
Optional `locale[]`. Returns the full location object directly (not wrapped in `data`).

### 4. Location Reviews — `GET /locations/{id}/reviews`

Optional `page`, `size` (max 20), `locale[]`. Returns `{ data: [...], pagination }`.

### 5. Location Photos — `GET /locations/{id}/photos`

Optional `page`, `size` (max 20), `locale[]`. Returns `{ data: [...], pagination }`.

## Response shapes

**List endpoints** (`search`, `nearby`, `reviews`, `photos`) wrap results:

```jsonc
{ "data": [ /* items */ ], "pagination": { "page": 1, "size": 20, "total_pages": N, "total_elements": M } }
```

- `search` item: `{ location: <Location>, matched_value: { language, value } }`
- `nearby` item: `{ location: <Location>, bearing, distance_miles, distance_kilometers }`
- `photos` item: `{ id, location_id, photo: { key, original_size_url, original_height, original_width, media_type }, publish_ts, source: { name }, user }`

**Location** object (also the `details` response, unwrapped):

```jsonc
{
  "id": 104675, "geo_id": 60713, "geo": "San Francisco, California",
  "names": [{ "language": "en", "value": "Golden Gate Bridge", "primary": true }],
  "status": { "value": "..." },
  "descriptions": [{ "language": "en", "value": "..." }],
  "coordinates": { "latitude": 37.82, "longitude": -122.4786 },   // present on search/nearby items
  "addresses": [{ "street_address", "city", "state", "country_name", "country_code", "postal_code", "formatted" }],
  "phone_numbers": [{ "value", "type" }],
  "urls": { "tripadvisor": { "main", "photos", "write_review", "questions_answers" }, "official": "..." },
  "traveler_ratings": { "overall": { "rating": 4.7, "count": 49969, "icon_url": "..." }, "breakdowns": [], "subratings": [] },
  "official_email": "...", "recommended_visit_length": N
}
```

Note: `names` is an **array** keyed by language (not a flat `name`) — the primary name is the
entry with `primary: true` (or the first). Same for `descriptions`/`addresses`.

## Error shape

- `400` — validation: `{ type, title, status, detail, field_errors: [{ field, message, ... }], trace_id }`.
- `401`/`403` — key missing/invalid or not authorized (e.g. a legacy key on Terra, or vice-versa).
- `404` — `{ "message": "Not Found" }` (unknown id, or the wrong singular `/location/{id}` path).
- `429` — plan QPS or daily quota exceeded (Discover: 10 QPS, 10k/day).
