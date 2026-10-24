import { pinnedTx } from '$lib/db/pinned.server'
import { moderationDecisions, moderationDecisionSubjects, regions, users } from '$lib/db/schema'
import { toAuthor, toDisplayName } from '$lib/entities/displayName'
import { desc, eq, inArray } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { DecisionRow } from './dto'

const LIST_LIMIT = 200
const reverser = alias(users, 'reverser')

/** The caller has checked app admin, or that they moderate `regionFk`. */
export async function readDecisions(regionFk?: number): Promise<DecisionRow[]> {
  return pinnedTx(async (tx) => {
    const rows = await tx
      .select({
        actorName: users.username,
        decision: moderationDecisions,
        regionName: regions.name,
        reversedByName: reverser.username,
      })
      .from(moderationDecisions)
      .leftJoin(users, eq(users.id, moderationDecisions.actorFk))
      .leftJoin(regions, eq(regions.id, moderationDecisions.regionFk))
      .leftJoin(reverser, eq(reverser.id, moderationDecisions.reversedByFk))
      .where(regionFk == null ? undefined : eq(moderationDecisions.regionFk, regionFk))
      .orderBy(desc(moderationDecisions.id))
      .limit(LIST_LIMIT)
    const subjects =
      rows.length === 0
        ? []
        : await tx.query.moderationDecisionSubjects.findMany({
            where: inArray(
              moderationDecisionSubjects.decisionFk,
              rows.map((row) => row.decision.id),
            ),
          })
    const itemsOf = Map.groupBy(subjects, (subject) => subject.decisionFk)
    return rows.map(({ actorName, decision, regionName, reversedByName }) => ({
      actorName: toAuthor(decision.actorFk, actorName ?? undefined).name,
      createdAt: decision.createdAt.getTime(),
      ground: decision.ground,
      id: decision.id,
      items: (itemsOf.get(decision.id) ?? []).flatMap((subject) => subject.items),
      objectId: decision.objectId,
      objectType: decision.objectType,
      reason: decision.reason,
      regionName: regionName == null ? undefined : toDisplayName(regionName),
      reversedAt: decision.reversedAt?.getTime(),
      reversedByName:
        decision.reversedByFk == null ? undefined : toAuthor(decision.reversedByFk, reversedByName ?? undefined).name,
    }))
  })
}
