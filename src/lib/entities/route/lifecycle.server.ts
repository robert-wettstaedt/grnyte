import {
  firstAscensionists,
  routeExternalResource27crags,
  routeExternalResource8a,
  routeExternalResources,
  routeExternalResourceTheCrag,
  routes,
  routesToFirstAscensionists,
  routesToTags,
  type Block,
  type Route,
} from '$lib/db/schema'
import * as z from '$lib/forms/zod'
import { type Context } from '$lib/remote/authed.server'
import { and, eq, inArray } from 'drizzle-orm'
import { areaAncestry, stampDeletedAt } from '../area/area.server'
import { recalcUserGradeAndRating } from './user-grade.server'

/** Delete and restore writes for a route; the handlers in `routes.remote.ts` keep every gate. */

/** What `restoreRoute` accepts. Placement and authorship are never in it: they come from the block. */
export const restoreRouteSchema = z.discriminatedUnion('mode', [
  z.object({
    firstAscensionistFks: z.array(z.number()),
    mode: z.literal('hard'),
    route: z.object({
      blockFk: z.number(),
      description: z.nullable(z.string()),
      // Bounded exactly as `routeActionSchema` bounds them: the snapshot round-trips through the
      // client, `routes` has no CHECK on either column, and `rating` feeds `recalcUserGradeAndRating`.
      firstAscentYear: z.nullable(z.int().check(z.gte(1900), z.lte(2100))),
      gradeFk: z.nullable(z.number()),
      name: z.string(),
      // 1-3 stars, as on the form; unrated is null rather than 0.
      rating: z.nullable(z.int().check(z.gte(1), z.lte(3))),
    }),
    routeId: z.number(),
    tags: z.array(z.string()),
  }),
  z.object({ mode: z.literal('soft'), routeId: z.number() }),
])

/** Snapshot `deleteRoute` returns so `restoreRoute` can undo either delete path. */
export type DeleteRouteSnapshot =
  | {
      firstAscensionistFks: number[]
      mode: 'hard'
      route: Pick<Route, 'blockFk' | 'description' | 'firstAscentYear' | 'gradeFk' | 'name' | 'rating'>
      routeId: number
      tags: string[]
    }
  | { mode: 'soft'; routeId: number }

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

/** Soft-delete a route that others hang off, so an undo brings them back with it. */
export async function softDeleteRoute(db: Context['db'], route: Route): Promise<DeleteRouteSnapshot> {
  await stampDeletedAt(db, { routeIds: [route.id] }, new Date(), null)
  return { mode: 'soft', routeId: route.id }
}
