#!/usr/bin/env node
// Read-only live probe through the BUILT client — exercises the real
// path-building + cache + error layers end-to-end (run `npm run build` first).
// Needs TRIPADVISOR_API_KEY in .env; calls are spaced ~3s apart to stay polite
// on the 5,000-calls/month free tier. Usage: node scripts/live-probe.mjs
import { TripAdvisorClient } from '../dist/client.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const client = new TripAdvisorClient({ cacheTtlMs: 0, staticCacheTtlMs: 0 });

const preview = (label, data) => {
  const text = JSON.stringify(data);
  console.log(`\n=== ${label} ===\n${text.length > 800 ? text.slice(0, 800) + ' …' : text}`);
};

try {
  const search = await client.get('/location/search?searchQuery=Fenway%20Park&category=attractions');
  preview('location/search', search);
  const id = search?.data?.[0]?.location_id;
  if (!id) throw new Error(`no location_id in search response — shape drift? ${JSON.stringify(search).slice(0, 300)}`);
  await sleep(3000);

  preview('nearby_search', await client.get('/location/nearby_search?latLong=42.3455%2C-71.10767&category=restaurants'));
  await sleep(3000);
  preview(`location/${id}/details`, await client.get(`/location/${id}/details`));
  await sleep(3000);
  preview(`location/${id}/photos`, await client.get(`/location/${id}/photos?limit=2`));
  await sleep(3000);
  preview(`location/${id}/reviews`, await client.get(`/location/${id}/reviews?limit=2`));
  console.log('\nAll five endpoints answered. Update docs/TRIPADVISOR-API.md if any shape drifted.');
} catch (e) {
  console.error(`\nProbe failed: ${e.message}`);
  process.exitCode = 1;
}
