import { db } from '$lib/db/db.server'
import { pinnedTx } from '$lib/db/pinned.server'
import { users, userSettings } from '$lib/db/schema'
import { supabaseAdmin } from '$lib/db/supabaseAdmin.server'
import { logServerFailure } from '$lib/logging/failure.server'
import { stringifyError } from '$lib/logging/stringify'
import { and, eq, isNull, lt } from 'drizzle-orm'
import { authUsers } from 'drizzle-orm/supabase'

/** Unconfirmed accounts older than 7 days, as the confirmation link has long expired. */
export const UNCONFIRMED_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Delete accounts created before `before` that never confirmed their email, with their profile.
 * An unconfirmed account cannot sign in, so those two rows are all it can own; one that owns more
 * fails its delete, is logged and is left alone.
 */
export async function sweepUnconfirmedAccounts(before: Date): Promise<number> {
  const stale = await db
    .select({ id: authUsers.id })
    .from(authUsers)
    .where(and(isNull(authUsers.emailConfirmedAt), lt(authUsers.createdAt, before)))

  let removed = 0
  for (const { id } of stale) {
    try {
      await pinnedTx(async (tx) => {
        await tx.update(users).set({ userSettingsFk: null }).where(eq(users.authUserFk, id))
        await tx.delete(userSettings).where(eq(userSettings.authUserFk, id))
        await tx.delete(users).where(eq(users.authUserFk, id))
      })
      const { error } = await supabaseAdmin().auth.admin.deleteUser(id)
      if (error != null) throw error
      removed += 1
    } catch (error) {
      // The count and the failure only, never the address.
      console.error('[cleanup] unconfirmed account delete failed', error)
      await logServerFailure('cleanup', `unconfirmed account delete failed: ${stringifyError(error)}`)
    }
  }
  return removed
}
