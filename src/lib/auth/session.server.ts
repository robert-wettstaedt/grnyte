import { getRequestEvent } from '$app/server'
import type { VerifiedClaims } from '$lib/auth'
import { db } from '$lib/db/db.server'
import { formError } from '$lib/forms/schemas'
import { refuseCommand } from '$lib/remote/authed.server'
import { error } from '@sveltejs/kit'
import { sql } from 'drizzle-orm'
import { supabaseAuthServerAs, type AuthServerAs } from './authServer.server'
import { gotrueRefusal } from './mail.server'

type Reader = Pick<typeof db, 'execute'>

/** GoTrue as the signed-in caller, the one user-scoped client on both transports. */
export function callerAuthServer(): AuthServerAs {
  const event = getRequestEvent()
  if (event.locals.verifiedToken == null) error(401, formError('auth_notSignedIn'))
  return supabaseAuthServerAs(event, event.locals.verifiedToken)
}

/** Live while GoTrue still holds the session row; no age limit. A failed read throws, never `false`. */
export async function isSessionLive(handle: Reader, claims: { session_id?: string; sub: string }): Promise<boolean> {
  if (claims.session_id == null) return false
  const rows = await handle.execute(
    sql`select 1 from auth.sessions where id = ${claims.session_id} and user_id = ${claims.sub}`,
  )
  return rows.length > 0
}

/**
 * The gate for writes and account actions: a revoked session is refused `auth_sessionEnded` (its
 * cookies cleared); an outage or a failed read is a 503 that signs nothing out.
 */
export async function requireLiveSession(): Promise<VerifiedClaims> {
  const { backendUnavailable, claims, supabase } = getRequestEvent().locals
  if (backendUnavailable) error(503, formError('auth_serviceUnavailable'))
  if (claims == null) error(401, formError('auth_notSignedIn'))

  let live: boolean
  try {
    live = await isSessionLive(db, claims)
  } catch (cause) {
    console.error('[session] liveness read failed', cause)
    error(503, formError('auth_serviceUnavailable'))
  }
  if (!live) {
    await supabase.auth.signOut({ scope: 'local' })
    error(401, formError('auth_sessionEnded'))
  }
  return claims
}

/** Ends every other session of the account. No re-authentication: GoTrue lets any live session do this. */
export async function signOutOthers() {
  await requireLiveSession()
  const { error: signOutError } = await callerAuthServer().signOut({ scope: 'others' })
  if (signOutError != null) refuseCommand(await gotrueRefusal(signOutError, 'logout'))
}
