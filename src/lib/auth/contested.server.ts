import { CONTESTED_SIGNUP, isContested } from '$lib/auth'
import { db } from '$lib/db/db.server'
import { supabaseAdmin } from '$lib/db/supabaseAdmin.server'
import { logServerFailure } from '$lib/logging/failure.server'
import { eq, sql } from 'drizzle-orm'
import { authUsers } from 'drizzle-orm/supabase'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
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
const RESEND_TOKEN_MS = 7 * 24 * 60 * 60 * 1000

const resendMac = (email: string, exp: number) =>
  createHmac('sha256', labelledKey('signup-resend'))
    .update(`signup-resend|${email.toLowerCase()}|${exp}`)
    .digest('base64url')

/** Whether `token` was issued for this address and has not expired. */
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
  user: { app_metadata: Record<string, unknown>; id: string },
): Promise<'choosePassword' | 'forgotPassword' | null> {
  if (!isContested(user.app_metadata)) return null
  return (await revokeContestedPassword(supabase, user.id)) ? 'choosePassword' : 'forgotPassword'
}

/**
 * Before re-mailing an unconfirmed account: its password may be a stranger's, so `/auth/confirm` replaces it.
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

/** Lets the person who just signed up re-send their code without the resend flagging the account. */
export function issueResendToken(email: string, now = Date.now()): string {
  const exp = now + RESEND_TOKEN_MS
  return `${exp}.${resendMac(email, exp)}`
}

/**
 * Swaps a contested account's password for one nobody knows, via the session (an admin change ends it).
 * True only if the session survived with the flag cleared; otherwise the recovery link retries.
 */
export async function revokeContestedPassword(supabase: App.Locals['supabase'], authUserId: string): Promise<boolean> {
  // Every character class, whatever GoTrue's password policy asks for.
  const password = () => `${randomBytes(32).toString('base64url')}aA1!`
  const clearFlag = () =>
    supabaseAdmin().auth.admin.updateUserById(authUserId, { app_metadata: { [CONTESTED_SIGNUP]: null } })
  const failed = async (error: { code?: string; message: string }) => {
    await logServerFailure('signup-contested', `revoke step failed: ${error.code ?? error.message}`)
    return false
  }

  const viaSession = await supabase.auth.updateUser({ password: password() })
  if (viaSession.error != null) {
    // The admin change ends the session, so the owner continues through recovery either way.
    const revoked = await supabaseAdmin().auth.admin.updateUserById(authUserId, { password: password() })
    if (revoked.error == null) await clearFlag()
    return failed(viaSession.error)
  }

  const cleared = await clearFlag()
  if (cleared.error != null) return failed(cleared.error)
  // The session's token still carries the flag, which `verifyAccessToken` refuses: mint one without.
  const refreshed = await supabase.auth.refreshSession()
  if (refreshed.error != null) return failed(refreshed.error)
  return true
}
