// Pure parsing for the web tier — no bridge, no I/O, so it's unit-testable
// against captured bytes. Shapes pinned in docs/TRIPADVISOR-WEB-API.md.

/** A location's structured detail, projected from the page's schema.org ld+json. */
export interface LocationDetail {
  /** schema.org type: LocalBusiness (attraction) | LodgingBusiness (hotel) | FoodEstablishment (restaurant). */
  type?: string;
  name: string;
  /** Canonical tripadvisor.com listing URL. */
  url?: string;
  rating?: number;
  review_count?: number;
  best_rating?: number;
  telephone?: string;
  image?: string;
  latitude?: number;
  longitude?: number;
  /** Official site or other cross-reference, if present. */
  same_as?: string;
  address?: Record<string, string>;
}

/**
 * Build the location detail path from a numeric `d`-id. TripAdvisor canonicalizes
 * on the `d<id>` segment and same-origin-redirects the `g<geo>` + type prefix to
 * the correct page (verified across attraction/hotel/restaurant), so one fixed
 * form works for every category — the in-tab fetch follows the redirect.
 */
export function locationDetailPath(locationId: number): string {
  return `/Attraction_Review-g1-d${locationId}-Reviews-a-a.html`;
}

/** Extract every `application/ld+json` block's parsed JSON (skipping malformed ones). */
function ldJsonBlocks(html: string): unknown[] {
  const out: unknown[] = [];
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      out.push(JSON.parse(m[1].trim()));
    } catch {
      // Undocumented markup can carry a malformed block; skip it and keep scanning.
    }
  }
  return out;
}

/** Coerce a schema.org string|number to a finite number, or undefined. */
function num(v: unknown): number | undefined {
  if (v === undefined || v === null) return undefined;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Parse a location detail page into a {@link LocationDetail}. The business node
 * is the ld+json block carrying both `name` and `aggregateRating` (its `@type`
 * varies by category but the shape is identical). Returns null when no such node
 * is present — a hydrated shell or a bot-challenge page — so the caller can throw
 * an actionable error instead of emitting an empty projection.
 */
export function parseLocationDetail(html: string): LocationDetail | null {
  const node = ldJsonBlocks(html).find(
    (b): b is Record<string, unknown> =>
      typeof b === 'object' && b !== null && typeof (b as Record<string, unknown>).name === 'string' && 'aggregateRating' in b,
  );
  if (!node) return null;

  const rating = (node.aggregateRating ?? {}) as Record<string, unknown>;
  const geo = (node.geo ?? {}) as Record<string, unknown>;
  const detail: LocationDetail = { name: node.name as string };

  const assign = <K extends keyof LocationDetail>(key: K, value: LocationDetail[K] | undefined) => {
    if (value !== undefined) detail[key] = value;
  };
  assign('type', typeof node['@type'] === 'string' ? (node['@type'] as string) : undefined);
  assign('url', typeof node.url === 'string' ? (node.url as string) : undefined);
  assign('rating', num(rating.ratingValue));
  assign('review_count', num(rating.reviewCount));
  assign('best_rating', num(rating.bestRating));
  assign('telephone', typeof node.telephone === 'string' ? (node.telephone as string) : undefined);
  assign('image', typeof node.image === 'string' ? (node.image as string) : undefined);
  assign('latitude', num(geo.latitude));
  assign('longitude', num(geo.longitude));
  assign('same_as', typeof node.sameAs === 'string' ? (node.sameAs as string) : undefined);
  if (node.address && typeof node.address === 'object') {
    const addr: Record<string, string> = {};
    for (const [k, v] of Object.entries(node.address as Record<string, unknown>)) {
      if (k !== '@type' && typeof v === 'string') addr[k] = v;
    }
    if (Object.keys(addr).length) detail.address = addr;
  }
  return detail;
}
