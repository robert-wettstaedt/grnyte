import { APP_PERMISSION_ADMIN } from '$lib/auth'
import { pinnedTx } from '$lib/db/pinned.server'
import { moderationDecisions, moderationDecisionSubjects, regions } from '$lib/db/schema'
import { toDisplayName } from '$lib/entities/displayName'
import { formError } from '$lib/forms/schemas'
import { error } from '@sveltejs/kit'
import { eq } from 'drizzle-orm'
import { decisionRef, type ModerationGround, type RemovedItem } from './dto'

export interface RemovalStatement {
  createdAt: number
  ground: ModerationGround
  items: RemovedItem[]
  reason: string
  reference: string
  regionName: string | undefined
  reversedAt: number | undefined
}

/** Anybody but the author (their items only) or an app admin, region admins included, gets a 404. */
export async function readStatement(
  decisionId: number,
  { user, userPermissions }: { user: undefined | { id: number }; userPermissions: App.Permission[] | undefined },
): Promise<RemovalStatement> {
  const found = await pinnedTx(async (tx) => {
    const [decision] = await tx
      .select({ decision: moderationDecisions, regionName: regions.name })
      .from(moderationDecisions)
      .leftJoin(regions, eq(regions.id, moderationDecisions.regionFk))
      .where(eq(moderationDecisions.id, decisionId))
    const subjects =
      decision == null
        ? []
        : await tx.query.moderationDecisionSubjects.findMany({
            where: eq(moderationDecisionSubjects.decisionFk, decisionId),
          })
    return { decision, subjects }
  })

  const appAdmin = userPermissions?.includes(APP_PERMISSION_ADMIN) ?? false
  const mine = found.subjects.filter((subject) => user != null && subject.userFk === user.id)
  if (found.decision == null || (!appAdmin && mine.length === 0)) error(404, formError('moderation_notFound'))

  const { decision, regionName } = found.decision
  return {
    createdAt: decision.createdAt.getTime(),
    ground: decision.ground,
    items: (appAdmin ? found.subjects : mine).flatMap((subject) => subject.items),
    reason: decision.reason,
    reference: decisionRef(decision.id),
    regionName: regionName == null ? undefined : toDisplayName(regionName),
    reversedAt: decision.reversedAt?.getTime(),
  }
}
