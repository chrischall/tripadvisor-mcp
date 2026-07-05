#!/usr/bin/env node
// Read-only live probe through the BUILT client — exercises the real Terra
// path-building + cache + error layers end-to-end (run `npm run build` first).
// Needs TRIPADVISOR_API_KEY (a Terra key) in .env; calls are spaced to stay
// polite on the Discover tier (10 QPS / 10k per day).
// Usage: node scripts/live-probe.mjs
import { client } from '../dist/client.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const primaryName = (loc) => (loc?.names || []).find((n) => n.primary)?.value || loc?.names?.[0]?.value;
const preview = (label, data) => {
  const text = JSON.stringify(data);
  console.log(`\n=== ${label} ===\n${text.length > 700 ? text.slice(0, 700) + ' …' : text}`);
};

try {
  const search = await client.get('/locations/search?query=Golden%20Gate%20Bridge&category=ATTRACTION&size=1');
  preview('locations/search', search);
  const loc = search?.data?.[0]?.location;
  const id = loc?.id;
  if (!id) throw new Error(`no location id in search response — shape drift? ${JSON.stringify(search).slice(0, 300)}`);
  console.log(`\nresolved: ${primaryName(loc)} (id ${id})`);
  await sleep(1500);

  preview(`locations/${id} (details)`, await client.get(`/locations/${id}`));
  await sleep(1500);
  preview('locations/nearby', await client.get('/locations/nearby?lat=37.82&lon=-122.4786&radius=3&unit=KM&size=2'));
  await sleep(1500);
  preview(`locations/${id}/photos`, await client.get(`/locations/${id}/photos?size=2`));
  await sleep(1500);
  preview(`locations/${id}/reviews`, await client.get(`/locations/${id}/reviews?size=2`));
  console.log('\nAll five Terra endpoints answered. Update docs/TRIPADVISOR-API.md if any shape drifted.');
} catch (e) {
  console.error(`\nProbe failed: ${e.message}`);
  process.exitCode = 1;
}
