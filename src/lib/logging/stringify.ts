/** The cap every writer of `clientErrorLogs.error` slices to. Ours, not the column's: `text` is
 *  unbounded, so without it one runaway stack or HTML error page fills the table. */
export const MAX_ERROR_LENGTH = 10_000

/** Deep enough for drizzle's wrapper plus the driver error under it; bounded because a `cause`
 *  chain can be cyclic. */
const MAX_CAUSE_DEPTH = 4

/** Flattens anything throwable into a loggable string, keeping the stack when there is one. */
export function stringifyError(error: unknown, depth = 0): string {
  if (error instanceof Error) {
    // Without the cause a drizzle `DrizzleQueryError` logs only "Failed query: <sql>", and the
    // driver error naming the actual failure (SQLSTATE, CONNECTION_CLOSED, CONNECT_TIMEOUT) is lost.
    const code = 'code' in error && (typeof error.code === 'string' || typeof error.code === 'number') ? error.code : ''
    const cause =
      error.cause != null && depth < MAX_CAUSE_DEPTH ? `Caused by: ${stringifyError(error.cause, depth + 1)}` : ''

    return [error.name, code === '' ? '' : `code: ${code}`, error.message, error.stack, cause]
      .filter(Boolean)
      .join('\n')
  }

  // Never serialised. A thrown object can carry a request body, an entity mid-edit or a route's
  // coordinates, and an error log is not where any of that belongs; its shape identifies the throw
  // site well enough. Objects only: a thrown primitive is kept whole below, because its content IS
  // its identity and redacting it would leave nothing to diagnose.
  if (error !== null && typeof error === 'object') {
    const keys = Object.keys(error)
    return `${error.constructor?.name ?? 'Object'} thrown${keys.length === 0 ? '' : ` with keys: ${keys.join(', ')}`}`
  }

  return `${typeof error} thrown: ${String(error)}`
}
