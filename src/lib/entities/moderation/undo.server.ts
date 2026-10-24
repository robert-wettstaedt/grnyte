import { APP_PERMISSION_ADMIN } from '$lib/auth'
import { moderationDecisions } from '$lib/db/schema'
import { formError } from '$lib/forms/schemas'
import type * as z from '$lib/forms/zod'
import type { Context } from '$lib/remote/authed.server'
import { requireRow } from '$lib/remote/require.server'
import { and, eq, isNull } from 'drizzle-orm'
import type { undoRemovalSchema } from './dto'
import { canModerate } from './permissions'
import { reverseDecision } from './reverse.server'

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
        where: and(
          eq(moderationDecisions.objectType, kind),
          eq(moderationDecisions.objectId, id),
          decisionId == null ? undefined : eq(moderationDecisions.id, decisionId),
          isNull(moderationDecisions.reversedAt),
        ),
      }),
    (row) =>
      userPermissions?.includes(APP_PERMISSION_ADMIN) === true ||
      (row.regionFk != null && canModerate(userRegions, row.regionFk)),
    formError('moderation_alreadyReversed'),
  )
  await reverseDecision(decision, { afterCommit, db, user })
}
