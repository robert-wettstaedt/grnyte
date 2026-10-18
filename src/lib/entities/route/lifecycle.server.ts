import {
  ascents,
  blocks,
  files,
  firstAscensionists,
  routeExternalResource27crags,
  routeExternalResource8a,
  routeExternalResources,
  routeExternalResourceTheCrag,
  routes,
  routesToFirstAscensionists,
  routesToTags,
  topoRoutes,
  type Block,
  type Route,
} from '$lib/db/schema'
import { entityHref } from '$lib/entities/href'
import { formError } from '$lib/forms/schemas'
import type * as z from '$lib/forms/zod'
import { type Context } from '$lib/remote/authed.server'
import type { MutationResult } from '$lib/remote/mutation'
import { answerReplayedRestore, requireIssuedId, requireRow } from '$lib/remote/require.server'
import { error } from '@sveltejs/kit'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { areaAncestry, blockIsStranded, stampDeletedAt } from '../area/area.server'
import { canHardDelete, deleteEvent, insertEvent } from '../event/event.server'
import { regionTags } from '../region/tagVocabulary'
import { restoreRouteSchema, type DeleteRouteSnapshot } from './dto'
import { canAddRoute, canDeleteRoute } from './permissions'
import { allowedTags } from './save.server'
import { recalcUserGradeAndRating } from './user-grade.server'

/** Delete and restore writes for a route; the handlers in `routes.remote.ts` keep every gate. */

type Caller = Pick<Context, 'db' | 'user' | 'userRegions'>

/** Delete a route. A bare route (no ascents, files or topo lines) is hard-deleted with a
 *  snapshot; one with dependents is soft-deleted so undo restores them cleanly. */
export async function deleteRouteRow(
  { id }: { id: number },
  { db, user, userRegions }: Caller,
): Promise<MutationResult<DeleteRouteSnapshot>> {
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
}

/** Hard-delete a bare route and return the snapshot {@link hardRestoreRoute} recreates it from. */
export async function hardDeleteRoute(db: Context['db'], route: Route): Promise<DeleteRouteSnapshot> {
  const id = route.id
  const tagRows = await db.query.routesToTags.findMany({ where: eq(routesToTags.routeFk, id) })
  const faRows = await db.query.routesToFirstAscensionists.findMany({
    where: eq(routesToFirstAscensionists.routeFk, id),
  })
  await db.delete(routesToTags).where(eq(routesToTags.routeFk, id))
  await db.delete(routesToFirstAscensionists).where(eq(routesToFirstAscensionists.routeFk, id))

  // External resources are scraped from the providers, so they're deleted without a
  // snapshot (a restored route only re-syncs them). The circular FKs (route ↔ resources
  // ↔ provider rows) are broken by nulling the nullable sides before deleting.
  const externalResourceRows = await db.query.routeExternalResources.findMany({
    columns: { id: true },
    where: eq(routeExternalResources.routeFk, id),
  })
  if (externalResourceRows.length > 0) {
    const externalResourceIds = externalResourceRows.map((row) => row.id)
    await db.update(routes).set({ externalResourcesFk: null }).where(eq(routes.id, id))
    await db
      .update(routeExternalResources)
      .set({ externalResource8aFk: null, externalResource27cragsFk: null, externalResourceTheCragFk: null })
      .where(inArray(routeExternalResources.id, externalResourceIds))
    await db
      .delete(routeExternalResource8a)
      .where(inArray(routeExternalResource8a.externalResourcesFk, externalResourceIds))
    await db
      .delete(routeExternalResource27crags)
      .where(inArray(routeExternalResource27crags.externalResourcesFk, externalResourceIds))
    await db
      .delete(routeExternalResourceTheCrag)
      .where(inArray(routeExternalResourceTheCrag.externalResourcesFk, externalResourceIds))
    await db.delete(routeExternalResources).where(inArray(routeExternalResources.id, externalResourceIds))
  }

  await db.delete(routes).where(eq(routes.id, id))

  return {
    firstAscensionistFks: faRows.map((row) => row.firstAscensionistFk),
    mode: 'hard',
    route: {
      blockFk: route.blockFk,
      description: route.description,
      firstAscentYear: route.firstAscentYear,
      gradeFk: route.gradeFk,
      name: route.name,
      rating: route.rating,
    },
    routeId: id,
    tags: tagRows.map((row) => row.tagFk),
  }
}

/** Recreate a hard-deleted route under its live block, or undefined when the id already exists (a
 *  replayed undo). Placement and authorship come from the block and the session, never the snapshot. */
export async function hardRestoreRoute(
  db: Context['db'],
  block: Block,
  snapshot: Extract<z.infer<typeof restoreRouteSchema>, { mode: 'hard' }>,
  userId: number,
  restoredTags: string[],
): Promise<Route | undefined> {
  const areaFks = await areaAncestry(db, block.areaFk)

  const [created] = await db
    .insert(routes)
    .values({
      areaFks,
      areaIds: areaFks.map((id) => `^${id}$`).join(','),
      blockFk: block.id,
      createdBy: userId,
      description: snapshot.route.description,
      firstAscentYear: snapshot.route.firstAscentYear,
      gradeFk: snapshot.route.gradeFk,
      // The original id makes a replayed Undo (double tap, second tab) a no-op on the primary key.
      id: snapshot.routeId,
      name: snapshot.route.name,
      rating: snapshot.route.rating,
      regionFk: block.regionFk,
    })
    .onConflictDoNothing({ target: routes.id })
    .returning()
  if (created == null) {
    return undefined
  }
  await recalcUserGradeAndRating(db, created.id)

  // The vocabulary alone, unlike `updateRoute`: this snapshot went out to the client and
  // came back, so a route restored after its region retired one of its tags comes back without
  // that tag rather than carrying a string in no vocabulary.
  if (restoredTags.length > 0) {
    await db
      .insert(routesToTags)
      .values(restoredTags.map((tagFk) => ({ regionFk: created.regionFk, routeFk: created.id, tagFk })))
  }
  // Region-scoped like `resolveFirstAscensionists`: these ids round-tripped through the client,
  // and the junction's WITH CHECK only tests its own `region_fk` (the FK's referential check
  // doesn't run under RLS), so an id from another region would insert cleanly and stay, invisible
  // everywhere `queries.ts` region-filters it except to a member of both regions.
  const ownFirstAscensionists =
    snapshot.firstAscensionistFks.length === 0
      ? []
      : await db.query.firstAscensionists.findMany({
          columns: { id: true },
          where: and(
            eq(firstAscensionists.regionFk, created.regionFk),
            inArray(firstAscensionists.id, snapshot.firstAscensionistFks),
          ),
        })
  if (ownFirstAscensionists.length > 0) {
    await db.insert(routesToFirstAscensionists).values(
      ownFirstAscensionists.map((firstAscensionist) => ({
        firstAscensionistFk: firstAscensionist.id,
        regionFk: created.regionFk,
        routeFk: created.id,
      })),
    )
  }
  return created
}

/** Undo a {@link deleteRouteRow}: recreate the hard-deleted route (with its tag and first-ascent
 *  links) or clear the soft delete's `deletedAt`, erasing the delete event with it. */
export async function restoreRouteRow(
  snapshot: z.infer<typeof restoreRouteSchema>,
  { db, user, userRegions }: Caller,
): Promise<MutationResult<{ routeId: number }>> {
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
}

/** Soft-delete a route that others hang off, so an undo brings them back with it. */
export async function softDeleteRoute(db: Context['db'], route: Route): Promise<DeleteRouteSnapshot> {
  await stampDeletedAt(db, { routeIds: [route.id] }, new Date(), null)
  return { mode: 'soft', routeId: route.id }
}
