/** Flattens anything throwable into a loggable string, keeping the stack when there is one. */
export function stringifyError(error: unknown): string {
  if (error instanceof Error) {
    return [error.name, error.message, error.stack].filter(Boolean).join('\n')
  }

  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}
