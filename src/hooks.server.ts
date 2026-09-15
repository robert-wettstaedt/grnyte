import { db } from '$lib/db/db.server'
import { clientErrorLogs } from '$lib/db/schema'
import { authGuard, supabase } from '$lib/hooks/auth.server'
import { handle as paraglide } from '$lib/hooks/paraglide.server'
import { rateLimit } from '$lib/hooks/rate-limit.server'
import { stringifyError } from '$lib/logging/stringify'
import { type Handle, type HandleServerError } from '@sveltejs/kit'
import { sequence } from '@sveltejs/kit/hooks'

export const handle: Handle = sequence(rateLimit, paraglide, supabase, authGuard)

// Unexpected errors while responding to a request. Vercel keeps its own logs for an
// hour only, so persist ours. Awaited rather than fire-and-forget: the serverless
// function can be frozen the moment the response is sent.
export const handleError: HandleServerError = async ({ error, event, status }) => {
  console.error(error)

  // Missing routes land here too, and are noise rather than incidents.
  if (status !== 404) {
    await db
      .insert(clientErrorLogs)
      .values({
        createdBy: event.locals.user?.id ?? null,
        error: stringifyError(error).slice(0, 10_000),
        pathname: event.url.pathname,
        source: 'server',
      })
      // best-effort: a failing log must not mask the error it is reporting
      .catch(() => {})
  }

  return { message: 'Something went wrong' }
}
