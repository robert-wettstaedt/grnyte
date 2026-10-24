import { moderationDecisions } from '$lib/db/schema'
import { formError } from '$lib/forms/schemas'
import type * as z from '$lib/forms/zod'
import type { Context } from '$lib/remote/authed.server'
import { requireRow } from '$lib/remote/require.server'
import { and, eq, isNull } from 'drizzle-orm'
import type { removalTargetSchema } from './dto'
import { canModerate } from './permissions'
import { reverseDecision } from './reverse.server'

/** The Undo after a removal: only the admin who made the decision, while they still moderate the region. */
export async function undoRemovalRow(
  { id, kind }: z.output<typeof removalTargetSchema>,
  { afterCommit, db, user, userRegions }: Pick<Context, 'afterCommit' | 'db' | 'user' | 'userRegions'>,
) {
  const decision = await requireRow(
    () =>
      db.query.moderationDecisions.findFirst({
        orderBy: (table, { desc }) => desc(table.id),
        where: and(
          eq(moderationDecisions.objectType, kind),
          eq(moderationDecisions.objectId, id),
          isNull(moderationDecisions.reversedAt),
        ),
      }),
    (row) => row.actorFk === user.id && row.regionFk != null && canModerate(userRegions, row.regionFk),
    formError('moderation_notFound'),
  )
  await reverseDecision(decision, { afterCommit, db, user })
}
