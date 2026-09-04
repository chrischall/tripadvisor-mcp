import { minifiedResult, resolveView, stripMediaUrls, viewParam, type View } from '@chrischall/mcp-utils';
import { compactList, compactLocationList } from './projection.js';

/**
 * The rungs this server honours (`@chrischall/mcp-utils`' `view` vocabulary;
 * `chrischall/workflows` `docs/fleet-conventions.md`, "Response shape").
 *
 * This is a GROUNDED repo: `projection.ts` has carried `compactLocation` /
 * `compactList` / `compactLocationList` all along, and they were opt-in —
 * `compact: false`, with the tool descriptions saying "Pass compact:true for
 * slim summaries". An efficiency that has to be requested is one that usually
 * is not, and the caller paying for it is the one least able to know a slim
 * rung existed.
 *
 * A hand-written projection is NOT then media-stripped. It was written with
 * knowledge of the API and its field choices are deliberate; running a blind
 * subtractive rule over its output would let an un-grounded rule overrule a
 * grounded one, which bit viator-mcp where the projection intentionally keeps
 * a cover image. Media stripping is for the payloads that have no projection
 * to speak for them — here, the review and photo endpoints.
 *
 * No `raw` rung: `full` already returns the untouched upstream payload.
 */
export const TA_VIEWS = ['compact', 'full'] as const;

const NOTE =
  'compact returns the slim projection where one exists and strips image URLs elsewhere; ' +
  '"full" returns TripAdvisor\'s whole records.';

/** The `view` parameter every read tool in this server takes. */
export const viewArg = (): ReturnType<typeof viewParam> => viewParam(TA_VIEWS, { note: NOTE });

type Projector = 'list' | 'locationList' | undefined;

/** Answer in the requested rung, running the named projection when there is one. */
export function viewResponse(
  view: string | undefined,
  data: unknown,
  projector?: Projector,
): ReturnType<typeof minifiedResult> {
  const rung: View = resolveView(view, TA_VIEWS);
  if (rung !== 'compact') return minifiedResult(data);
  if (projector === 'list') return minifiedResult(compactList(data));
  if (projector === 'locationList') return minifiedResult(compactLocationList(data));
  return minifiedResult(stripMediaUrls(data));
}
