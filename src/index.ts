#!/usr/bin/env node
import { runMcp } from '@chrischall/mcp-utils';
import { VERSION } from './version.js';
import { registerSearchTools } from './tools/search.js';
import { registerLocationTools } from './tools/location.js';
import { registerWebTools } from './tools/web.js';

// The TripAdvisorClient is a module-level singleton (imported by each tool
// module) that defers its config error to the first request — so the server
// boots and answers the host's install-time tools/list probe even without
// TRIPADVISOR_API_KEY.
await runMcp({
  name: 'tripadvisor-mcp',
  version: VERSION,
  banner: '[tripadvisor-mcp] This project was developed and is maintained by AI (Claude). Use at your own discretion.',
  tools: [registerSearchTools, registerLocationTools, registerWebTools],
});
