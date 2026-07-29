import { logClientError } from './errors.remote'
import { stringifyError } from './stringify'

/**
 * Best-effort client-error reporter: logs to the console and persists to
 * `clientErrorLogs`. Never throws — a failing report must not cascade into the
 * very handlers (boundary / window listeners) that called it.
 */
export function reportClientError(error: unknown): void {
  console.error(error)

  try {
    logClientError({
      error: stringifyError(error).slice(0, 10_000),
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
