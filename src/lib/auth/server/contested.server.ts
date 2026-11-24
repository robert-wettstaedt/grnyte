import { getRequestEvent } from '$app/server'
import { CONTESTED_SIGNUP, isContested } from '$lib/auth'
import { db } from '$lib/db/db.server'
import { supabaseAdmin } from '$lib/db/supabaseAdmin.server'
import { formError } from '$lib/forms/schemas'
import { DAY_MS } from '$lib/i18n/relativeTime'
import { logServerFailure } from '$lib/logging/failure.server'
import { refuseCommand } from '$lib/remote/authed.server'
import type { Session, User } from '@supabase/supabase-js'
import { eq, sql } from 'drizzle-orm'
import { authUsers } from 'drizzle-orm/supabase'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { supabaseAuthServer } from './authServer.server'
import { labelledKey } from './keys.server'

/** GoTrue stores addresses lowercased, so a mixed-case entry must still find its account. */
export async function findAccount(
  email: string,
): Promise<undefined | { confirmed: boolean; email: string; id: string }> {
  const [row] = await db
    .select({ confirmedAt: authUsers.emailConfirmedAt, email: authUsers.email, id: authUsers.id })
    .from(authUsers)
    .where(eq(authUsers.email, sql`lower(${email})`))
    .limit(1)
  return row == null ? undefined : { confirmed: row.confirmedAt != null, email: row.email ?? email, id: row.id }
}

/** As long as an unconfirmed account lives (`UNCONFIRMED_MAX_AGE_MS`). */
const RESEND_TOKEN_MS = 7 * DAY_MS

const resendMac = (email: string, exp: number) =>
  createHmac('sha256', labelledKey('signup-resend'))
    .update(`signup-resend|${email.toLowerCase()}|${exp}`)
    .digest('base64url')

export function checkResendToken(email: string, token: string | undefined, now = Date.now()): boolean {
  const [expText = '', mac = ''] = token?.split('.') ?? []
  const exp = Number(expText)
  if (!Number.isSafeInteger(exp) || exp < now) return false
  const expected = Buffer.from(resendMac(email, exp))
  const given = Buffer.from(mac)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

/**
 * After a code confirmed an address on this session: a contested account's password is replaced,
 * then its owner picks one (`choosePassword`) or, when that failed, goes through reset.
 */
export async function contestedNext(
  supabase: App.Locals['supabase'],
  user: { app_metadata: Record<string, unknown>; email?: string; id: string },
): Promise<'choosePassword' | 'forgotPassword' | null> {
  if (!isContested(user.app_metadata)) return null
  return (await revokeContestedPassword(supabase, user)) ? 'choosePassword' : 'forgotPassword'
}

/**
 * Before re-mailing an unconfirmed account: its password may be a stranger's, so the code step replaces it.
 * False when the flag did not land; the caller then sends nothing, since confirming would keep that password.
 */
export async function flagContestedSignup(authUserId: string): Promise<boolean> {
  const { error } = await supabaseAdmin().auth.admin.updateUserById(authUserId, {
    app_metadata: { [CONTESTED_SIGNUP]: true },
  })
  if (error != null) {
    await logServerFailure('signup-contested', `flag failed for ${authUserId}: ${error.code ?? error.message}`)
  }
  return error == null
}

/**
 * Holds a code's session on the request's client (the cookie client, or the app path's in-memory
 * one), then `contestedNext`; the session it ends with, none when the owner must go through reset.
 */
export async function holdCodeSession<Next extends string>(
  { session, user }: { session: null | Session; user: null | User },
  otherwise: Next,
) {
  if (session == null || user == null) return refuseCommand(formError('auth_unexpectedError'), 'code')
  const client = getRequestEvent().locals.supabase
  await client.auth.setSession(session)
  const next = (await contestedNext(client, user)) ?? otherwise
  const held = next === 'forgotPassword' ? null : (await client.auth.getSession()).data.session
  return { next, session: held }
}

/** Tokens minted before this still carry the flag; the caller refreshes. */
export const clearContestedFlag = (authUserId: string) =>
  supabaseAdmin().auth.admin.updateUserById(authUserId, { app_metadata: { [CONTESTED_SIGNUP]: null } })

/** Lets the person who just signed up re-send their code without the resend flagging the account. */
export function issueResendToken(email: string, now = Date.now()): string {
  const exp = now + RESEND_TOKEN_MS
  return `${exp}.${resendMac(email, exp)}`
}

/**
 * Swaps a contested account's password for one nobody knows by an admin change, which mails no
 * password notice but ends every session, then holds a new code session for the owner on `supabase`.
 * False when that session could not be held; the owner then goes through recovery.
 */
export async function revokeContestedPassword(
  supabase: App.Locals['supabase'],
  user: { email?: string; id: string },
): Promise<boolean> {
  const failed = async (error: { code?: string; message: string }) => {
    await logServerFailure('signup-contested', `revoke step failed: ${error.code ?? error.message}`)
    return false
  }
  const admin = supabaseAdmin().auth.admin

  // Every character class, whatever GoTrue's password policy asks for.
  const password = `${randomBytes(32).toString('base64url')}aA1!`
  const revoked = await admin.updateUserById(user.id, { app_metadata: { [CONTESTED_SIGNUP]: null }, password })
  if (revoked.error != null) return failed(revoked.error)
  if (user.email == null) return failed({ message: 'no address to mint a code for' })

  // An unmailed code, verified at once: `setNewPassword` takes only a fresh code session.
  const link = await admin.generateLink({ email: user.email, type: 'magiclink' })
  const token = link.data.properties?.email_otp
  if (link.error != null || token == null) return failed(link.error ?? { message: 'no code in the link' })
  const verified = await supabaseAuthServer(getRequestEvent()).verifyOtp({ email: user.email, token, type: 'email' })
  if (verified.error != null || verified.data.session == null) {
    return failed(verified.error ?? { message: 'no session from the code' })
  }
  const held = await supabase.auth.setSession(verified.data.session)
  if (held.error != null) {
    await endSession(verified.data.session)
    return failed(held.error)
  }
  return true
}

/** Ends a GoTrue session nobody holds. */
export const endSession = (session: { access_token: string }) =>
  supabaseAdmin().auth.admin.signOut(session.access_token, 'local')
