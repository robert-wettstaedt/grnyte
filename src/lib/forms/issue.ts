import { resolveMessage } from '$lib/i18n/message'
import { m } from '$lib/paraglide/messages'

/**
 * The same thing for a rejected command. `error(4xx, formError(...))` puts the key on
 * SvelteKit's `HttpError.body.message`; anything else (a network drop, a 500) has no key to
 * resolve, so it falls back to the generic copy.
 */
export function resolveErrorMessage(cause: unknown): string {
  const raw = (cause as null | { body?: { message?: string } })?.body?.message
  return raw == null ? m.error_generic_title() : resolveIssueMessage(raw)
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
    // not JSON — treat the raw string as the key
  }

  return resolveMessage(key, params) // unknown key falls back to the raw string
}
