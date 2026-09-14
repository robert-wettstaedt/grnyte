/**
 * Whether a failed submit shows the offline state rather than rethrowing.
 *
 * Kit rethrows fetch's own `TypeError` for a dead network and an `HttpError` for any real response.
 * Matched on the type because the message differs per engine.
 */
export function isOfflineFailure(error: unknown, online: boolean): boolean {
  return error instanceof TypeError || !online
}
