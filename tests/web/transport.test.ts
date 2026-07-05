import { describe, it, expect, vi } from 'vitest';
import { createTripAdvisorTransport } from '../../src/web/transport.js';
import type { FetchproxyServer, FetchproxyServerOpts } from '@chrischall/mcp-utils/fetchproxy';

describe('createTripAdvisorTransport', () => {
  it('pins the fleet port, domain, and www subdomain', () => {
    let captured: FetchproxyServerOpts | undefined;
    const createServer = vi.fn((opts: FetchproxyServerOpts) => {
      captured = opts;
      return { listen: () => {} } as unknown as FetchproxyServer;
    });
    createTripAdvisorTransport(createServer);
    expect(captured).toBeDefined();
    // The whole fetchproxy fleet shares ONE concentrator port.
    expect(captured!.port).toBe(37_149);
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
