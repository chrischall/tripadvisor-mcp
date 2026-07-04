# TripAdvisor Content API — pinned request shapes

Pinned from the official reference (https://tripadvisor-content-api.readme.io/reference/overview)
on 2026-07-03. The Content API is **read-only** (no write endpoints). All requests are
`GET` over https against:

```
https://api.content.tripadvisor.com/api/v1
```

## Authentication

- API key in the **`key` query parameter** (not a header).
- Keys are created at https://www.tripadvisor.com/developers and may be **restricted by
  domain or IP** at creation time. A domain-restricted key requires a matching `Referer`
  header on every request (`TRIPADVISOR_REFERER` in this repo); an IP-restricted key must
  be called from a listed address. A mismatch returns `403`.
- Free tier: 5,000 calls/month; hard rate limits apply beyond that (429 / 403 on abuse).

## Endpoints

### 1. Location Search — `GET /location/search`

| Param | Type | Required | Notes |
| --- | --- | --- | --- |
| `key` | string | yes | Partner API key |
| `searchQuery` | string | yes | Free-text name search |
| `category` | string | no | `hotels` \| `attractions` \| `restaurants` \| `geos` |
| `phone` | string | no | Digits with optional spaces/dashes, no leading `+` |
| `address` | string | no | Address filter |
| `latLong` | string | no | `"42.3455,-71.10767"` |
| `radius` | number | no | > 0; scopes `latLong` |
| `radiusUnit` | string | no | `km` \| `mi` \| `m` |
| `language` | string | no | Default `en` (45 codes incl. regional variants) |

Returns up to **10** locations: `{ data: [{ location_id, name, address_obj, ... }] }`.

### 2. Nearby Search — `GET /location/nearby_search`

Same params as search except `latLong` is **required** and there is no `searchQuery`.
Returns up to **10** locations near the point.

### 3. Location Details — `GET /location/{locationId}/details`

| Param | Type | Required | Notes |
| --- | --- | --- | --- |
| `locationId` | int32 | yes (path) | From Location Search |
| `key` | string | yes | |
| `language` | string | no | Default `en` |
| `currency` | string | no | ISO 4217, default `USD` |

Returns name, address, coordinates, rating, ranking, subratings, awards, review count,
amenities, hours, and Tripadvisor listing/write-review URLs.

### 4. Location Photos — `GET /location/{locationId}/photos`

| Param | Type | Required | Notes |
| --- | --- | --- | --- |
| `locationId` | int32 | yes (path) | |
| `key` | string | yes | |
| `language` | string | no | Default `en` |
| `limit` | number | no | Number of results |
| `offset` | number | no | Index of first result |
| `source` | string | no | Comma-separated: `Expert`, `Management`, `Traveler` |

Returns photo objects with multi-size image URLs (`{ data: [{ id, caption, images: { thumbnail|small|medium|large|original: { url, ... } } }] }`).

### 5. Location Reviews — `GET /location/{locationId}/reviews`

| Param | Type | Required | Notes |
| --- | --- | --- | --- |
| `locationId` | int32 | yes (path) | |
| `key` | string | yes | |
| `language` | string | no | Default `en` |
| `limit` | number | no | |
| `offset` | number | no | |

Returns up to **5 of the most recent** reviews per call.

## Error shape

Non-2xx responses carry `{ "error": { "message": "...", "type": "...", "code": NNN } }`.
Notable statuses:

- `401` — key missing/invalid.
- `403` — key exists but is blocked. **Observed live 2026-07-03:** body is the AWS-gateway
  message `{"Message":"User is not authorized to access this resource with an explicit deny
  in an identity-based policy"}` (not the documented `{error:{...}}` shape) when the key has
  no payment method attached or its IP restriction excludes the caller. Adding a `Referer`
  does not change the outcome for key-level blocks — only for domain-restriction mismatches.
- `429` — monthly quota or rate limit exceeded.

## Live verification status

Request shapes above are pinned from the official reference docs. **Live verification is
gated on a human-supplied `TRIPADVISOR_API_KEY`** (the key form requires a billing-capable
TripAdvisor account); run `node scripts/live-probe.mjs` once a key is in `.env` and update
this section with any observed response-shape drift.
