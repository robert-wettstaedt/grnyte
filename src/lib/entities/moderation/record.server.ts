import { moderationDecisions, moderationDecisionSubjects } from '$lib/db/schema'
import { notify } from '$lib/entities/notification/notification.server'
import { closeReportsOn } from '$lib/entities/report/report.server'
import type { Context } from '$lib/remote/authed.server'
import type { MutationResult } from '$lib/remote/mutation'
import { asPrivileged, type ServerMutatorContext } from '$lib/zero/serverMutator.server'
import type { ModerationGround, RemovableKind, RemovedItem } from './dto'

export type Planned<T> = MutationResult<T> & { removal?: Removal }

export interface Removal {
  actorFk: number
  ground: ModerationGround
  object: { id: string; kind: RemovableKind }
  reason: string
  regionFk: number
  removedBody?: string
  /** `userFk` null is an author who deleted their account: recorded, told nothing. */
  subjects: { items: RemovedItem[]; userFk: null | number }[]
}

export function queueNotice(
  afterCommit: Context['afterCommit'],
  notice: {
    actorFk: number
    decisionFk: number
    items: RemovedItem[]
    regionFk: number
    sourceType: 'content_removed' | 'content_restored'
    userFk: number
  },
): void {
  const { items, userFk, ...rest } = notice
  afterCommit(() => notify({ ...rest, metadata: JSON.stringify(items), userFks: [userFk] }))
}

export async function recordPlanned(
  tx: Parameters<typeof asPrivileged>[0],
  ctx: Pick<ServerMutatorContext, 'afterCommit'>,
  removal: Removal | undefined,
): Promise<void> {
  if (removal != null) await asPrivileged(tx, (db) => recordRemoval(db, removal, ctx.afterCommit))
}

/** Needs a privileged handle; queues one notice per live author for after commit. */
export async function recordRemoval(
  db: Pick<Context['db'], 'delete' | 'insert' | 'query'>,
  removal: Removal,
  afterCommit: Context['afterCommit'],
): Promise<number> {
  const [decision] = await db
    .insert(moderationDecisions)
    .values({
      actorFk: removal.actorFk,
      ground: removal.ground,
      objectId: removal.object.id,
      objectType: removal.object.kind,
      reason: removal.reason,
      regionFk: removal.regionFk,
      removedBody: removal.removedBody,
    })
    .returning({ id: moderationDecisions.id })

  if (removal.subjects.length > 0) {
    await db
      .insert(moderationDecisionSubjects)
      .values(removal.subjects.map(({ items, userFk }) => ({ decisionFk: decision.id, items, userFk })))
  }

  for (const { items, userFk } of removal.subjects) {
    if (userFk == null) continue
    queueNotice(afterCommit, {
      actorFk: removal.actorFk,
      decisionFk: decision.id,
      items,
      regionFk: removal.regionFk,
      sourceType: 'content_removed',
      userFk,
    })
  }

  await closeReportsOn(db, removal.object, afterCommit)

  return decision.id
}
