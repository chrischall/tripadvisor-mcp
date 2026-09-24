// Pure parsing for the web tier — no bridge, no I/O, so it's unit-testable
// against captured bytes. Shapes pinned in docs/TRIPADVISOR-WEB-API.md.

// Linear-time (indexOf-driven) ld+json extraction. A `<script[^>]*…` regex here
// backtracked quadratically on a hostile flood of unterminated `<script` openers.
import { extractJsonLdBlocks } from '@chrischall/mcp-utils/scrape';

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

/** Coerce a schema.org string|number to a finite number, or undefined. */
function num(v: unknown): number | undefined {
  if (v === undefined || v === null) return undefined;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** schema.org `@type`s TripAdvisor uses for a listing's business node (see docs/TRIPADVISOR-WEB-API.md). */
const BUSINESS_TYPES = new Set([
  'LocalBusiness',
  'LodgingBusiness',
  'FoodEstablishment',
  'Restaurant',
  'Hotel',
  'TouristAttraction',
]);

/** The listing `d`-id a node's `url` / `@id` points at (`…-d<id>-…`), or undefined. */
function nodeListingId(node: Record<string, unknown>): number | undefined {
  for (const ref of [node.url, node['@id']]) {
    if (typeof ref !== 'string') continue;
    const m = /-d(\d+)-/.exec(ref);
    if (m) return Number(m[1]);
  }
  return undefined;
}

/**
 * A listing's business node: named, and either rated, typed as a business, or
 * pointing at a `-d<id>-` listing URL. A brand-new listing has no reviews and so
 * no `aggregateRating`, but is still a listing — requiring the rating would
 * misreport it as a bot-challenge shell. Site-wide `Organization`/`WebSite`
 * nodes carry a name too, but none of the other three.
 */
function isBusinessNode(b: unknown): b is Record<string, unknown> {
  if (typeof b !== 'object' || b === null) return false;
  const node = b as Record<string, unknown>;
  if (typeof node.name !== 'string') return false;
  const type = node['@type'];
  return (
    'aggregateRating' in node ||
    (typeof type === 'string' && BUSINESS_TYPES.has(type)) ||
    nodeListingId(node) !== undefined
  );
}

/**
 * Thrown when the page resolved to a different listing than the one requested —
 * e.g. a geo (`g`) id, a removed listing, or a merged duplicate that TripAdvisor
 * redirects elsewhere. Returning that page's detail under the requested id would
 * attribute another business's rating/address/phone to it.
 */
export class LocationMismatchError extends Error {
  constructor(
    readonly requestedId: number,
    readonly foundId: number,
  ) {
    super(`TripAdvisor served listing d${foundId}, not the requested d${requestedId}.`);
    this.name = 'LocationMismatchError';
  }
}

/**
 * Parse a location detail page into a {@link LocationDetail}. The business node
 * is picked by {@link isBusinessNode} (its `@type` varies by category but the
 * shape is identical). When `locationId` is given, the node whose `url`/`@id`
 * carries `-d<locationId>-` wins; if the chosen node names a different listing,
 * {@link LocationMismatchError} is thrown. Returns null when no business node is
 * present — a hydrated shell or a bot-challenge page — so the caller can throw
 * an actionable error instead of emitting an empty projection. A listing with no
 * reviews parses fine; its rating fields are simply absent.
 */
export function parseLocationDetail(html: string, locationId?: number): LocationDetail | null {
  const candidates = extractJsonLdBlocks(html).filter(isBusinessNode);
  const node =
    (locationId !== undefined ? candidates.find((c) => nodeListingId(c) === locationId) : undefined) ?? candidates[0];
  if (!node) return null;
  if (locationId !== undefined) {
    const foundId = nodeListingId(node);
    if (foundId !== undefined && foundId !== locationId) throw new LocationMismatchError(locationId, foundId);
  }

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
