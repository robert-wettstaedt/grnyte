/** The cap every writer of `clientErrorLogs.error` slices to. Ours, not the column's: `text` is
 *  unbounded, so without it one runaway stack or HTML error page fills the table. */
export const MAX_ERROR_LENGTH = 10_000

/** Flattens anything throwable into a loggable string, keeping the stack when there is one. */
export function stringifyError(error: unknown): string {
  if (error instanceof Error) {
    return [error.name, error.message, error.stack].filter(Boolean).join('\n')
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
