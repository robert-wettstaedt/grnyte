import { APP_PERMISSION_ADMIN } from '$lib/auth'
import { moderationDecisions } from '$lib/db/schema'
import { formError } from '$lib/forms/schemas'
import type * as z from '$lib/forms/zod'
import type { Context } from '$lib/remote/authed.server'
import { requireRow } from '$lib/remote/require.server'
import { error } from '@sveltejs/kit'
import { and, eq, isNull } from 'drizzle-orm'
import type { RemovableKind, undoRemovalSchema } from './dto'
import { canModerate } from './permissions'
import { reverseDecision } from './reverse.server'

/** A decision on this object that is not reversed yet, which holds it down. */
const standingOn = (kind: RemovableKind, id: number | string) =>
  and(
    eq(moderationDecisions.objectType, kind),
    eq(moderationDecisions.objectId, String(id)),
    isNull(moderationDecisions.reversedAt),
  )

/** Removed content comes back only through Undo, which restores past this. Run it as the login role after the
 *  caller's restore: their own check answers outsiders first, and a refusal rolls the restore back. */
export async function refuseWhileRemoved(db: Context['db'], kind: RemovableKind, id: number | string) {
  const standing = await db.query.moderationDecisions.findFirst({ columns: { id: true }, where: standingOn(kind, id) })
  if (standing != null) error(409, formError('moderation_restoreRefused'))
}

/** Undo of a standing decision: by any admin of its region, or an app admin. */
export async function undoRemovalRow(
  { decisionId, id, kind }: z.output<typeof undoRemovalSchema>,
  {
    afterCommit,
    db,
    user,
    userPermissions,
    userRegions,
  }: Pick<Context, 'afterCommit' | 'db' | 'user' | 'userPermissions' | 'userRegions'>,
) {
  const decision = await requireRow(
    () =>
      db.query.moderationDecisions.findFirst({
        orderBy: (table, { desc }) => desc(table.id),
        where: and(standingOn(kind, id), decisionId == null ? undefined : eq(moderationDecisions.id, decisionId)),
      }),
    (row) =>
      userPermissions?.includes(APP_PERMISSION_ADMIN) === true ||
      (row.regionFk != null && canModerate(userRegions, row.regionFk)),
    formError('moderation_alreadyReversed'),
  )
  await reverseDecision(decision, { afterCommit, db, user })
}
