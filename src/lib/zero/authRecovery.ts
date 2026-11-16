import type { ConnectionName } from './connection'

/** Long enough that a dead refresh family is not hammered, which is what revokes it. */
export const AUTH_RETRY_COOLDOWN_MS = 30_000

/** A refresh GoTrue refused because the refresh token or its session is gone, not a passing failure. */
export const SESSION_GONE = Symbol('session gone')

const GONE_CODES = new Set([
  'invalid_grant',
  'refresh_token_already_used',
  'refresh_token_not_found',
  'session_not_found',
])

/** Whether a refresh error proves the session is gone; offline, 5xx, 429 and timeouts prove nothing. */
export const isDefinitiveRefusal = (error: { code?: string }): boolean => GONE_CODES.has(error.code ?? '')

interface Attempt<Session> {
  onSession: (session: Session) => void
  /** `null` for any retryable failure, thrown ones included; {@link SESSION_GONE} for a definitive one. */
  refresh: () => Promise<null | Session | typeof SESSION_GONE>
  /** The cookie session when it is newer than the one Zero was refused with, else `null`. */
  reread: () => Promise<null | Session>
  signOut: () => void
  /** Asked when the token ARRIVES, so a sign-out mid-refresh cannot hand on the old user's token. */
  wants: (session: Session) => boolean
}

/**
 * How long to wait before asking for a fresh token, or `null` when this state does not want one.
 *
 * A delay rather than a yes/no: the caller rebuilds this watcher on every connection change, so
 * refusing inside the cooldown leaves nothing armed at all.
 */
export function authRetryDelay(connection: ConnectionName, lastAttemptAt: number, now: number): null | number {
  if (connection !== 'needs-auth') {
    return null
  }

  return Math.max(0, AUTH_RETRY_COOLDOWN_MS - (now - lastAttemptAt))
}

let generation = 0
let timer: null | ReturnType<typeof setTimeout> = null
let attemptedAt = 0

/** When the last attempt started, for {@link authRetryDelay}. */
export function lastAuthAttemptAt(): number {
  return attemptedAt
}

/**
 * Ask for a fresh token after `delay`, then every {@link AUTH_RETRY_COOLDOWN_MS} until one arrives.
 *
 * Lives here rather than in the effect that drives it because an attempt is not cancellable across
 * its own `await`, and only a generation can stop a resolving one from arming a chain nobody owns.
 */
export function startAuthRecovery<Session>(delay: number, attempt: Attempt<Session>): void {
  const mine = generation

  const run = async () => {
    timer = null
    attemptedAt = Date.now()

    let session = await attempt.refresh()

    // Another tab may hold a newer session (it changed the password); only without one is this a sign-out.
    if (session === SESSION_GONE) {
      session = await attempt.reread()
      if (session == null) {
        attempt.signOut()
        return
      }
    }

    if (session != null) {
      if (attempt.wants(session)) {
        attempt.onSession(session)
      }

      return
    }

    if (mine !== generation) {
      return
    }

    timer = setTimeout(() => void run(), AUTH_RETRY_COOLDOWN_MS)
  }

  clearTimeout(timer ?? undefined)
  timer = setTimeout(() => void run(), delay)
}

/** Stops the chain, including one already awaiting the network. */
export function stopAuthRecovery(): void {
  generation += 1

  if (timer != null) {
    clearTimeout(timer)
    timer = null
  }
}
