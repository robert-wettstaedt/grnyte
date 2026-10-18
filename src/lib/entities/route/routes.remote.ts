import { ascents, blocks, files, routes, routesToFirstAscensionists, routesToTags, topoRoutes } from '$lib/db/schema'
import { entityHref } from '$lib/entities/href'
import { blank, formError } from '$lib/forms/schemas'
import * as z from '$lib/forms/zod'
import { authedCommand, authedForm } from '$lib/remote/authed.server'
import type { MutationResult } from '$lib/remote/mutation'
import { answerReplayedRestore, requireIssuedId, requireRow } from '$lib/remote/require.server'
import { error, invalid } from '@sveltejs/kit'
import { and, eq, isNull } from 'drizzle-orm'
import { areaAncestry, blockIsStranded } from '../area/area.server'
import { canHardDelete, deleteEvent, insertEvent } from '../event/event.server'
import { notifyMentions } from '../notification/notification.server'
import { regionTags } from '../region/tagVocabulary'
import { routeActionSchema } from './dto'
import { resolveFirstAscensionists } from './firstAscensionist.server'
import {
  hardDeleteRoute,
  hardRestoreRoute,
  restoreRouteSchema,
  softDeleteRoute,
  type DeleteRouteSnapshot,
} from './lifecycle.server'
import { canAddRoute, canDeleteRoute } from './permissions'
import { allowedTags, findDuplicateName, updateRouteRow } from './update.server'
import { recalcUserGradeAndRating } from './user-grade.server'

/** Create a route under a block. Returns `{ id }` and declares NO `redirectTo`: a redirect is a 303,
 *  and the server rebuilds that response from the location alone, discarding this return value. The
 *  form needs the id to finalize its uploads, so it leaves through `exit` itself. */
export const createRoute = authedForm(
  routeActionSchema,
  async (value, { afterCommit, db, user, userRegions }, issue) => {
    const block = await db.query.blocks.findFirst({
      where: and(eq(blocks.id, value.blockId), isNull(blocks.deletedAt)),
    })

    if (block == null) {
      invalid(formError('blocks_notFound'))
    }

    if (!canAddRoute(userRegions, block)) {
      invalid(formError('form_noPermission'))
    }

    const duplicate = await findDuplicateName(db, value, block.id)
    if (duplicate != null) {
      invalid(issue.name(formError('routes_nameExists', { name: duplicate.name })))
    }

    const areaFks = await areaAncestry(db, block.areaFk)

    const [route] = await db
      .insert(routes)
      .values({
        areaFks,
        areaIds: areaFks.map((id) => `^${id}$`).join(','),
        blockFk: block.id,
        createdBy: user.id,
        description: blank(value.description),
        firstAscentYear: value.firstAscentYear,
        gradeFk: value.gradeFk,
        name: value.name,
        rating: value.rating,
        regionFk: block.regionFk,
      })
      .returning()

    // Seeds userGradeFk/userRating from the route's own grade (no ascent votes yet),
    // through the same SQL every other write path uses.
    await recalcUserGradeAndRating(db, route.id)

    const tags = allowedTags(regionTags(userRegions, block.regionFk), value.tags)
    if (tags.length > 0) {
      await db
        .insert(routesToTags)
        .values(tags.map((tagFk) => ({ regionFk: block.regionFk, routeFk: route.id, tagFk })))
    }

    const resolvedFa = await resolveFirstAscensionists(db, value.firstAscensionists, block.regionFk, user.id)
    if (resolvedFa.length > 0) {
      await db
        .insert(routesToFirstAscensionists)
        .values(resolvedFa.map((fa) => ({ firstAscensionistFk: fa.id, regionFk: block.regionFk, routeFk: route.id })))
    }

    // Neither the name nor the block is stored: both are reachable through `routes`, which is
    // what real foreign keys buy over the polymorphic pair and its `parentEntity*` companion.
    await insertEvent(db, {
      actorFk: user.id,
      object: { id: route.id, type: 'route' },
      regionFk: block.regionFk,
      verb: 'create',
    })

    afterCommit(() =>
      notifyMentions({
        actorFk: user.id,
        body: value.description,
        object: { id: route.id, type: 'route' },
        regionFk: block.regionFk,
      }),
    )

    return { data: { id: route.id } }
  },
)

/** Edit a route. Reuses the create form (with `id` set). Any region member may edit the
 *  route itself; tag changes additionally need EDIT (their RLS is stricter). */
export const updateRoute = authedForm(routeActionSchema, (value, ctx, issue) =>
  updateRouteRow(value, ctx, (message, field) => invalid(field == null ? message : issue[field](message))),
)

/** Delete a route. A bare route (no ascents, files or topo lines) is hard-deleted with a
 *  snapshot; one with dependents is soft-deleted so undo restores them cleanly. */
export const deleteRoute = authedCommand(
  z.object({ id: z.number() }),
  async ({ id }, { db, user, userRegions }): Promise<MutationResult<DeleteRouteSnapshot>> => {
    const route = await requireRow(
      () => db.query.routes.findFirst({ where: and(eq(routes.id, id), isNull(routes.deletedAt)) }),
      (row) => canDeleteRoute(userRegions, user.id, row),
      formError('routes_notFound'),
    )

    // Ascents/files/topo lines FK-reference the route; with any of them present the route
    // is soft-deleted (and the hard delete never hits a FK constraint).
    // Unfiltered: `ascents.route_fk` has no ON DELETE action, so a tombstoned ascent 23503s too.
    const [ascent, file, topoRoute] = await Promise.all([
      db.query.ascents.findFirst({
        columns: { id: true },
        where: eq(ascents.routeFk, id),
      }),
      db.query.files.findFirst({ columns: { id: true }, where: eq(files.routeFk, id) }),
      db.query.topoRoutes.findFirst({ columns: { id: true }, where: eq(topoRoutes.routeFk, id) }),
    ])

    // Childless is necessary but no longer sufficient. `events.route_fk` cascades, so erasing a
    // route that has been in the log for a while takes its whole history with it, and erasing one
    // somebody has reacted to takes their words too. Both fall back to the soft path.
    const erasable = await canHardDelete(db, {
      childless: ascent == null && file == null && topoRoute == null,
      createdAt: route.createdAt,
      object: { id, type: 'route' },
    })

    const data = erasable ? await hardDeleteRoute(db, route) : await softDeleteRoute(db, route)

    // Written on the soft path only, unlike an ascent's deletion which also depends on who did it:
    // a route is shared, so its removal is news to the region regardless of who removed it, and the
    // row survives the soft delete so the card can still name it. Nothing for a hard delete: the
    // event would abort against the gone row or be cascaded away with it, and a mistake inside the
    // grace window leaving no trace is the point of the window.
    if (!erasable) {
      await insertEvent(db, {
        actorFk: user.id,
        object: { id: route.id, type: 'route' },
        regionFk: route.regionFk,
        verb: 'delete',
      })
    }

    return {
      data,
      redirectTo: entityHref('blocks', route.blockFk),
    }
  },
)

/** Undo a {@link deleteRoute}: recreate the hard-deleted route (with its tag and first-ascent
 *  links) or clear the soft delete's `deletedAt`, erasing the delete event with it. */
export const restoreRoute = authedCommand(restoreRouteSchema, async (snapshot, { db, user, userRegions }) => {
  if (snapshot.mode === 'hard') {
    // Client-supplied snapshot, so mirror createRoute rather than inserting it verbatim: derive the
    // region/area chain from the actual block and override authorship, or a DELETE holder could
    // restore a route with forged createdBy into another region's block.
    const block = await db.query.blocks.findFirst({ where: eq(blocks.id, snapshot.route.blockFk) })
    if (block == null) {
      error(404, formError('blocks_notFound'))
    }
    // A hard restore inserts a brand new row, so it is a create and gates like one (see createRoute).
    // Gating on canDeleteRoute instead would deny the undo to the EDITor who has now deleted their own
    // route: the snapshot carries no `createdBy`, so that predicate's own-created branch can't fire.
    if (!canAddRoute(userRegions, block)) {
      error(403, formError('form_noPermission'))
    }
    // A hard restore is a create, and a create under a dead parent strands the row.
    if (block.deletedAt != null) {
      error(404, formError('blocks_notFound'))
    }

    await requireIssuedId(db, 'routes', snapshot.routeId, formError('routes_notFound'))
    // Filtered before the insert: the restored row takes the block's region either way.
    const restoredTags = allowedTags(regionTags(userRegions, block.regionFk), snapshot.tags)
    const created = await hardRestoreRoute(db, block, snapshot, user.id, restoredTags)
    if (created == null) {
      const replayed = eq(routes.blockFk, block.id)
      return {
        data: { routeId: snapshot.routeId },
        ...(await answerReplayedRestore(db, 'routes', snapshot.routeId, replayed, formError('routes_notFound'))),
      }
    }

    // Nothing to move onto the new id: only a route inside the grace window is hard-deleted, and
    // `events.route_fk on delete cascade` took its entire log with it. The route comes back with
    // no history because it never had any worth keeping.
    return { data: { routeId: created.id }, redirectTo: entityHref('routes', created.id) }
  }

  const route = await db.query.routes.findFirst({ where: eq(routes.id, snapshot.routeId) })

  if (route == null || !canDeleteRoute(userRegions, user.id, route)) {
    error(403, formError('form_noPermission'))
  }

  // Nothing to undo, as in restoreArea and restoreBlock: a replayed Undo lands on a live route.
  if (route.deletedAt == null) {
    return { data: { routeId: route.id }, redirectTo: entityHref('routes', route.id) }
  }

  // Refuse rather than strand it: restore the ancestor first, which brings this row with it.
  if (await blockIsStranded(db, route.blockFk)) {
    error(404, formError('blocks_notFound'))
  }

  // Unguarded by stamp, unlike `stampDeletedAt`: kept as it was, so this is not that helper.
  await db.update(routes).set({ deletedAt: null }).where(eq(routes.id, route.id))
  // The delete event and nothing else: the route's own create and every edit ever made to it
  // still point at this id and stay live, exactly as they were before the delete.
  await deleteEvent(db, { object: { id: route.id, type: 'route' }, verb: 'delete' })

  return { data: { routeId: route.id }, redirectTo: entityHref('routes', route.id) }
})
