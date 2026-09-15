import { logClientError } from './errors.remote'
import { stringifyError } from './stringify'

const MAX_ERROR_LENGTH = 10_000

/** Backstop for a loop whose message varies each turn, which no dedupe can collapse. */
const MAX_REPORTS = 20

/** Payloads already sent this page load. Keyed on the payload, which is what `listErrorLogs` groups by. */
const reported = new Set<string>()

/**
 * Best-effort client-error reporter: logs to the console and persists to
 * `clientErrorLogs`. Never throws: a failing report must not cascade into the
 * same handlers (boundary / window listeners) that called it.
 *
 * Each distinct error is sent once per page load, capped at {@link MAX_REPORTS}. Without that,
 * an error thrown out of a Svelte flush loops: `logClientError` bumps the `pending_count` that
 * Kit's command runtime keeps per command, that counter is `$state`, so the report schedules
 * another flush which throws again into the `window.error` listener in `hooks.client.ts`. It
 * spins with no network at all, and reached `rateLimit`'s 429 for the whole origin in a second.
 */
export function reportClientError(error: unknown): void {
  console.error(error)

  const payload = stringifyError(error).slice(0, MAX_ERROR_LENGTH)

  if (reported.has(payload) || reported.size >= MAX_REPORTS) {
    return
  }

  reported.add(payload)

  try {
    logClientError({
      error: payload,
      navigator: {
        language: navigator.language,
        onLine: navigator.onLine,
        userAgent: navigator.userAgent,
      },
      pathname: location.pathname,
    }).catch(() => {})
  } catch {
    // reporting is best-effort; swallow everything
  }
}
