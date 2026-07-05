import { parseBoolEnv, readEnvVar, readPortEnv } from '@chrischall/mcp-utils';

// The whole fetchproxy fleet shares ONE concentrator port — the Transporter
// extension dials it, and servers host/peer-elect on it. Never default to a
// "unique" port; override only for test isolation.
const DEFAULT_WS_PORT = 37_149;

/** Bridge concentrator port. Override with TRIPADVISOR_WS_PORT (tests only). */
export function getWsPort(): number {
  return readPortEnv('TRIPADVISOR_WS_PORT', DEFAULT_WS_PORT);
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
