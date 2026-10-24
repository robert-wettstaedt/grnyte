import {
  REGION_PERMISSION_ADMIN,
  REGION_PERMISSION_DELETE,
  REGION_PERMISSION_EDIT,
  REGION_PERMISSION_READ,
} from '$lib/auth'
import {
  areas,
  ascents,
  blocks,
  moderationDecisions,
  moderationDecisionSubjects,
  notifications,
  reactions,
  routes,
  users,
} from '$lib/db/schema'
import type { ModerationDecision } from '$lib/db/schema'
import { restoreAreaRow } from '$lib/entities/area/lifecycle.server'
import { recordAccolades } from '$lib/entities/ascent/accolade.server'
import { restoreBlockRow } from '$lib/entities/block/lifecycle.server'
import { deleteEvent } from '$lib/entities/event/event.server'
import type { UserRegion } from '$lib/entities/region/dto'
import { restoreRouteRow } from '$lib/entities/route/lifecycle.server'
import { recalcUserGradeAndRating } from '$lib/entities/route/user-grade.server'
import { formError } from '$lib/forms/schemas'
import type { Context } from '$lib/remote/authed.server'
import { error } from '@sveltejs/kit'
import { and, eq, isNotNull, isNull } from 'drizzle-orm'
import { goneForGood, type RemovedItem } from './dto'
import { queueNotice } from './record.server'

/** Topos and media were hard deleted, so for them only the decision changes, and their notice says so. */
export async function reverseDecision(
  decision: ModerationDecision,
  { afterCommit, db, user }: Pick<Context, 'afterCommit' | 'db' | 'user'>,
): Promise<void> {
  const regionFk = decision.regionFk
  if (regionFk == null) error(410, formError('moderation_notFound'))

  // Claimed first, so a second reversal racing this one stops here instead of restoring twice.
  const [claimed] = await db
    .update(moderationDecisions)
    .set({ removedBody: null, reversedAt: new Date(), reversedByFk: user.id })
    .where(and(eq(moderationDecisions.id, decision.id), isNull(moderationDecisions.reversedAt)))
    .returning({ id: moderationDecisions.id })
  if (claimed == null) error(409, formError('moderation_alreadyReversed'))

  const restored = await restoreContent(decision, regionFk, { db, user })

  const notices = and(eq(notifications.decisionFk, decision.id), eq(notifications.sourceType, 'content_removed'))
  await db.delete(notifications).where(and(notices, isNull(notifications.readAt)))
  if (!restored && !goneForGood(decision.objectType)) return

  const read = await db
    .select({ userFk: notifications.userFk })
    .from(notifications)
    .where(and(notices, isNotNull(notifications.readAt)))
  const subjects = await db.query.moderationDecisionSubjects.findMany({
    where: eq(moderationDecisionSubjects.decisionFk, decision.id),
  })
  // An ascent's media went for good with its delete, so the ascent alone came back.
  const cameBack = (items: RemovedItem[]) =>
    decision.objectType === 'ascent' ? items.filter((item) => item.kind !== 'file') : items
  const itemsOf = new Map(subjects.map((subject) => [subject.userFk, cameBack(subject.items)]))
  for (const { userFk } of read) {
    const items = itemsOf.get(userFk) ?? []
    // Someone else's photo on the ascent did not come back, so they have nothing to hear.
    if (items.length === 0) continue
    queueNotice(afterCommit, {
      actorFk: user.id,
      decisionFk: decision.id,
      items,
      regionFk,
      sourceType: 'content_restored',
      userFk,
    })
  }
}

/** Whether anything came back. */
async function restoreContent(
  { id: decisionId, objectId, objectType, removedBody }: ModerationDecision,
  regionFk: number,
  { db, user }: Pick<Context, 'db' | 'user'>,
): Promise<boolean> {
  const id = Number(objectId)
  // Whoever reverses acts with the region's full rights here, which is what the gate above granted.
  const userRegions = [
    {
      permissions: [REGION_PERMISSION_ADMIN, REGION_PERMISSION_DELETE, REGION_PERMISSION_EDIT, REGION_PERMISSION_READ],
      regionFk,
    },
  ] as UserRegion[]

  switch (objectType) {
    case 'comment': {
      // No text left (its author deleted their account): a bare placeholder must not come back to life.
      if (removedBody == null) return false
      // The removal cleared the author off the synced row; the decision kept whose it was.
      const [subject] = await db
        .select({ authUserFk: users.authUserFk, userFk: users.id })
        .from(moderationDecisionSubjects)
        .innerJoin(users, eq(users.id, moderationDecisionSubjects.userFk))
        .where(eq(moderationDecisionSubjects.decisionFk, decisionId))
      if (subject == null) return false
      const restored = await db
        .update(reactions)
        .set({
          authUserFk: subject.authUserFk,
          body: removedBody,
          deletedAt: null,
          removedBy: null,
          userFk: subject.userFk,
        })
        .where(and(eq(reactions.id, id), isNotNull(reactions.deletedAt)))
        .returning({ id: reactions.id })
      return restored.length > 0
    }
    case 'ascent': {
      const [restored] = await db
        .update(ascents)
        .set({ deletedAt: null })
        .where(and(eq(ascents.id, id), isNotNull(ascents.deletedAt)))
        .returning({ createdBy: ascents.createdBy, routeFk: ascents.routeFk })
      if (restored == null) return false
      // Undoes what the delete wrote beside it: the "removed" card and the cleared accolade.
      await deleteEvent(db, { object: { id, type: 'ascent' }, verb: 'delete' })
      await recalcUserGradeAndRating(db, restored.routeFk)
      await recordAccolades(db, restored, restored.createdBy)
      return true
    }
    case 'area': {
      const row = await db.query.areas.findFirst({ columns: { deletedAt: true }, where: eq(areas.id, id) })
      if (row?.deletedAt == null) return false
      await restoreAreaRow({ areaId: id, mode: 'soft' }, { db, user, userRegions })
      return true
    }
    case 'block': {
      const row = await db.query.blocks.findFirst({ columns: { deletedAt: true }, where: eq(blocks.id, id) })
      if (row?.deletedAt == null) return false
      await restoreBlockRow({ blockId: id, mode: 'soft' }, { db, user, userRegions })
      return true
    }
    case 'route': {
      const row = await db.query.routes.findFirst({ columns: { deletedAt: true }, where: eq(routes.id, id) })
      if (row?.deletedAt == null) return false
      await restoreRouteRow({ mode: 'soft', routeId: id }, { db, user, userRegions })
      return true
    }
    case 'file':
    case 'topo':
      return false
  }
}
