import { resolve } from '$app/paths'
import {
  areas,
  ascents,
  blocks,
  files,
  routeExternalResource27crags,
  routeExternalResource8a,
  routeExternalResources,
  routeExternalResourceTheCrag,
  routes,
  routesToFirstAscensionists,
  routesToTags,
  topoRoutes,
  type Route,
} from '$lib/db/schema'
import { formError, stringToInt, stringToIntOptional } from '$lib/forms/schemas'
import { authedCommand, authedForm, type Context } from '$lib/remote/authed.server'
import type { MutationResult } from '$lib/remote/mutation'
import { requireRow, requireRowForm } from '$lib/remote/require.server'
import { error, invalid } from '@sveltejs/kit'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import z from 'zod'
import { createUpdateActivity, deleteActivity, insertActivity } from '../activity/activity.server'
import { regionTags } from '../region/tagVocabulary'
import { resolveFirstAscensionists } from './firstAscensionist.server'
import { canAddRoute, canDeleteRoute, canEditRoute } from './permissions'
import { recalcUserGradeAndRating } from './user-grade.server'

const faClimberSchema = z.object({
  name: z.string().trim().min(1),
  userFk: stringToIntOptional,
})

const routeActionSchema = z.object({
  blockId: stringToInt,
  description: z.string().optional().default(''),
  firstAscensionists: z.array(faClimberSchema).optional().default([]),
  firstAscentYear: stringToIntOptional.pipe(
    z.int().min(1900, formError('form_numInvalid')).max(2100, formError('form_numInvalid')).optional(),
  ),
  gradeFk: stringToIntOptional,
  id: stringToIntOptional,
  name: z.string().trim().optional().default(''),
  // 1–3 stars; the field is absent when unrated (0 stars → no rating, not "0 stars").
  rating: stringToIntOptional.pipe(z.int().min(1).max(3).optional()),
  tags: z.array(z.string()).optional().default([]),
})

/**
 * Drop tags a submission may not write. `routes_to_tags.tag_fk` has no foreign key any more (a
 * region owns its own vocabulary, see `regions.settings.tags`) and `routeActionSchema.tags` is free
 * text, so this is the only thing standing between a forged submission and an unknown string on a
 * route. Callers decide what `allowed` is, because the edit path also has to let through whatever
 * the route already carries.
 */
const allowedTags = (allowed: string[], submitted: string[]) => submitted.filter((tag) => allowed.includes(tag))

/** Field shape the shared add/edit-route form binds to, `id` is set only when editing. */
export type RouteFormInput = z.input<typeof routeActionSchema>
type RouteFormValue = z.output<typeof routeActionSchema>

/** The block's area chain from root to leaf, the denormalized `areaFks`/`areaIds` the
 *  route filters run on (`areaIds` is `^2$,^3$,^75$`-style tokens for exact ILIKE matches).
 *  ponytail: one query per ancestor, area trees are a handful of levels deep. */
async function areaAncestry(db: Context['db'], areaId: number): Promise<number[]> {
  const chain: number[] = []
  let current: null | number = areaId
  while (current != null && !chain.includes(current)) {
    chain.unshift(current)
    const area: undefined | { parentFk: null | number } = await db.query.areas.findFirst({
      columns: { parentFk: true },
      where: eq(areas.id, current),
    })
    current = area?.parentFk ?? null
  }
  return chain
}

/** A duplicate route name on the same block (blank names are fine, they render as
 *  "<no name>"), mirroring the block form's per-area check. */
async function findDuplicateName(
  db: Context['db'],
  value: Pick<RouteFormValue, 'name'>,
  blockFk: number,
  excludeId?: number,
): Promise<Route | undefined> {
  if (value.name.length === 0) {
    return undefined
  }
  return db.query.routes.findFirst({
    where: (table, { and, eq, isNull, ne }) =>
      and(
        eq(table.name, value.name),
        eq(table.blockFk, blockFk),
        isNull(table.deletedAt),
        ...(excludeId == null ? [] : [ne(table.id, excludeId)]),
      ),
  })
}

const routeHref = (id: number) => resolve('/(app)/routes/[id]', { id: String(id) })

/** Create a route under a block. Returns `{ id }` instead of redirecting so the form can
 *  finalize its background media uploads against the new route before navigating. */
export const createRoute = authedForm(routeActionSchema, async (value, { db, user, userRegions }, issue) => {
  const block = await db.query.blocks.findFirst({ where: eq(blocks.id, value.blockId) })

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
      description: value.description.length === 0 ? null : value.description,
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
    await db.insert(routesToTags).values(tags.map((tagFk) => ({ regionFk: block.regionFk, routeFk: route.id, tagFk })))
  }

  const resolvedFa = await resolveFirstAscensionists(db, value.firstAscensionists, block.regionFk, user.id)
  if (resolvedFa.length > 0) {
    await db
      .insert(routesToFirstAscensionists)
      .values(resolvedFa.map((fa) => ({ firstAscensionistFk: fa.id, regionFk: block.regionFk, routeFk: route.id })))
  }

  await insertActivity(db, {
    entityId: route.id,
    entityType: 'route',
    newValue: route.name,
    parentEntityId: block.id,
    parentEntityType: 'block',
    regionFk: block.regionFk,
    type: 'created',
    userFk: user.id,
  })

  return { data: { id: route.id } }
})

/** Edit a route. Reuses the create form (with `id` set). Any region member may edit the
 *  route itself; tag changes additionally need EDIT (their RLS is stricter). */
export const updateRoute = authedForm(routeActionSchema, async ({ id, ...value }, { db, user, userRegions }, issue) => {
  const route = await requireRowForm(
    () => (id == null ? Promise.resolve(undefined) : db.query.routes.findFirst({ where: eq(routes.id, id) })),
    (row) => canEditRoute(userRegions, row),
    formError('routes_notFound'),
  )

  const duplicate = await findDuplicateName(db, value, route.blockFk, route.id)
  if (duplicate != null) {
    invalid(issue.name(formError('routes_nameExists', { name: duplicate.name })))
  }

  const oldTagRows = await db.query.routesToTags.findMany({ where: eq(routesToTags.routeFk, route.id) })
  const oldTags = oldTagRows.map((row) => row.tagFk).sort()
  // `oldTags` joins the allowlist so an edit cannot strip a tag the region retired mid-session.
  const allowed = [...regionTags(userRegions, route.regionFk), ...oldTags]
  const newTags = [...new Set(allowedTags(allowed, value.tags))].sort()
  const tagsChanged = oldTags.join(',') !== newTags.join(',')

  await db
    .update(routes)
    .set({
      description: value.description.length === 0 ? null : value.description,
      firstAscentYear: value.firstAscentYear ?? null,
      gradeFk: value.gradeFk ?? null,
      name: value.name,
      rating: value.rating ?? null,
    })
    .where(eq(routes.id, route.id))

  // The route's own grade/rating is one of the community votes.
  await recalcUserGradeAndRating(db, route.id)

  if (tagsChanged) {
    const removed = oldTags.filter((tag) => !newTags.includes(tag))
    const added = newTags.filter((tag) => !oldTags.includes(tag))
    if (removed.length > 0) {
      await db.delete(routesToTags).where(and(eq(routesToTags.routeFk, route.id), inArray(routesToTags.tagFk, removed)))
    }
    if (added.length > 0) {
      await db
        .insert(routesToTags)
        .values(added.map((tagFk) => ({ regionFk: route.regionFk, routeFk: route.id, tagFk })))
    }
  }

  const oldFaRows = await db.query.routesToFirstAscensionists.findMany({
    where: eq(routesToFirstAscensionists.routeFk, route.id),
    with: { firstAscensionist: true },
  })
  const newFaRows = await resolveFirstAscensionists(db, value.firstAscensionists, route.regionFk, user.id)
  const removedFa = oldFaRows.filter((row) => !newFaRows.some((fa) => fa.id === row.firstAscensionistFk))
  const addedFa = newFaRows.filter((fa) => !oldFaRows.some((row) => row.firstAscensionistFk === fa.id))
  if (removedFa.length > 0) {
    await db.delete(routesToFirstAscensionists).where(
      inArray(
        routesToFirstAscensionists.id,
        removedFa.map((row) => row.id),
      ),
    )
  }
  if (addedFa.length > 0) {
    await db
      .insert(routesToFirstAscensionists)
      .values(addedFa.map((fa) => ({ firstAscensionistFk: fa.id, regionFk: route.regionFk, routeFk: route.id })))
  }

  await createUpdateActivity({
    db,
    entityId: route.id,
    entityType: 'route',
    newEntity: {
      description: value.description,
      firstAscensionists: newFaRows
        .map((fa) => fa.name)
        .sort()
        .join(','),
      firstAscentYear: value.firstAscentYear,
      gradeFk: value.gradeFk,
      name: value.name,
      rating: value.rating,
      tags: newTags.join(','),
    },
    oldEntity: {
      description: route.description ?? '',
      firstAscensionists: oldFaRows
        .map((row) => row.firstAscensionist.name)
        .sort()
        .join(','),
      firstAscentYear: route.firstAscentYear,
      gradeFk: route.gradeFk,
      name: route.name,
      rating: route.rating,
      tags: oldTags.join(','),
    },
    parentEntityId: route.blockFk,
    parentEntityType: 'block',
    regionFk: route.regionFk,
    userFk: user.id,
  })

  return { data: { id: route.id } }
})

/** Snapshot {@link deleteRoute} returns so {@link restoreRoute} can undo either delete path. */
type DeleteRouteSnapshot =
  | {
      firstAscensionistFks: number[]
      mode: 'hard'
      route: Pick<
        Route,
        | 'areaFks'
        | 'areaIds'
        | 'blockFk'
        | 'createdBy'
        | 'description'
        | 'firstAscentYear'
        | 'gradeFk'
        | 'name'
        | 'rating'
        | 'regionFk'
      >
      routeId: number
      tags: string[]
    }
  | { mode: 'soft'; routeId: number }

/** Delete a route. A bare route (no ascents, files or topo lines) is hard-deleted with a
 *  snapshot; one with dependents is soft-deleted so undo restores them cleanly. */
export const deleteRoute = authedCommand(
  z.object({ id: z.number() }),
  async ({ id }, { db, user, userRegions }): Promise<MutationResult<DeleteRouteSnapshot>> => {
    const route = await requireRow(
      () => db.query.routes.findFirst({ where: eq(routes.id, id) }),
      (row) => canDeleteRoute(userRegions, user.id, row),
      'Route not found',
    )

    // Ascents/files/topo lines FK-reference the route; with any of them present the route
    // is soft-deleted (and the hard delete never hits a FK constraint).
    const [ascent, file, topoRoute] = await Promise.all([
      db.query.ascents.findFirst({ columns: { id: true }, where: eq(ascents.routeFk, id) }),
      db.query.files.findFirst({ columns: { id: true }, where: eq(files.routeFk, id) }),
      db.query.topoRoutes.findFirst({ columns: { id: true }, where: eq(topoRoutes.routeFk, id) }),
    ])

    let data: DeleteRouteSnapshot
    if (ascent == null && file == null && topoRoute == null) {
      const tagRows = await db.query.routesToTags.findMany({ where: eq(routesToTags.routeFk, id) })
      const faRows = await db.query.routesToFirstAscensionists.findMany({
        where: eq(routesToFirstAscensionists.routeFk, id),
      })
      await db.delete(routesToTags).where(eq(routesToTags.routeFk, id))
      await db.delete(routesToFirstAscensionists).where(eq(routesToFirstAscensionists.routeFk, id))

      // External resources are scraped from the providers, so they're deleted without a
      // snapshot (a restored route just re-syncs them). The circular FKs (route ↔ resources
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

      data = {
        firstAscensionistFks: faRows.map((row) => row.firstAscensionistFk),
        mode: 'hard',
        route: {
          areaFks: route.areaFks,
          areaIds: route.areaIds,
          blockFk: route.blockFk,
          createdBy: route.createdBy,
          description: route.description,
          firstAscentYear: route.firstAscentYear,
          gradeFk: route.gradeFk,
          name: route.name,
          rating: route.rating,
          regionFk: route.regionFk,
        },
        routeId: id,
        tags: tagRows.map((row) => row.tagFk),
      }
    } else {
      await db
        .update(routes)
        .set({ deletedAt: new Date() })
        .where(and(eq(routes.id, id), isNull(routes.deletedAt)))
      data = { mode: 'soft', routeId: id }
    }

    await insertActivity(db, {
      entityId: route.id,
      entityType: 'route',
      oldValue: route.name,
      parentEntityId: route.blockFk,
      parentEntityType: 'block',
      regionFk: route.regionFk,
      type: 'deleted',
      userFk: user.id,
    })

    return {
      data,
      redirectTo: resolve('/(app)/(shell)/(explore)/(map)/blocks/[id]', { id: String(route.blockFk) }),
    }
  },
)

const restoreRouteSchema = z.discriminatedUnion('mode', [
  z.object({
    firstAscensionistFks: z.array(z.number()),
    mode: z.literal('hard'),
    route: z.object({
      areaFks: z.array(z.number()).nullable(),
      areaIds: z.string().nullable(),
      blockFk: z.number(),
      createdBy: z.number(),
      description: z.string().nullable(),
      firstAscentYear: z.number().nullable(),
      gradeFk: z.number().nullable(),
      name: z.string(),
      rating: z.number().nullable(),
      regionFk: z.number(),
    }),
    routeId: z.number(),
    tags: z.array(z.string()),
  }),
  z.object({ mode: z.literal('soft'), routeId: z.number() }),
])

/** Undo a {@link deleteRoute}: recreate the hard-deleted route (with its tag and first-ascent
 *  links) or clear the soft delete's `deletedAt`, and remove the 'deleted' activity. */
export const restoreRoute = authedCommand(restoreRouteSchema, async (snapshot, { db, user, userRegions }) => {
  if (snapshot.mode === 'hard') {
    // The snapshot is client-supplied, so mirror createRoute rather than inserting it verbatim:
    // derive the region and area chain from the actual block, override authorship, and recompute the
    // areaFks/areaIds filter tokens. Otherwise a DELETE holder could restore a route with forged
    // createdBy into another region's block, with poisoned search tokens.
    const block = await db.query.blocks.findFirst({ where: eq(blocks.id, snapshot.route.blockFk) })
    if (block == null) {
      error(404, formError('blocks_notFound'))
    }
    // A hard restore inserts a brand new row, so it is a create and gates like one (see createRoute).
    // Gating on canDeleteRoute instead would deny the undo to the EDITor who just deleted their own
    // route: the snapshot carries no `createdBy`, so that predicate's own-created branch can't fire.
    if (!canAddRoute(userRegions, block)) {
      error(403, formError('form_noPermission'))
    }

    const areaFks = await areaAncestry(db, block.areaFk)

    const [created] = await db
      .insert(routes)
      .values({
        areaFks,
        areaIds: areaFks.map((id) => `^${id}$`).join(','),
        blockFk: block.id,
        createdBy: user.id,
        description: snapshot.route.description,
        firstAscentYear: snapshot.route.firstAscentYear,
        gradeFk: snapshot.route.gradeFk,
        name: snapshot.route.name,
        rating: snapshot.route.rating,
        regionFk: block.regionFk,
      })
      .returning()
    await recalcUserGradeAndRating(db, created.id)

    // The vocabulary alone, unlike the edit path above: this snapshot went out to the client and
    // came back, so a route restored after its region retired one of its tags comes back without
    // that tag rather than carrying a string in no vocabulary.
    const restoredTags = allowedTags(regionTags(userRegions, created.regionFk), snapshot.tags)
    if (restoredTags.length > 0) {
      await db
        .insert(routesToTags)
        .values(restoredTags.map((tagFk) => ({ regionFk: created.regionFk, routeFk: created.id, tagFk })))
    }
    if (snapshot.firstAscensionistFks.length > 0) {
      await db.insert(routesToFirstAscensionists).values(
        snapshot.firstAscensionistFks.map((firstAscensionistFk) => ({
          firstAscensionistFk,
          regionFk: created.regionFk,
          routeFk: created.id,
        })),
      )
    }

    await deleteActivity(db, { columnName: null, entityId: snapshot.routeId, entityType: 'route', type: 'deleted' })

    return { data: { routeId: created.id }, redirectTo: routeHref(created.id) }
  }

  const route = await db.query.routes.findFirst({ where: eq(routes.id, snapshot.routeId) })

  if (route == null || !canDeleteRoute(userRegions, user.id, route)) {
    error(403, formError('form_noPermission'))
  }

  await db.update(routes).set({ deletedAt: null }).where(eq(routes.id, route.id))
  await deleteActivity(db, { columnName: null, entityId: route.id, entityType: 'route', type: 'deleted' })

  return { data: { routeId: route.id }, redirectTo: routeHref(route.id) }
})
