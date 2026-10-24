import { pinnedTx } from '$lib/db/pinned.server'
import { moderationDecisions, moderationDecisionSubjects, regions, users } from '$lib/db/schema'
import { toAuthor, toDisplayName } from '$lib/entities/displayName'
import { formError } from '$lib/forms/schemas'
import { drainAfterCommit, type Context } from '$lib/remote/authed.server'
import { error } from '@sveltejs/kit'
import { desc, eq, inArray } from 'drizzle-orm'
import type { ModerationGround, RemovableKind, RemovedItem } from './dto'
import { reverseDecision } from './reverse.server'

const LIST_LIMIT = 200

export interface DecisionRow {
  actorName: string
  createdAt: number
  ground: ModerationGround
  id: number
  items: RemovedItem[]
  objectType: RemovableKind
  reason: string
  regionName: string | undefined
  reversedAt: number | undefined
}

/** The caller has checked app admin. */
export async function readDecisions(): Promise<DecisionRow[]> {
  return pinnedTx(async (tx) => {
    const rows = await tx
      .select({ actorName: users.username, decision: moderationDecisions, regionName: regions.name })
      .from(moderationDecisions)
      .leftJoin(users, eq(users.id, moderationDecisions.actorFk))
      .leftJoin(regions, eq(regions.id, moderationDecisions.regionFk))
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
    return rows.map(({ actorName, decision, regionName }) => ({
      actorName: toAuthor(decision.actorFk, actorName ?? undefined).name,
      createdAt: decision.createdAt.getTime(),
      ground: decision.ground,
      id: decision.id,
      items: (itemsOf.get(decision.id) ?? []).flatMap((subject) => subject.items),
      objectType: decision.objectType,
      reason: decision.reason,
      regionName: regionName == null ? undefined : toDisplayName(regionName),
      reversedAt: decision.reversedAt?.getTime(),
    }))
  })
}

/** The caller has checked app admin; the notices go after commit. */
export async function reverseById(decisionId: number, user: Context['user']): Promise<void> {
  const queued: (() => Promise<void>)[] = []
  await pinnedTx(async (tx) => {
    const decision = await tx.query.moderationDecisions.findFirst({ where: eq(moderationDecisions.id, decisionId) })
    if (decision == null) error(404, formError('moderation_notFound'))
    // `pinnedTx` types its transaction as the database; at runtime it is the transaction the restores expect.
    const db = tx as unknown as Context['db']
    await reverseDecision(decision, { afterCommit: (task) => void queued.push(task), db, user })
  })
  await drainAfterCommit(queued)
}
