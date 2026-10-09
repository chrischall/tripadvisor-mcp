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
