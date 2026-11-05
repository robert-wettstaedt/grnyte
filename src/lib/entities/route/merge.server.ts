import { routeExternalResources, routes, topoRoutes, type Route } from '$lib/db/schema'
import { formError } from '$lib/forms/schemas'
import type * as z from '$lib/forms/zod'
import type { Context } from '$lib/remote/authed.server'
import { requireRow } from '$lib/remote/require.server'
import { error } from '@sveltejs/kit'
import { and, count, eq, isNull } from 'drizzle-orm'
import { stampDeletedAt } from '../area/area.server'
import { createUpdateEvent } from '../event/event.server'
import { storedName } from '../event/storedName'
import { before, resolved } from '../merge/fields'
import { lockPair, repoint, repointLevel } from '../merge/repoint.server'
import { mergeRoutesSchema } from './dto'
import { linesOffBlock } from './move.server'
import { canDeleteRoute, canEditRoute } from './permissions'
import { recalcUserGradeAndRating } from './user-grade.server'

// Every field the person may choose, so a new one cannot be dropped here unnoticed.
const ROUTE_MERGE_FIELDS = Object.keys(mergeRoutesSchema.shape.values.shape) as (keyof z.output<
  typeof mergeRoutesSchema
>['values'])[]

type Plan = { source: Route; survivor: Route }

/** The caller's half: gates on both stored rows, the survivor's own fields, the event, the retirement. */
export async function planRouteMerge(
  { knownTopoLines, sourceId, survivorId, values }: z.output<typeof mergeRoutesSchema>,
  { db, user, userRegions }: Pick<Context, 'db' | 'user' | 'userRegions'>,
): Promise<Plan> {
  const live = (id: number) => () =>
    db.query.routes.findFirst({ where: and(eq(routes.id, id), isNull(routes.deletedAt)) })
  const source = await requireRow(
    live(sourceId),
    (row) => canDeleteRoute(userRegions, user.id, row),
    formError('routes_notFound'),
  )
  const survivor = await requireRow(
    live(survivorId),
    (row) => canEditRoute(userRegions, row) && row.regionFk === source.regionFk && row.id !== source.id,
    formError('routes_notFound'),
  )
  if (!(await lockPair(db, 'routes', source.id, survivor.id))) {
    error(409, formError('routes_notFound'))
  }
  const [{ lines }] = await db
    .select({ lines: count() })
    .from(topoRoutes)
    .where(linesOffBlock(db, [source.id], survivor.blockFk))
  if (lines !== knownTopoLines) {
    error(409, formError('merges_topoLinesChanged'))
  }

  const patch = resolved(survivor, source, ROUTE_MERGE_FIELDS, values) as Partial<Route>
  if (Object.keys(patch).length > 0)
    await db
      .update(routes)
      .set({
        description: patch.description,
        firstAscentYear: patch.firstAscentYear,
        gradeFk: patch.gradeFk,
        name: patch.name,
        rating: patch.rating,
      } satisfies Record<keyof typeof values, unknown>)
      .where(eq(routes.id, survivor.id))

  await createUpdateEvent(db, {
    actorFk: user.id,
    newEntity: { mergedFrom: storedName(source.name), ...patch },
    object: { id: survivor.id, type: 'route' },
    oldEntity: { mergedFrom: null, ...before(survivor, patch) },
    regionFk: survivor.regionFk,
  })
  await stampDeletedAt(db, { routeIds: [source.id] }, new Date(), null)
  await db.update(routes).set({ mergedInto: survivor.id }).where(eq(routes.id, source.id))

  return { source, survivor: { ...survivor, ...patch } }
}

/** The privileged half: everything other people attached to the source, now on the survivor. */
export async function repointRouteMerge(
  db: Context['db'],
  { source, survivor }: Plan,
  { afterCommit, user }: Pick<Context, 'afterCommit' | 'user'>,
) {
  // Lines on another block's topo trace rock the survivor is not on.
  await db.delete(topoRoutes).where(linesOffBlock(db, [source.id], survivor.blockFk))
  await repoint(db, 'topo_routes', 'route_fk', source.id, survivor.id, { key: ['topo_fk'] })
  await repoint(db, 'ascents', 'route_fk', source.id, survivor.id)
  await repoint(db, 'files', 'route_fk', source.id, survivor.id)
  await repoint(db, 'routes_to_tags', 'route_fk', source.id, survivor.id, { key: ['tag_fk'] })
  await repoint(db, 'routes_to_first_ascensionists', 'route_fk', source.id, survivor.id, {
    key: ['first_ascensionist_fk'],
  })
  // The survivor's external links win; the source's move over only when it has none.
  if (survivor.externalResourcesFk == null && source.externalResourcesFk != null) {
    await db
      .update(routeExternalResources)
      .set({ routeFk: survivor.id })
      .where(eq(routeExternalResources.id, source.externalResourcesFk))
    await db.update(routes).set({ externalResourcesFk: source.externalResourcesFk }).where(eq(routes.id, survivor.id))
    await db.update(routes).set({ externalResourcesFk: null }).where(eq(routes.id, source.id))
  }
  await repointLevel(db, 'routes', source.id, survivor, { afterCommit, user })
  await recalcUserGradeAndRating(db, survivor.id)
}
