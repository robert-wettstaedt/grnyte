import { blocks, routes, routesToFirstAscensionists, routesToTags, type Route } from '$lib/db/schema'
import { entityHref } from '$lib/entities/href'
import { blank, formError, type FormMessage } from '$lib/forms/schemas'
import type { Context } from '$lib/remote/authed.server'
import { requireRowForm } from '$lib/remote/require.server'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { areaAncestry } from '../area/area.server'
import { createUpdateEvent, insertEvent } from '../event/event.server'
import { notifyMentions } from '../notification/notification.server'
import { regionTags } from '../region/tagVocabulary'
import type { RouteFormValue } from './dto'
import { routeListsFingerprint } from './fingerprint'
import { resolveFirstAscensionists } from './firstAscensionist.server'
import { canAddRoute, canEditRoute } from './permissions'
import { recalcUserGradeAndRating } from './user-grade.server'

export type Refuse = (message: FormMessage, field?: 'name') => never

/**
 * Drop tags a submission may not write. `routes_to_tags.tag_fk` has no foreign key any more (a
 * region owns its own vocabulary, see `regions.settings.tags`) and `routeActionSchema.tags` is free
 * text, so this is the only thing standing between a forged submission and an unknown string on a
 * route. Callers decide what `allowed` is, because the edit path also has to let through whatever
 * the route already carries.
 */
export const allowedTags = (allowed: string[], submitted: string[]) => submitted.filter((tag) => allowed.includes(tag))

/** Create a route under a block. Answers `{ id }`: the form needs it to finalize its uploads. */
export async function createRouteRow(
  value: RouteFormValue,
  { afterCommit, db, user, userRegions }: Pick<Context, 'afterCommit' | 'db' | 'user' | 'userRegions'>,
  refuse: Refuse,
) {
  const block = await db.query.blocks.findFirst({
    where: and(eq(blocks.id, value.blockId), isNull(blocks.deletedAt)),
  })

  if (block == null) {
    refuse(formError('blocks_notFound'))
  }

  if (!canAddRoute(userRegions, block)) {
    refuse(formError('form_noPermission'))
  }

  const duplicate = await findDuplicateName(db, value, block.id)
  if (duplicate != null) {
    refuse(formError('routes_nameExists', { name: duplicate.name }), 'name')
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
    await db.insert(routesToTags).values(tags.map((tagFk) => ({ regionFk: block.regionFk, routeFk: route.id, tagFk })))
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
}

/** A duplicate route name on the same block (blank names are fine, they render as
 *  `common_unnamed`), mirroring the block form's per-area check. */
export async function findDuplicateName(
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

export async function updateRouteRow(
  { id, ...value }: RouteFormValue,
  { afterCommit, db, user, userRegions }: Pick<Context, 'afterCommit' | 'db' | 'user' | 'userRegions'>,
  refuse: Refuse,
) {
  const route = await requireRowForm(
    () =>
      id == null
        ? Promise.resolve(undefined)
        : db.query.routes.findFirst({ where: and(eq(routes.id, id), isNull(routes.deletedAt)) }),
    (row) => canEditRoute(userRegions, row),
    formError('routes_notFound'),
  )

  const duplicate = await findDuplicateName(db, value, route.blockFk, route.id)
  if (duplicate != null) {
    refuse(formError('routes_nameExists', { name: duplicate.name }), 'name')
  }

  const oldTagRows = await db.query.routesToTags.findMany({ where: eq(routesToTags.routeFk, route.id) })
  const oldTags = oldTagRows.map((row) => row.tagFk).sort()
  // `oldTags` joins the allowlist so an edit cannot strip a tag the region retired mid-session.
  const allowed = [...regionTags(userRegions, route.regionFk), ...oldTags]
  const newTags = [...new Set(allowedTags(allowed, value.tags))].sort()
  const tagsChanged = oldTags.join(',') !== newTags.join(',')

  const oldFaRows = await db.query.routesToFirstAscensionists.findMany({
    where: eq(routesToFirstAscensionists.routeFk, route.id),
    with: { firstAscensionist: true },
  })

  // A replacement, not a patch: both list diffs drop whatever the submit omits, so it has to
  // prove which lists it replaces. Read before the first write.
  const stored = routeListsFingerprint(
    oldTags,
    oldFaRows.map((row) => ({ name: row.firstAscensionist.name, userFk: row.firstAscensionist.userFk ?? undefined })),
  )
  if (value.known !== stored) {
    refuse(formError('routes_listsStale'))
  }

  await db
    .update(routes)
    .set({
      description: blank(value.description),
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

  await createUpdateEvent(db, {
    actorFk: user.id,
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
    object: { id: route.id, type: 'route' },
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
    regionFk: route.regionFk,
  })

  afterCommit(() =>
    notifyMentions({
      actorFk: user.id,
      body: value.description,
      object: { id: route.id, type: 'route' },
      previousBody: route.description,
      regionFk: route.regionFk,
    }),
  )

  return { data: { id: route.id }, redirectTo: entityHref('routes', route.id) }
}
