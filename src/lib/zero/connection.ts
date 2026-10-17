import type { ConnectionState } from '@rocicorp/zero'

export type ConnectionName = ConnectionState['name']

/** States Zero does not retry out of: only a fresh client (a reload, with a fresh token) recovers. */
const TERMINAL: readonly ConnectionName[] = ['closed', 'error', 'needs-auth']

export function isTerminal(name: ConnectionName): boolean {
  return TERMINAL.includes(name)
}

/**
 * How long a reconnect may take before anything reacts. Zero retries every five seconds and flaps
 * through `connecting` on token refresh and tab wake; the status bar and the offline flag share it.
 */
export const RECONNECT_HOLD_MS = 10_000
