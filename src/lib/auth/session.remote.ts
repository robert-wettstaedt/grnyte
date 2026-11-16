import { resolve } from '$app/paths'
import { command, form, getRequestEvent, query } from '$app/server'
import { isSameOriginPath } from '$lib/auth'
import { supabaseAuthServer } from '$lib/auth/authServer.server'
import { clearCodeTries } from '$lib/auth/codeAttempts.server'
import { gotrueRefusal, mailPasswordReset } from '$lib/auth/mail.server'
import { requireLiveSession } from '$lib/auth/session.server'
import { db } from '$lib/db/db.server'
import { formError } from '$lib/forms/schemas'
import * as z from '$lib/forms/zod'
import { refuseCommand } from '$lib/remote/authed.server'
import { error, redirect } from '@sveltejs/kit'
import { sql } from 'drizzle-orm'

/**
 * A same-origin path to come back to after signing out. Validated rather than trusted: this value
 * arrives in a form body, and an unchecked one turns this into an open redirect. See
 * {@link isSameOriginPath} for why that check is not a `startsWith`.
 */
const returnPath = z._default(
  z.string().check(z.refine(isSameOriginPath, 'must be a same-origin path')),
  resolve('/(landing)/auth'),
)

/**
 * Sign out and land on `redirectTo`.
 *
 * Server-side, so the landing group does not have to ship a Supabase client for one button, and
 * shared because two screens need it for the same reason: the person reading them is signed in as
 * the wrong account. The invitation screen comes back to its own token URL (without that the
 * invitee lands on a tokenless page reading as invalid); the region-create screen has no chrome
 * of its own, so this is its only way out.
 */
export const signOut = form(z.object({ redirectTo: returnPath }), async ({ redirectTo }) => {
  const {
    locals: { supabase },
  } = getRequestEvent()

  // ponytail: this path cannot release the browser's push subscription (it is a server form, and
  // the endpoint only exists client-side). The next sign-in on this browser takes the row over,
  // which is what `subscribeToPush`'s endpoint delete is for. Upgrade = make this a client action
  // if a shared-device leak is ever reported.
  await supabase.auth.signOut()

  redirect(303, redirectTo)
})

/** Ends every other session of the account. No re-authentication: GoTrue lets any live session do this. */
export const signOutOthers = command(async () => {
  await requireLiveSession()
  const { error: signOutError } = await getRequestEvent().locals.supabase.auth.signOut({ scope: 'others' })
  if (signOutError != null) refuseCommand(await gotrueRefusal(signOutError, 'logout'))
})

/** The caller's own signed-in devices, most recently active first. Never the IP or the user agent. */
export const signedInDevices = query(async () => {
  const { session_id: current, sub } = await requireLiveSession()
  // GoTrue v2.197.0 has both `refreshed_at` (timestamp, UTC) and `updated_at`.
  const rows = await db.execute<{ activeAt: Date; id: string; signedInAt: Date }>(sql`
    select id, created_at as "signedInAt",
      coalesce(refreshed_at at time zone 'UTC', updated_at, created_at) as "activeAt"
    from auth.sessions where user_id = ${sub} order by 3 desc`)
  return rows.map(({ activeAt, id, signedInAt }) => ({ activeAt, current: id === current, id, signedInAt }))
})

/** Ends one of the caller's other sessions; another account's or the calling one is never touched. */
export const signOutDevice = command(z.object({ id: z.uuid() }), async ({ id }) => {
  const { session_id: current, sub } = await requireLiveSession()
  if (id === current) refuseCommand(formError('form_noPermission'))
  await db.execute(sql`delete from auth.sessions where id = ${id} and user_id = ${sub} and id <> ${current ?? null}`)
})

export const sendPasswordReset = command(async () => {
  const claims = await requireLiveSession()
  const event = getRequestEvent()

  if (claims.email == null) {
    error(401, formError('auth_notSignedIn'))
  }

  const { error: resetError } = await mailPasswordReset(supabaseAuthServer(event), claims.email)
  if (resetError != null) {
    refuseCommand(await gotrueRefusal(resetError, 'recover'))
  }
  await clearCodeTries(claims.email, ['recovery'])

  return { email: claims.email }
})
