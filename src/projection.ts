// Opt-in compact projection for the verbose Terra list responses. Pure and
// unit-tested against captured shapes (docs/TRIPADVISOR-API.md). Keyed only off
// fields observed live; on shape drift it warns and returns the RAW payload so
// an undocumented API change degrades instead of silently emitting empties.

/** A slim, agent-friendly summary of a Terra location. */
export interface CompactLocation {
  id?: number;
  name?: string;
  /** Derived from the listing URL prefix (ATTRACTION | HOTEL | RESTAURANT). */
  category?: string;
  geo?: string;
  city?: string;
  state?: string;
  rating?: number;
  review_count?: number;
  url?: string;
  /** Present only on nearby results. */
  distance_miles?: number;
  distance_kilometers?: number;
}

type Loc = Record<string, unknown>;

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const numOf = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** Primary-language value from a Terra `names`/`descriptions` array (or the first entry). */
function primaryValue(arr: unknown): string | undefined {
  if (!Array.isArray(arr) || arr.length === 0) return undefined;
  const primary = arr.find((e) => e && typeof e === 'object' && (e as Loc).primary === true);
  const pick = (primary ?? arr[0]) as Loc;
  return str(pick?.value);
}

/** ATTRACTION | HOTEL | RESTAURANT from the `/{Type}_Review-…` listing URL. */
function categoryFromUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const m = /\/(Attraction|Hotel|Restaurant)_Review/.exec(url);
  return m ? m[1].toUpperCase() : undefined;
}

function assign<K extends keyof CompactLocation>(o: CompactLocation, k: K, v: CompactLocation[K] | undefined): void {
  if (v !== undefined) o[k] = v;
}

/** Project one Terra location object to a {@link CompactLocation}. */
export function compactLocation(loc: Loc): CompactLocation {
  const addr = (Array.isArray(loc.addresses) ? loc.addresses[0] : undefined) as Loc | undefined;
  const url = str((loc.urls as Loc | undefined)?.tripadvisor && ((loc.urls as Loc).tripadvisor as Loc).main);
  const overall = ((loc.traveler_ratings as Loc | undefined)?.overall ?? {}) as Loc;
  const out: CompactLocation = {};
  assign(out, 'id', numOf(loc.id));
  assign(out, 'name', primaryValue(loc.names));
  assign(out, 'category', categoryFromUrl(url));
  assign(out, 'geo', str(loc.geo));
  assign(out, 'city', str(addr?.city));
  assign(out, 'state', str(addr?.state));
  assign(out, 'rating', numOf(overall.rating));
  assign(out, 'review_count', numOf(overall.count));
  assign(out, 'url', url);
  return out;
}

/**
 * Project a Terra list envelope (`{data:[{location,…}], pagination}`) to compact
 * items, preserving `pagination` and any per-item `distance_*` (nearby). If the
 * shape isn't the expected `data:[{location}]`, warn to stderr and return the raw
 * payload unchanged — undocumented APIs drift, so degrade rather than break.
 */
export function compactList(raw: unknown): any {
  const env = raw as Loc;
  const rows = env?.data;
  if (!Array.isArray(rows) || !rows.every((r) => r && typeof r === 'object' && 'location' in (r as Loc))) {
    console.error('[tripadvisor] compact: unexpected response shape, returning raw payload');
    return raw;
  }
  const data = rows.map((r) => {
    const row = r as Loc;
    const item = compactLocation(row.location as Loc);
    assign(item, 'distance_miles', numOf(row.distance_miles));
    assign(item, 'distance_kilometers', numOf(row.distance_kilometers));
    return item;
  });
  return env.pagination !== undefined ? { data, pagination: env.pagination } : { data };
}

/**
 * Compact projection for the multi-get envelope (`{data:[<Location>]}` — the
 * items ARE locations, not `{location}` wrappers). Same drift-fallback contract
 * as {@link compactList}.
 */
export function compactLocationList(raw: unknown): any {
  const env = raw as Loc;
  const rows = env?.data;
  if (!Array.isArray(rows) || !rows.every((r) => r && typeof r === 'object' && 'id' in (r as Loc))) {
    console.error('[tripadvisor] compact: unexpected response shape, returning raw payload');
    return raw;
  }
  return { data: rows.map((r) => compactLocation(r as Loc)) };
}
