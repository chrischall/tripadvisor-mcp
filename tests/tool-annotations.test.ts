import { describe, it, expect } from 'vitest';
import { createTestHarness } from '@chrischall/mcp-utils/test';
import { registerSearchTools } from '../src/tools/search.js';
import { registerLocationTools } from '../src/tools/location.js';
import { registerWebTools } from '../src/tools/web.js';

/**
 * Fleet annotation invariants, read off the REGISTERED tools rather than a
 * hand-kept list. `destructiveHint` defaults to TRUE whenever readOnlyHint is
 * false, so a write that forgets it is published as destructive and nothing
 * fails; and an absent `openWorldHint` defaults to true, which is only right
 * by accident. Every tool here talks to TripAdvisor (the Terra API, or the
 * consumer site through the browser bridge), so all of them are open-world.
 */
interface Ann {
  readOnlyHint?: unknown;
  destructiveHint?: unknown;
  openWorldHint?: unknown;
}

async function registeredAnnotations(): Promise<Record<string, Ann | undefined>> {
  const h = await createTestHarness((s) => {
    registerSearchTools(s);
    registerLocationTools(s);
    registerWebTools(s);
  });
  // The harness's own listTools() strips to name/description; the client's
  // RPC returns the full advertised tool, annotations included.
  const { tools } = await h.client.listTools();
  await h.close();
  return Object.fromEntries(tools.map((t) => [t.name, t.annotations as Ann | undefined]));
}

describe('every tool is annotated truthfully', () => {
  it('covers the full surface (guards against a registrar being dropped here)', async () => {
    expect(Object.keys(await registeredAnnotations())).toHaveLength(8);
  });

  it('sets an explicit boolean readOnlyHint on all of them', async () => {
    const missing = Object.entries(await registeredAnnotations())
      .filter(([, a]) => typeof a?.readOnlyHint !== 'boolean')
      .map(([name]) => name);
    expect(missing).toEqual([]);
  });

  it('sets an explicit boolean destructiveHint on every write', async () => {
    const undeclared = Object.entries(await registeredAnnotations())
      .filter(([, a]) => a?.readOnlyHint === false && typeof a?.destructiveHint !== 'boolean')
      .map(([name]) => name);
    expect(undeclared).toEqual([]);
  });

  it('never lets a read claim to be destructive', async () => {
    const contradictory = Object.entries(await registeredAnnotations())
      .filter(([, a]) => a?.readOnlyHint === true && a?.destructiveHint === true)
      .map(([name]) => name);
    expect(contradictory).toEqual([]);
  });

  it('marks every tool open-world (each one reaches TripAdvisor)', async () => {
    const notOpen = Object.entries(await registeredAnnotations())
      .filter(([, a]) => a?.openWorldHint !== true)
      .map(([name]) => name);
    expect(notOpen).toEqual([]);
  });

  it('is read-only end to end (Terra has no write endpoints)', async () => {
    const writes = Object.entries(await registeredAnnotations())
      .filter(([, a]) => a?.readOnlyHint !== true)
      .map(([name]) => name);
    expect(writes).toEqual([]);
  });
});
