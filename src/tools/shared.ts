import { z } from 'zod';
import { buildQueryString } from '@chrischall/mcp-utils';

/** TripAdvisor location id — a positive integer (interpolated into the path). */
export const LocationId = z.number().int().positive().describe('TripAdvisor location ID (from a search tool)');

/** `"lat,long"` pair, e.g. `"42.3455,-71.10767"`. */
export const LatLong = z
  .string()
  .regex(/^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/, 'must be a "lat,long" pair like "42.3455,-71.10767"');

/** Search category filter — the four values the Content API accepts. */
export const Category = z.enum(['hotels', 'attractions', 'restaurants', 'geos']);

/** Filters shared by the two search endpoints. */
export const searchFilterParams = {
  category: Category.optional().describe('Restrict results to one property type'),
  phone: z.string().optional().describe('Phone number filter (spaces/dashes ok, no leading "+")'),
  address: z.string().optional().describe('Address filter'),
  radius: z.number().positive().optional().describe('Search radius around latLong (must be > 0)'),
  radiusUnit: z.enum(['km', 'mi', 'm']).optional().describe('Unit for radius'),
  language: z.string().optional().describe('Result language code (default: en)'),
};

/**
 * Build a `?a=b&c=d` query string, dropping undefined values. Thin wrapper over
 * the shared helper so every tool serializes params identically.
 */
export function qs(params: Record<string, unknown>): string {
  return buildQueryString(params);
}
