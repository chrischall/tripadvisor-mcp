/**
 * Context-group hints, published on each tool as `_meta.mint` (mcp-host's
 * context-groups contract). Inert data: a host that does not read them sees an
 * extra `_meta` key and nothing else. The shape is fixed by the host's
 * contract, so it is restated here rather than imported — this server takes no
 * dependency on mcp-host.
 *
 * Every tool here is a travel LOOKUP. TripAdvisor answers "find a place" and
 * "tell me about a place", never "what's new / due / on" for the person, so no
 * tool is canonical, and none names a `subject` (there is no listable set of
 * the person's own subjects — locations are searched, not owned) or a `when`
 * (no tool takes a date range). `aliases` are the words a person says,
 * lowercase, at most 8, each at most 40 chars.
 */
export interface MintHint {
  domain: 'travel';
  intent: 'lookup';
  aliases?: string[];
}

function lookup(aliases?: string[]): { mint: MintHint } {
  return { mint: { domain: 'travel', intent: 'lookup', ...(aliases ? { aliases } : {}) } };
}

/** Find a place by name. */
export const SEARCH_META = lookup(['restaurants', 'hotels', 'things to do', 'attractions', 'where to eat', 'where to stay', 'tripadvisor']);
/** Find places around a point. */
export const NEARBY_META = lookup(['near me', 'nearby', 'close by', 'around here', 'within walking distance']);
/** One place's details (API or the public page). */
export const DETAILS_META = lookup(['opening hours', 'phone number', 'address', 'rating']);
/** Several places' details at once. */
export const BATCH_META = lookup();
/** A place's photos. */
export const PHOTOS_META = lookup(['photos', 'pictures']);
/** A place's traveler reviews. */
export const REVIEWS_META = lookup(['reviews', 'what people say', 'is it any good']);
