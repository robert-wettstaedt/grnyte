import { getRequestEvent } from '$app/server'
import { CODE_LIFETIME_MS, IDENTITY_TARGETS, type OAuthProvider, type ReauthAction } from '$lib/auth'
import { pinnedTx } from '$lib/db/pinned.server'
import type * as schema from '$lib/db/schema'
import { reauthChallenges, reauthGrants } from '$lib/db/serverOnly'
import { reauthCode } from '$lib/email/account'
import { sendEmailOutcome } from '$lib/email/send.server'
import type { EmailLocale } from '$lib/email/shell'
import { error } from '@sveltejs/kit'
import { and, eq, gt, sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto'
import { countTry, MAX_TRIES } from './codeAttempts.server'
import { recordAuthEvent } from './events.server'
import { labelledKey } from './keys.server'
import { notForwarding } from './mailForwarding.server'
import { signInMethods } from './methods.server'
import { requireLiveSession } from './session.server'

export type { ReauthAction } from '$lib/auth'
export interface ReauthCaller {
  authUserId: string
  sessionId: string
}
type Tx = PostgresJsDatabase<typeof schema>

export const GRANT_LIFETIME_MS = 5 * 60 * 1000
/** The fifth wrong entry voids the code. */
const MAX_WRONG = 5

const CODE_KEY = labelledKey('reauth-code')
const hash = (challengeId: string, code: string) =>
  createHmac('sha256', CODE_KEY).update(`${challengeId}:${code}`).digest()

/** The account's own actions target the caller, whatever the page sent (it sends `self`); 400 for an identity target that is not a bare provider. */
export function boundTarget(caller: ReauthCaller, action: ReauthAction, target: string): string {
  if (action.startsWith('identity.') && !(IDENTITY_TARGETS as readonly string[]).includes(target)) error(400)
  return action === 'account.delete' || action === 'password.change' ? caller.authUserId : target
}

/** {@link sessionCaller}, once {@link requireLiveSession} found the session still live. */
export async function reauthCaller(): Promise<ReauthCaller> {
  const caller = sessionCaller()
  await requireLiveSession()
  return caller
}

/** The signed-in caller and its session, unchecked; 401 without a `session_id` claim. */
export function sessionCaller(): ReauthCaller {
  const claims = getRequestEvent().locals.claims
  if (claims?.sub == null || claims.session_id == null) error(401)
  return { authUserId: claims.sub, sessionId: claims.session_id }
}

const key = (
  table: typeof reauthChallenges | typeof reauthGrants,
  caller: ReauthCaller,
  action: ReauthAction,
  target: string,
) =>
  and(
    eq(table.authUserFk, caller.authUserId),
    eq(table.sessionId, caller.sessionId),
    eq(table.action, action),
    eq(table.target, target),
  )

type GrantMethod = 'apple' | 'email_code'

/**
 * Mails a fresh code, voiding the previous one for this action and target. `limited` after 5 mails
 * in an hour (counted before anything is mailed); `unsent` when the mail failed.
 */
export async function issueReauthCode(
  caller: ReauthCaller,
  action: ReauthAction,
  target: string,
  mail: { email: string; locale: EmailLocale },
): Promise<'limited' | 'undeliverable' | 'unsent' | { expiresAt: number; sentAt: number }> {
  // Before counting a try: `ReauthStep` asks by itself, and five asks would turn into "too many tries".
  if ((await notForwarding([mail.email])).has(mail.email)) return 'undeliverable'
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  const id = randomUUID()
  const sentAt = Date.now()
  const expiresAt = sentAt + CODE_LIFETIME_MS

  const issued = await pinnedTx(async (tx) => {
    if ((await countTry(tx, caller.authUserId, 'reauth_issue')) > MAX_TRIES) return false
    const codeHash = hash(id, code).toString('hex')
    const expires = new Date(expiresAt)
    await tx
      .insert(reauthChallenges)
      .values({
        action,
        attempts: 0,
        authUserFk: caller.authUserId,
        codeHash,
        expiresAt: expires,
        id,
        sessionId: caller.sessionId,
        target,
      })
      .onConflictDoUpdate({
        set: { attempts: 0, codeHash, createdAt: sql`now()`, expiresAt: expires, id },
        target: [
          reauthChallenges.authUserFk,
          reauthChallenges.sessionId,
          reauthChallenges.action,
          reauthChallenges.target,
        ],
      })
    return true
  })
  if (!issued) return 'limited'

  const methods = await signInMethods(caller.authUserId)
  const outcome = await sendEmailOutcome({
    ...reauthCode({ action, code, locale: mail.locale, methods }),
    locale: mail.locale,
    template: 'reauth-code',
    to: mail.email,
  })
  if (outcome === 'suppressed') return 'undeliverable'
  return outcome === 'sent' ? { expiresAt, sentAt } : 'unsent'
}

/** Checks a code; a right one deletes the challenge and writes the grant in the same transaction. */
export async function verifyReauthCode(
  caller: ReauthCaller,
  action: ReauthAction,
  target: string,
  code: string,
): Promise<'expired' | 'granted' | 'void' | 'wrong'> {
  const answer = await pinnedTx(async (tx) => {
    // Counted in the statement that reads the row, so concurrent guesses each count.
    const [row] = await tx
      .update(reauthChallenges)
      .set({ attempts: sql`${reauthChallenges.attempts} + 1` })
      .where(key(reauthChallenges, caller, action, target))
      .returning()
    if (row == null) return 'void'

    const drop = () => tx.delete(reauthChallenges).where(eq(reauthChallenges.id, row.id))
    if (row.expiresAt.getTime() <= Date.now()) {
      await drop()
      return 'expired'
    }
    const expected = Buffer.from(row.codeHash, 'hex')
    if (/^\d{6}$/.test(code) && timingSafeEqual(hash(row.id, code), expected)) {
      await drop()
      await upsertGrant(tx, caller, action, target, 'email_code')
      return 'granted'
    }
    if (row.attempts >= MAX_WRONG) {
      await drop()
      return 'spent'
    }
    return 'wrong'
  })
  if (answer === 'wrong' || answer === 'spent')
    await recordAuthEvent('reauth_failed', { authUserId: caller.authUserId, detail: { action } })
  return answer === 'spent' ? 'void' : answer
}

/** A confirmation for this caller, action and target, valid for {@link GRANT_LIFETIME_MS}. */
export async function writeGrant(caller: ReauthCaller, action: ReauthAction, target: string, method: GrantMethod) {
  await pinnedTx((tx) => upsertGrant(tx, caller, action, target, method))
}

async function upsertGrant(tx: Tx, caller: ReauthCaller, action: ReauthAction, target: string, method: GrantMethod) {
  const expiresAt = new Date(Date.now() + GRANT_LIFETIME_MS)
  await tx
    .insert(reauthGrants)
    .values({ action, authUserFk: caller.authUserId, expiresAt, method, sessionId: caller.sessionId, target })
    .onConflictDoUpdate({
      set: { createdAt: sql`now()`, expiresAt, method },
      target: [reauthGrants.authUserFk, reauthGrants.sessionId, reauthGrants.action, reauthGrants.target],
    })
}

const live = () => gt(reauthGrants.expiresAt, new Date())

/** Re-targets this session's `identity.link` grant to the verified identity, the only form the trigger spends. */
export async function bindLinkGrant(caller: ReauthCaller, provider: OAuthProvider, sub: string): Promise<boolean> {
  const bound = await pinnedTx((tx) =>
    tx
      .update(reauthGrants)
      .set({ target: `${provider}:${sub}` })
      .where(and(key(reauthGrants, caller, 'identity.link', provider), live()))
      .returning({ id: reauthGrants.id }),
  )
  return bound.length > 0
}

/** Peek: spends nothing. */
export async function hasGrant(caller: ReauthCaller, action: ReauthAction, target: string): Promise<boolean> {
  const found = await pinnedTx((tx) =>
    tx
      .select({ id: reauthGrants.id })
      .from(reauthGrants)
      .where(and(key(reauthGrants, caller, action, target), live()))
      .limit(1),
  )
  return found.length > 0
}

/** Locks the grant for a handler whose write is a GoTrue call; spend it after that call succeeds. */
export async function holdGrant(tx: Tx, caller: ReauthCaller, action: ReauthAction, target: string): Promise<boolean> {
  const held = await tx
    .select({ id: reauthGrants.id })
    .from(reauthGrants)
    .where(and(key(reauthGrants, caller, action, target), live()))
    .for('update')
  return held.length > 0
}

/** Spends the grant inside the handler's transaction, after its own refusals, so a refusal rolls it back. */
export async function spendGrant(tx: Tx, caller: ReauthCaller, action: ReauthAction, target: string): Promise<boolean> {
  const spent = await tx
    .delete(reauthGrants)
    .where(and(key(reauthGrants, caller, action, target), live()))
    .returning({ id: reauthGrants.id })
  return spent.length > 0
}

/** Undoes {@link bindLinkGrant} after GoTrue certainly did not link, so "Try again" still finds the grant. */
export async function unbindLinkGrant(caller: ReauthCaller, provider: OAuthProvider, sub: string): Promise<void> {
  await pinnedTx((tx) =>
    tx
      .update(reauthGrants)
      .set({ target: provider })
      .where(and(key(reauthGrants, caller, 'identity.link', `${provider}:${sub}`), live())),
  ).catch((cause: unknown) => {
    // A newer bare grant from the same session already holds the key: "Try again" has one.
    if (Object(Object(cause).cause).code !== '23505' && Object(cause).code !== '23505') throw cause
  })
}

/** Deletes every open code and grant of the account, after its credentials changed. */
export async function voidReauth(authUserId: string): Promise<void> {
  await pinnedTx(async (tx) => {
    await tx.delete(reauthChallenges).where(eq(reauthChallenges.authUserFk, authUserId))
    await tx.delete(reauthGrants).where(eq(reauthGrants.authUserFk, authUserId))
  })
}

/** Deletes the open codes only: a failed change may still have landed, but its grant stays for the retry. */
export async function voidReauthCodes(authUserId: string): Promise<void> {
  await pinnedTx((tx) => tx.delete(reauthChallenges).where(eq(reauthChallenges.authUserFk, authUserId)))
}
