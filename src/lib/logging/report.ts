import { isOnline } from '$lib/state/online.svelte'
import { MAX_ERROR_LENGTH, stringifyError } from './stringify'

/** Backstop for a loop whose message varies each turn, which no dedupe can collapse. */
const MAX_REPORTS = 20

/** Payloads already sent this page load. Keyed on the payload, which is what `listErrorLogs` groups by. */
const reported = new Set<string>()

/**
 * Best-effort client-error reporter: logs to the console and persists to
 * `clientErrorLogs`. Never throws: a failing report must not cascade into the
 * same handlers (boundary / window listeners) that called it.
 *
 * `scope` prefixes the message `[scope]`, the same shape `logServerFailure` writes, so a client
 * row and a server one read alike on the errors page.
 *
 * Each distinct error is sent once per page load, capped at {@link MAX_REPORTS}. Without that,
 * an error thrown out of a Svelte flush loops: `logClientError` bumps the `pending_count` that
 * Kit's command runtime keeps per command, that counter is `$state`, so the report schedules
 * another flush which throws again into the `window.error` listener in `hooks.client.ts`. It
 * spins with no network at all, and reached `rateLimit`'s 429 for the whole origin in a second.
 */
export function reportClientError(error: unknown, scope?: string): void {
  console.error(error)

  const payload = `${scope == null ? '' : `[${scope}] `}${stringifyError(error)}`.slice(0, MAX_ERROR_LENGTH)

  if (reported.has(payload) || reported.size >= MAX_REPORTS) {
    return
  }

  // Marked BEFORE the await, so a loop firing the same error cannot queue a second send while the
  // first import is still in flight. Undone below if the module never arrives.
  reported.add(payload)

  try {
    // Imported here, not at the top: a static edge to a `.remote.ts` reaches `$app/server`, and
    // `notifyError` puts this module in the graph of everything that toasts.
    import('./errors.remote')
      .catch((cause: unknown) => {
        // The chunk itself failed (a 404 after a deploy), so nothing was sent and this stays
        // retryable. A failing SEND is not undone: retrying that is what the storm cap exists for.
        reported.delete(payload)
        throw cause
      })
      .then(({ logClientError }) => {
        return logClientError({
          error: payload,
          navigator: {
            language: navigator.language,
            onLine: navigator.onLine,
            userAgent: navigator.userAgent,
          },
          pathname: location.pathname,
        })
      })
      .catch(() => {})
  } catch {
    // reporting is best-effort; swallow everything
  }
}

/**
 * {@link reportClientError}, unless the app cannot reach anything.
 *
 * For a background call nobody is watching: offline it failed because the network said no, and a
 * PWA opened at a crag would write one of those every load.
 */
export function reportIfOnline(error: unknown): void {
  if (isOnline()) {
    reportClientError(error)
  }
}
