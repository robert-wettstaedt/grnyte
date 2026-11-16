import { pinnedTx } from '$lib/db/pinned.server'
import * as schema from '$lib/db/schema'
import { authEvents } from '$lib/db/serverOnly'
import { and, eq, sql } from 'drizzle-orm'

export interface ProfileInput {
  authUserId: string
  contactLocale: string
  gradingScale: 'FB' | 'V'
  /** Absolute origin for the admin alert's mail. */
  origin: string
  username: string
}

type Tx = Parameters<Parameters<typeof pinnedTx>[0]>[0]

/** An account deletion left an `account_deleted` event for this auth user. */
export async function hasDeletionMarker(authUserId: string): Promise<boolean> {
  return pinnedTx((tx) => deletionMarked(tx, authUserId))
}

/** Creates the `users` and `user_settings` rows of a signed-up account, then alerts the admins once. */
export async function provisionProfile(input: ProfileInput): Promise<{ kind: 'created' | 'deleted' | 'exists' }> {
  const { authUserId: authUserFk, contactLocale, gradingScale, username } = input
  const created = await pinnedTx(async (tx) => {
    // One provisioner per account, so a double submit creates one profile.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`profile:${authUserFk}`}))`)
    if (await deletionMarked(tx, authUserFk)) return 'deleted'
    const [existing] = await tx
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.authUserFk, authUserFk))
      .limit(1)
    if (existing != null) return 'exists'

    const [user] = await tx.insert(schema.users).values({ authUserFk, username }).returning()
    const [settings] = await tx
      .insert(schema.userSettings)
      .values({ authUserFk, contactLocale, gradingScale, userFk: user.id })
      .returning()
    await tx.update(schema.users).set({ userSettingsFk: settings.id }).where(eq(schema.users.id, user.id))
    return user.id
  })
  if (typeof created !== 'number') return { kind: created }

  // Imported late: the auth hook reads hasDeletionMarker, and the alert chain loads push's env.
  const { notifyAdminsOfSignup } = await import('$lib/entities/notification/signup.server')
  await notifyAdminsOfSignup({ origin: input.origin, userFk: created, username })
  return { kind: 'created' }
}

async function deletionMarked(tx: Tx, authUserId: string): Promise<boolean> {
  const [marker] = await tx
    .select({ id: authEvents.id })
    .from(authEvents)
    .where(and(eq(authEvents.authUserFk, authUserId), eq(authEvents.kind, 'account_deleted')))
    .limit(1)
  return marker != null
}
