import { db } from '$lib/db/db.server'
import { pinnedTx } from '$lib/db/pinned.server'
import { users } from '$lib/db/schema'
import { authEvents } from '$lib/db/serverOnly'
import { supabaseAdmin } from '$lib/db/supabaseAdmin.server'
import { DAY_MS } from '$lib/i18n/relativeTime'
import { logServerFailure } from '$lib/logging/failure.server'
import { stringifyError } from '$lib/logging/stringify'
import { and, eq, exists, isNull, lt, or } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { authUsers } from 'drizzle-orm/supabase'
import { removeFileStorage } from '../file/cleanup.server'
import { deleteAccountData } from './delete.server'

/** Unconfirmed accounts older than 7 days, as the confirmation link has long expired. */
export const UNCONFIRMED_MAX_AGE_MS = 7 * DAY_MS

const authUser = alias(authUsers, 'auth_user')

/**
 * Delete accounts created before `before` that never confirmed their email or never completed the
 * profile step, and at once a sign-in record an account deletion left when GoTrue failed after commit.
 */
export async function sweepUnconfirmedAccounts(before: Date): Promise<number> {
  const stale = await db
    .select({ id: authUser.id, userFk: users.id })
    .from(authUser)
    .leftJoin(users, eq(users.authUserFk, authUser.id))
    .where(
      or(
        and(isNull(authUser.emailConfirmedAt), lt(authUser.createdAt, before)),
        and(isNull(users.id), lt(authUser.createdAt, before)),
        exists(
          db
            .select({ id: authEvents.id })
            .from(authEvents)
            .where(and(eq(authEvents.authUserFk, authUser.id), eq(authEvents.kind, 'account_deleted'))),
        ),
      ),
    )

  let removed = 0
  for (const { id, userFk } of stale) {
    try {
      const targets =
        userFk == null ? [] : await pinnedTx((tx) => deleteAccountData(tx, { authUserFk: id, id: userFk }, []))
      await removeFileStorage(targets)
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
