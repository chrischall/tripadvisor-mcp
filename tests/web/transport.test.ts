import { describe, it, expect, vi, afterEach } from 'vitest';
import { createTripAdvisorTransport } from '../../src/web/transport.js';
import type { FetchproxyServer, FetchproxyServerOpts } from '@chrischall/mcp-utils/fetchproxy';

describe('createTripAdvisorTransport', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function capturePort(): number | undefined {
    let captured: FetchproxyServerOpts | undefined;
    createTripAdvisorTransport((opts: FetchproxyServerOpts) => {
      captured = opts;
      return { listen: () => {} } as unknown as FetchproxyServer;
    });
    return captured!.port;
  }

  it('leaves the port to fetchproxy (FETCHPROXY_WS_PORT, else 37149) when TRIPADVISOR_WS_PORT is unset', () => {
    vi.stubEnv('TRIPADVISOR_WS_PORT', undefined);
    // No explicit port: @fetchproxy/server resolves `opts.port ?? FETCHPROXY_WS_PORT ?? 37149`,
    // so a fleet-wide FETCHPROXY_WS_PORT move reaches this server too.
    expect(capturePort()).toBeUndefined();
  });

  it('passes TRIPADVISOR_WS_PORT through as an explicit port override', () => {
    vi.stubEnv('TRIPADVISOR_WS_PORT', '40123');
    expect(capturePort()).toBe(40123);
  });

  it('ignores an invalid TRIPADVISOR_WS_PORT', () => {
    vi.stubEnv('TRIPADVISOR_WS_PORT', 'nope');
    expect(capturePort()).toBeUndefined();
  });

  it('pins the fleet domain, server name, and fetch capability', () => {
    let captured: FetchproxyServerOpts | undefined;
    const createServer = vi.fn((opts: FetchproxyServerOpts) => {
      captured = opts;
      return { listen: () => {} } as unknown as FetchproxyServer;
    });
    createTripAdvisorTransport(createServer);
    expect(captured).toBeDefined();
    expect(captured!.domains).toEqual(['tripadvisor.com']);
    expect(captured!.serverName).toBe('tripadvisor-mcp');
    expect(captured!.capabilities).toContain('fetch');
  });

  it("applies defaultSubdomain 'www' to every request", async () => {
    // defaultSubdomain is a transport-adapter concern (applied per call), not a
    // FetchproxyServer-constructor option — so it's asserted behaviorally: drive
    // fetch() and inspect the subdomain the underlying server.request receives.
    const request = vi.fn(async () => ({ status: 200, body: 'ok', url: 'https://www.tripadvisor.com/' }));
    const createServer = () => ({ request } as unknown as FetchproxyServer);
    const transport = createTripAdvisorTransport(createServer);
    await transport.fetch({ method: 'GET', path: '/', headers: {} });
    expect(request).toHaveBeenCalledWith('GET', '/', expect.objectContaining({ subdomain: 'www' }));
  });
});
