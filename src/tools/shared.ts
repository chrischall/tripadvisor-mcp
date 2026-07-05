import { z } from 'zod';
import { buildQueryString } from '@chrischall/mcp-utils';

/** TripAdvisor location id — a positive integer (interpolated into the path). */
export const LocationId = z.number().int().positive().describe('TripAdvisor location ID (from a search tool)');

/** Terra category filter — the three UPPERCASE values the API accepts. */
export const Category = z.enum(['RESTAURANT', 'ATTRACTION', 'HOTEL']);

/** Locale list → Terra's repeated `locale` query param. */
export const LocaleList = z
  .array(z.string())
  .optional()
  .describe('Preferred locales for localized fields, in priority order (e.g. ["en","es"])');

/** Paging shared by Terra list endpoints (size is capped at 20 by the API). */
export const pageParams = {
  page: z.number().int().min(1).optional().describe('Page index (1-based)'),
  size: z.number().int().min(1).max(20).optional().describe('Results per page (max 20)'),
};

/**
 * Build a `?a=b&c=d` query string, dropping undefined values and expanding
 * arrays into repeated params (Terra takes `locale` repeated). Thin wrapper over
 * the shared helper so every tool serializes params identically.
 */
export function qs(params: Record<string, unknown>): string {
  return buildQueryString(params);
}
