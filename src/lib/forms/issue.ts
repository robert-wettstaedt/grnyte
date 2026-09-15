import { hasMessage, resolveMessage } from '$lib/i18n/message'
import { m } from '$lib/paraglide/messages'

/**
 * The same thing for a rejected command. `error(4xx, formError(...))` puts the key on
 * SvelteKit's `HttpError.body.message`; anything else (a network drop, a 500) has no key to
 * resolve, so `fallback` decides. Pass one where the generic copy is not the best answer: the
 * upload manager reads a TUS `Error.message` there. It is the only place that knows the
 * `HttpError` shape, so a change to Kit's envelope lands in one file.
 */
export function resolveErrorMessage(cause: unknown, fallback: () => string = m.error_generic_title): string {
  const raw = (cause as null | { body?: { message?: string } })?.body?.message
  return raw == null ? fallback() : resolveIssueMessage(raw)
}

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
    // not JSON, treat the raw string as the key
  }

  // A key nothing compiled shows as itself: the server can emit a plain sentence too.
  return hasMessage(key) ? resolveMessage(key, params) : key
}
