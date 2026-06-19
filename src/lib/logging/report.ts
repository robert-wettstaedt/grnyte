import { logClientError } from './clientError.remote'

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
      pathname: location.pathname,
      navigator: {
        userAgent: navigator.userAgent,
        language: navigator.language,
        onLine: navigator.onLine,
      },
    }).catch(() => {})
  } catch {
    // reporting is best-effort; swallow everything
  }
}

function stringifyError(error: unknown): string {
  if (error instanceof Error) {
    return [error.name, error.message, error.stack].filter(Boolean).join('\n')
  }

  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}
