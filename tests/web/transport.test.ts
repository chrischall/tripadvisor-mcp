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
});
