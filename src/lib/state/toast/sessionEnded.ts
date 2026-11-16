import { resolve } from '$app/paths'
import { serverMessage } from '$lib/forms/issue'
import { formError } from '$lib/forms/schemas'

const SESSION_ENDED = formError('auth_sessionEnded')

/** A refusal saying this device was signed out elsewhere: wipe and leave for `/` instead of showing it. */
export function leaveIfSessionEnded(cause: unknown): boolean {
  if (serverMessage(cause) !== SESSION_ENDED) return false
  // The server already cleared the cookies, so no browser Supabase client is needed (landing pages have none).
  // Lazy so importing toast does not load the Zero/env chain behind wipe; a failed chunk still leaves.
  const to = resolve('/')
  void import('../pwa/wipe').then(
    ({ wipeAndLeave }) => wipeAndLeave(to),
    () => location.replace(to),
  )
  return true
}
