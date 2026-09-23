import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p: string) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

// The Claude Code plugin installs from the git repo (marketplace source "./"),
// so the checkout has no build output and no node_modules. Its MCP server must
// launch the published npm package, never a gitignored local path.
describe('Claude Code plugin .mcp.json', () => {
  const pkg = readJson('package.json');
  const plugin = readJson('.claude-plugin/plugin.json');
  const mcp = readJson(plugin.mcp);
  const gitignored = readFileSync(join(ROOT, '.gitignore'), 'utf8')
    .split('\n')
    .map((l) => l.trim().replace(/\/$/, ''))
    .filter(Boolean);

  it('launches the published package via npx', () => {
    const servers = Object.values(mcp.mcpServers) as { command: string; args: string[] }[];
    expect(servers.length).toBeGreaterThan(0);
    for (const s of servers) {
      expect(s.command).toBe('npx');
      expect(s.args).toEqual(['-y', pkg.name]);
    }
  });

  it('references no gitignored path (dist/, node_modules/) that a git install lacks', () => {
    const text = JSON.stringify(mcp);
    for (const dir of gitignored.filter((g) => !g.includes('*') && !g.startsWith('.'))) {
      expect(text).not.toContain(`/${dir}/`);
    }
  });
});
