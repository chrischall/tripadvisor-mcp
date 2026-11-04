import { describe, it, expect } from 'vitest';
import { createTestHarness } from '@chrischall/mcp-utils/test';
import { registerSearchTools } from '../src/tools/search.js';
import { registerLocationTools } from '../src/tools/location.js';
import { registerWebTools } from '../src/tools/web.js';

/**
 * Context-group hints (`_meta.mint`, the mcp-host context-groups contract),
 * read off the SERVED tool list — what a host sees. Every tool here is a
 * travel lookup: TripAdvisor answers "find / tell me about a place", never
 * "what's new / due / on", so nothing is canonical and nothing takes a
 * subject (there is no listable set of the person's own subjects).
 */
const DOMAINS = ['school', 'home', 'work', 'family', 'health', 'money', 'travel', 'food'];
const INTENTS = ['whats-new', 'whats-due', 'whats-on', 'lookup', 'turn-on-off', 'send', 'change', 'other'];
const KEYS = ['domain', 'intent', 'canonical', 'subject', 'when', 'aliases'];

interface Served {
  name: string;
  annotations?: { readOnlyHint?: boolean };
  inputSchema?: { properties?: Record<string, unknown> };
  _meta?: { mint?: Record<string, unknown> };
}

async function served(): Promise<Served[]> {
  const h = await createTestHarness((s) => {
    registerSearchTools(s);
    registerLocationTools(s);
    registerWebTools(s);
  });
  const { tools } = await h.client.listTools();
  await h.close();
  return tools as unknown as Served[];
}

/** The intent every non-healthcheck tool declares — this table is the assertion. */
const EXPECTED_INTENT: Record<string, string> = {
  ta_search_locations: 'lookup',
  ta_search_nearby: 'lookup',
  ta_get_locations: 'lookup',
  ta_get_location_details: 'lookup',
  ta_get_location_photos: 'lookup',
  ta_get_location_reviews: 'lookup',
  ta_web_get_location: 'lookup',
};

describe('_meta.mint on every served tool', () => {
  it('names every served tool except the healthcheck, so a new tool cannot skip the decision', async () => {
    const names = (await served()).map((t) => t.name).filter((n) => !n.endsWith('_healthcheck'));
    expect(names.sort()).toEqual(Object.keys(EXPECTED_INTENT).sort());
  });

  it.each(Object.entries(EXPECTED_INTENT))('%s declares domain travel and intent %s', async (name, intent) => {
    const tool = (await served()).find((t) => t.name === name);
    expect(tool?._meta?.mint?.domain).toBe('travel');
    expect(tool?._meta?.mint?.intent).toBe(intent);
  });

  it('every hint is shaped per the host contract', async () => {
    for (const tool of await served()) {
      const mint = tool._meta?.mint;
      if (!mint) continue; // only the healthcheck may lack one (asserted above)
      const props = Object.keys(tool.inputSchema?.properties ?? {});
      expect(Object.keys(mint).filter((k) => !KEYS.includes(k)), tool.name).toEqual([]);
      expect(DOMAINS, tool.name).toContain(mint.domain);
      expect(INTENTS, tool.name).toContain(mint.intent);
      if ('canonical' in mint) {
        expect(mint.canonical, tool.name).toBe(true);
        expect(tool.annotations?.readOnlyHint, tool.name).toBe(true);
        expect(['whats-new', 'whats-due', 'whats-on'], tool.name).toContain(mint.intent);
        expect(props, tool.name).toContain('view');
      }
      if ('subject' in mint) expect(props, tool.name).toContain(mint.subject);
      if ('when' in mint) {
        const when = mint.when as { start: string; end: string };
        expect(Object.keys(when).sort(), tool.name).toEqual(['end', 'start']);
        expect(props, tool.name).toContain(when.start);
        expect(props, tool.name).toContain(when.end);
      }
      if ('aliases' in mint) {
        const aliases = mint.aliases as string[];
        expect(aliases.length, tool.name).toBeGreaterThan(0);
        expect(aliases.length, tool.name).toBeLessThanOrEqual(8);
        for (const a of aliases) {
          expect(a.length, tool.name).toBeLessThanOrEqual(40);
          expect(a, tool.name).toBe(a.toLowerCase());
        }
      }
    }
  });

  it('marks nothing canonical and names no subject: TripAdvisor answers no what\'s-new/due/on ask', async () => {
    const tools = await served();
    expect(tools.filter((t) => t._meta?.mint?.canonical === true).map((t) => t.name)).toEqual([]);
    expect(tools.filter((t) => t._meta?.mint && 'subject' in t._meta.mint).map((t) => t.name)).toEqual([]);
    expect(tools.filter((t) => t._meta?.mint && 'when' in t._meta.mint).map((t) => t.name)).toEqual([]);
  });

  it('gives the two search tools the words a person says when looking for a place', async () => {
    const tools = await served();
    const aliases = (n: string) => (tools.find((t) => t.name === n)?._meta?.mint?.aliases ?? []) as string[];
    expect(aliases('ta_search_locations')).toEqual(expect.arrayContaining(['restaurants', 'hotels']));
    expect(aliases('ta_search_nearby')).toEqual(expect.arrayContaining(['near me']));
    expect(aliases('ta_get_location_reviews')).toEqual(expect.arrayContaining(['reviews']));
  });
});
