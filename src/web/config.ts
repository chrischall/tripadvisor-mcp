import { parseBoolEnv, readEnvVar, readPortEnv } from '@chrischall/mcp-utils';

// The whole fetchproxy fleet shares ONE concentrator port — the ContextMint
// Bridge extension dials it, and servers host/peer-elect on it. Never default to a
// "unique" port. With no override we pass NO port, so @fetchproxy/server resolves
// it the fleet way (`FETCHPROXY_WS_PORT`, else 37149) and a fleet-wide move of the
// concentrator reaches this server too.

/**
 * Bridge concentrator port override from TRIPADVISOR_WS_PORT (tests only), or
 * `undefined` to let fetchproxy apply FETCHPROXY_WS_PORT / its 37149 default.
 */
export function getWsPort(): number | undefined {
  // 0 is outside readPortEnv's valid range, so it can only mean "no override".
  const port = readPortEnv('TRIPADVISOR_WS_PORT', 0);
  return port === 0 ? undefined : port;
}

// Comfortably above tripadvisor.com's typical latency but low enough that a
// stuck upstream (or a DataDome challenge that never resolves) fails fast.
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

/** Per-request bridge timeout. Override with TRIPADVISOR_REQUEST_TIMEOUT_MS. */
export function getRequestTimeoutMs(): number {
  const raw = readEnvVar('TRIPADVISOR_REQUEST_TIMEOUT_MS');
  const ms = Number(raw);
  return Number.isFinite(ms) && ms > 0 ? ms : DEFAULT_REQUEST_TIMEOUT_MS;
}

/** Per-request bridge debug logging (stderr). Set TRIPADVISOR_DEBUG_LOG=1. */
export function debugLogEnabled(): boolean {
  return parseBoolEnv('TRIPADVISOR_DEBUG_LOG');
}
