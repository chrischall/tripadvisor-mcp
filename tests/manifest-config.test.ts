import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p: string) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

// The server boots without TRIPADVISOR_API_KEY (the config error is deferred to
// the first Terra call) and ta_web_* works with no key at all, so installers
// must not block a user who only wants the key-free web tier.
describe('install-time config: the Terra API key is optional', () => {
  it('.mcpb manifest does not require tripadvisor_api_key, and says which tools need it', () => {
    const field = readJson('manifest.json').user_config.tripadvisor_api_key;
    expect(field.required).toBe(false);
    expect(field.sensitive).toBe(true);
    expect(field.description).toMatch(/ta_web_/);
  });

  it('MCP registry server.json does not mark TRIPADVISOR_API_KEY required', () => {
    const vars = readJson('server.json').packages.flatMap(
      (p: { environmentVariables?: { name: string; isRequired?: boolean }[] }) => p.environmentVariables ?? [],
    );
    const key = vars.find((v: { name: string }) => v.name === 'TRIPADVISOR_API_KEY');
    expect(key?.isRequired).toBe(false);
  });
});

// Every env key the built server reads must be settable from each install
// path (mcp-utils audit-annotations --strict env-drift check). All are
// optional: the server boots with none of them set.
describe('install-time config: every env key the server reads is declared', () => {
  const KEYS = [
    'TRIPADVISOR_API_KEY',
    'TRIPADVISOR_CACHE_TTL',
    'TRIPADVISOR_STATIC_CACHE_TTL',
    'TRIPADVISOR_REQUEST_TIMEOUT_MS',
    'TRIPADVISOR_DEBUG_LOG',
    'TRIPADVISOR_WS_PORT',
    'FETCHPROXY_WS_PORT',
    'FETCHPROXY_WS_HOST',
    'FETCHPROXY_IDENTITY_DIR',
  ];

  it('manifest.json wires each key through an optional user_config entry', () => {
    const m = readJson('manifest.json');
    const env: Record<string, string> = m.server.mcp_config.env;
    for (const key of KEYS) {
      const ref = /^\$\{user_config\.([^}]+)\}$/.exec(env[key] ?? '')?.[1];
      expect(ref, key).toBeDefined();
      expect(m.user_config[ref!]?.required, key).toBe(false);
    }
  });

  it('server.json declares each key as optional', () => {
    const vars = readJson('server.json').packages.flatMap(
      (p: { environmentVariables?: { name: string; isRequired?: boolean }[] }) => p.environmentVariables ?? [],
    );
    for (const key of KEYS) {
      expect(vars.find((v: { name: string }) => v.name === key)?.isRequired, key).toBe(false);
    }
  });
});
