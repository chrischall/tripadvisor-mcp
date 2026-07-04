import { describe, it, expect, beforeAll } from 'vitest';
import { execSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, copyFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

// End-to-end boot guard. Spawns the REAL built artifacts and confirms they
// answer tools/list — exactly what an MCP host does at install time. Catches an
// eager-import crash in the bundle (no node_modules) and a wrong `bin` path.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = join(ROOT, 'dist', 'bundle.js');
const BIN = join(ROOT, 'dist', 'index.js');

beforeAll(() => {
  if (!existsSync(BUNDLE) || !existsSync(BIN)) {
    execSync('npm run build', { cwd: ROOT, stdio: 'ignore' });
  }
}, 120_000);

/** Spawn an MCP stdio server, run initialize + tools/list, return tool names. */
function listToolsViaStdio(entry: string, cwd: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [entry], {
      cwd,
      // No creds: the server must still boot and serve tools/list (deferred-config).
      env: { ...process.env, TRIPADVISOR_API_KEY: '' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`timed out; stderr:\n${err}`));
    }, 15_000);

    child.stdout.on('data', (d) => {
      out += d.toString();
      for (const line of out.split('\n')) {
        const t = line.trim();
        if (!t) continue;
        let msg: { id?: number; result?: { tools?: { name: string }[] } };
        try {
          msg = JSON.parse(t);
        } catch {
          continue;
        }
        if (msg.id === 1 && msg.result) {
          clearTimeout(timer);
          child.kill('SIGKILL');
          resolve((msg.result.tools ?? []).map((x) => x.name));
          return;
        }
      }
    });
    child.stderr.on('data', (d) => {
      err += d.toString();
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('exit', (code) => {
      if (code !== null && code !== 0) {
        clearTimeout(timer);
        reject(new Error(`exited ${code}; stderr:\n${err}`));
      }
    });

    child.stdin.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 0,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'boot-test', version: '0.0.0' },
        },
      }) + '\n',
    );
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) + '\n');
  });
}

describe('server boot', () => {
  it('the .mcpb bundle boots with NO node_modules and lists tools', async () => {
    // Replicate the .mcpb runtime: bundle.js + package.json in a bare dir.
    const dir = mkdtempSync(join(tmpdir(), 'ta-mcpb-'));
    try {
      copyFileSync(BUNDLE, join(dir, 'bundle.js'));
      copyFileSync(join(ROOT, 'package.json'), join(dir, 'package.json'));
      const tools = await listToolsViaStdio(join(dir, 'bundle.js'), dir);
      // >= not exact: PR CI runs merged with main; index.test.ts owns the exact roster.
      expect(tools.length).toBeGreaterThanOrEqual(5);
      expect(tools).toContain('ta_search_locations');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it('the npm bin entry (dist/index.js) boots with node_modules and lists tools', async () => {
    const tools = await listToolsViaStdio(BIN, ROOT);
    expect(tools.length).toBeGreaterThanOrEqual(5);
    expect(tools).toContain('ta_get_location_details');
  }, 60_000);
});
