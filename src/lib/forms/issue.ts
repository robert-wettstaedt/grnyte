import { m } from '$lib/paraglide/messages'

/**
 * The server emits a paraglide message key (optionally JSON-wrapped with params, via `formError`)
 * as the zod/issue message; the locale is only known on the client, so we resolve it here.
 */
export function resolveIssueMessage(message: string): string {
  let key = message
  let params: Record<string, unknown> | undefined

  try {
    const parsed = JSON.parse(message)
    if (parsed?.message) {
      key = parsed.message
      params = parsed.params
    }
  } catch {
    // not JSON — treat the raw string as the key
  }

  const fn = (m as unknown as Record<string, (i?: Record<string, unknown>) => string>)[key]
  return fn ? fn(params) : key // ponytail: unknown key falls back to the raw string
}
