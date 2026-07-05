# TripAdvisor consumer-site (web bridge) — pinned shapes

The optional web tier (`src/web/`) reaches **www.tripadvisor.com** — the DataDome-fronted
consumer site, unreachable server-side — by routing same-origin fetches through the user's
signed-in tab via the fetchproxy bridge. Shapes below were captured live through the bridge
on 2026-07-04 (recon scripts in the session scratchpad); re-verify if parsing drifts.

## Recon summary — what's usable

| Surface | Result | Verdict |
| --- | --- | --- |
| Location detail page (`/*_Review-g<g>-d<id>-...html`) | 200, SSR with clean `application/ld+json` | **Usable** — powers `ta_web_get_location` |
| `/Search?q=` page | 200 but a hydrated SPA shell — no SSR results | Not usable (results load via a GraphQL persisted query) |
| `/data/1.0/typeahead?...` | 404 | Stale/removed endpoint |
| `POST /data/graphql/ids` | 200 but needs a persisted-query hash + variables | Brittle — not built |

Individual review **text** is rendered in HTML (no `Review` ld+json, no Apollo/redux store),
so scraping it is brittle and deliberately not built. The detail page's `aggregateRating`
(rating + review count) IS clean and is returned.

### Search — no key-free JSON endpoint (probed 2026-07-04)

There is no clean consumer search/typeahead endpoint reachable through the bridge; every
plausible one is a dead end, so **search is not built** (get a `d`-id from the Terra API's
`ta_search_locations`, or from a TripAdvisor URL, then use `ta_web_get_location`):

| Endpoint | Result |
| --- | --- |
| `GET /TypeAheadJson?query=…` | 200 but empty body |
| `GET /data/1.0/typeahead?query=…` | 404 |
| `GET /api/internal/1.14/typeahead?query=…` | 401 (needs auth) |
| `GET /Search?q=…` (+`searchType=json`) | 200 but the hydrated SPA shell (no result data) |

Real search runs through `POST /data/graphql/ids` with a **persisted-query hash + variables**
— the hash rotates, so it's brittle by design and off-limits per fleet discipline.

## Location detail — the one solid web endpoint

**Canonicalization:** TripAdvisor canonicalizes on the **`d<id>`** segment. A single fixed
URL form works for every category — the `g<geo>` and the `_Review` type prefix are corrected
by a same-origin redirect (which the in-tab fetch follows). Verified: `Attraction_Review-g1-d<id>`
resolves correctly to attraction **and** hotel (`d93520`) **and** restaurant (`d423942`) pages.

```
GET /Attraction_Review-g1-d<locationId>-Reviews-x-y.html
```

**Parsing:** the page embeds 3 `application/ld+json` blocks. The business node is the one with
both `name` and `aggregateRating`; its `@type` varies by category but the shape is identical:

| `@type` | Category |
| --- | --- |
| `LocalBusiness` | Attraction |
| `LodgingBusiness` | Hotel |
| `FoodEstablishment` | Restaurant |

Fields extracted (all schema.org):

```jsonc
{
  "@type": "LocalBusiness",
  "name": "Golden Gate Bridge",
  "url": "https://www.tripadvisor.com/Attraction_Review-g60713-d104675-...html",
  "address": { "addressLocality": "San Francisco", "addressRegion": "California",
               "addressCountry": "US", "postalCode": "94129" },
  "aggregateRating": { "ratingValue": "4.7", "reviewCount": 49969, "bestRating": 5 },
  "image": "https://dynamic-media-cdn.tripadvisor.com/media/photo-o/.../golden-gate-bridge.jpg?...",
  "telephone": "+1 415-921-5858",
  "geo": { "latitude": 37.820026, "longitude": -122.47859 },
  "sameAs": "https://www.goldengate.org/",
  "@id": "/Attraction_Review-g60713-d104675-...html"
}
```

The ld+json is raw JSON inside `<script>` (not entity-encoded) — `JSON.parse` works directly.

## Bot-wall / error handling

A non-JSON 2xx or a DataDome interstitial (`classifyBotWall`) means the tab needs a refresh;
the web client throws an actionable error rather than parsing garbage.
