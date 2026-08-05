import { resolve } from '$app/paths'
import { areas, areaTypeEnum, blocks, files, geolocations, routes, type Area } from '$lib/db/schema'
import { coordinate, formError, stringToInt } from '$lib/forms/schemas'
import { stringifyCoords } from '$lib/map/coords'
import { decodePath } from '$lib/map/polyline'
import { authedCommand, authedForm, type Context } from '$lib/remote/authed.server'
import type { MutationResult } from '$lib/remote/mutation'
import { requireRow } from '$lib/remote/require.server'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { error, invalid } from '@sveltejs/kit'
import { and, eq, inArray, isNull, not } from 'drizzle-orm'
import z from 'zod'
import {
  createUpdateActivity,
  deleteActivity,
  insertActivity,
  reassignActivityEntity,
} from '../activity/activity.server'
import { stringifyDeletionScale } from '../activity/verbs'
import { refreshAreaType } from './area.server'
import { loadParentArea, requireEditableArea } from './guards.server'
import { canAddArea, canAddParking, canDeleteArea, canDeleteParking } from './permissions'

const areaActionSchema = z.object({
  description: z.string().optional().default(''),
  id: stringToInt.optional(),
  name: z
    .string({ error: formError('form_required') })
    .trim()
    .min(3, { error: formError('form_charsMin', { count: 3 }) }),
  parentFk: stringToInt.optional(),
  regionFk: stringToInt,
})

/** Field shape the shared area form (`AreaFormFields`) binds to — same for create and edit. */
export type AreaFormInput = StandardSchemaV1.InferInput<typeof areaActionSchema>

export const createArea = authedForm(areaActionSchema, async (value, { db, user, userRegions }, issue) => {
  const { parent: parentArea, status } = await loadParentArea(db, value.parentFk, value.regionFk)

  if (status === 'missing') {
    invalid(formError('areas_parentNotFound'))
  }

  if (
    !canAddArea(userRegions, { ...value, type: null }) ||
    (parentArea != null && !canAddArea(userRegions, parentArea))
  ) {
    invalid(formError('form_noPermission'))
  }

  // A child must live in its parent's region; otherwise it could be created in region A
  // under a parent in region B, where B can neither see nor moderate it.
  if (status === 'wrongRegion') {
    invalid(formError('form_noPermission'))
  }

  const existingAreasResult = await db.query.areas.findMany({
    where: and(
      eq(areas.name, value.name),
      parentArea == null ? eq(areas.regionFk, value.regionFk) : eq(areas.parentFk, parentArea.id),
    ),
  })

  if (existingAreasResult.length > 0) {
    invalid(issue.name(formError('areas_nameExists', { name: existingAreasResult[0].name })))
  }

  const [createdArea] = await db
    .insert(areas)
    .values({ ...value, createdBy: user.id, id: undefined, type: null })
    .returning()

  if (value.parentFk != null) {
    await refreshAreaType(db, value.parentFk)
  }

  await insertActivity(db, {
    entityId: createdArea.id,
    entityType: 'area',
    // The name the feed falls back to once the area itself is gone (`tombstone` in `verbs.ts`).
    newValue: createdArea.name,
    parentEntityId: createdArea.parentFk,
    parentEntityType: 'area',
    regionFk: createdArea.regionFk,
    type: 'created',
    userFk: user.id,
  })

  return { redirectTo: resolve('/(app)/areas/[id]', { id: createdArea.id.toString() }) }
})

export const updateArea = authedForm(areaActionSchema, async ({ id, ...value }, { db, user, userRegions }, issue) => {
  const area = await requireEditableArea(db, userRegions, id)

  const existingAreasResult = await db.query.areas.findMany({
    where: and(
      eq(areas.name, value.name),
      area.parentFk == null ? isNull(areas.parentFk) : eq(areas.parentFk, area.parentFk),
      not(eq(areas.id, area.id)),
    ),
  })

  if (existingAreasResult.length > 0) {
    invalid(issue.name(formError('areas_nameExists', { name: existingAreasResult[0].name })))
  }

  await db
    .update(areas)
    .set({ ...value, id: area.id })
    .where(eq(areas.id, area.id))

  await createUpdateActivity({
    db,
    entityId: area.id,
    entityType: 'area',
    newEntity: { description: value.description, name: value.name },
    oldEntity: { description: area.description, name: area.name },
    parentEntityId: area.parentFk,
    parentEntityType: 'area',
    regionFk: area.regionFk,
    userFk: user.id,
  })

  return { redirectTo: resolve('/(app)/areas/[id]', { id: area.id.toString() }) }
})

/** Snapshot {@link deleteArea} returns so {@link restoreArea} can undo either delete path. */
type DeleteAreaSnapshot =
  | {
      area: Pick<Area, 'description' | 'geoPaths' | 'name' | 'parentFk' | 'regionFk' | 'type' | 'walkingPaths'>
      areaId: number
      mode: 'hard'
      parking: { lat: number; long: number }[]
    }
  | { areaId: number; deletedAt: Date; mode: 'soft' }

/** Collect `rootId` and every area transitively nested beneath it (via `parentFk`).
 *  Cycle-safe; a level-by-level loop is plenty for the shallow area trees we have. */
async function collectAreaSubtreeIds(db: Context['db'], rootId: number): Promise<number[]> {
  const ids = [rootId]
  let frontier = [rootId]

  while (frontier.length > 0) {
    const children = await db.query.areas.findMany({ columns: { id: true }, where: inArray(areas.parentFk, frontier) })
    frontier = children.map((child) => child.id).filter((id) => !ids.includes(id))
    ids.push(...frontier)
  }

  return ids
}

/** Hard-delete a leaf area. Its parking geolocations FK-block the row delete, so remove them
 *  first and snapshot them for undo; the area's own fields recreate it. */
async function hardDeleteArea(db: Context['db'], area: Area): Promise<DeleteAreaSnapshot> {
  const parking = await db.query.geolocations.findMany({ where: eq(geolocations.areaFk, area.id) })
  await db.delete(geolocations).where(eq(geolocations.areaFk, area.id))
  await db.delete(areas).where(eq(areas.id, area.id))

  return {
    area: {
      description: area.description,
      geoPaths: area.geoPaths,
      name: area.name,
      parentFk: area.parentFk,
      regionFk: area.regionFk,
      type: area.type,
      walkingPaths: area.walkingPaths,
    },
    areaId: area.id,
    mode: 'hard',
    parking: parking.map(({ lat, long }) => ({ lat, long })),
  }
}

/** Soft-delete an area with descendants: stamp one `deletedAt` across the subtree (area +
 *  descendant areas, their blocks, those blocks' routes). The shared timestamp is the restore
 *  key. Only touch rows not already deleted, so restore won't resurrect independently-deleted
 *  ones. ponytail: timestamp as restore key; sub-ms collision with a concurrent delete is the
 *  ceiling. Upgrade = a dedicated deletion-batch id column. */
async function softDeleteArea(db: Context['db'], area: Area): Promise<DeleteAreaSnapshot> {
  const areaIds = await collectAreaSubtreeIds(db, area.id)
  const blockRows = await db.query.blocks.findMany({ columns: { id: true }, where: inArray(blocks.areaFk, areaIds) })
  const blockIds = blockRows.map((row) => row.id)
  const deletedAt = new Date()

  await db
    .update(areas)
    .set({ deletedAt })
    .where(and(inArray(areas.id, areaIds), isNull(areas.deletedAt)))
  if (blockIds.length > 0) {
    await db
      .update(blocks)
      .set({ deletedAt })
      .where(and(inArray(blocks.id, blockIds), isNull(blocks.deletedAt)))
    await db
      .update(routes)
      .set({ deletedAt })
      .where(and(inArray(routes.blockFk, blockIds), isNull(routes.deletedAt)))
  }

  return { areaId: area.id, deletedAt, mode: 'soft' }
}

/** Delete an area. A leaf area (no sub-areas, blocks or files) is hard-deleted; anything
 *  with descendants is soft-deleted across the whole subtree. Returns the snapshot
 *  {@link restoreArea} needs to undo either path. */
export const deleteArea = authedCommand(
  z.object({ id: z.number() }),
  async ({ id }, { db, user, userRegions }): Promise<MutationResult<DeleteAreaSnapshot>> => {
    const area = await requireRow(
      () => db.query.areas.findFirst({ where: eq(areas.id, id) }),
      (row) => canDeleteArea(userRegions, user.id, row),
      'Area not found',
    )

    // Sub-areas and blocks are the spec's "children"; files are folded in because they
    // FK-reference the area and can't be recreated on undo — an area with files is
    // soft-deleted rather than hard-deleted so nothing is lost.
    // The whole subtree, not just the direct children: deleting a crag takes its blocks and
    // their routes with it, and after the delete none of it is left to count. The existence
    // checks below fall out of the same numbers.
    const areaIds = await collectAreaSubtreeIds(db, id)
    const [blockRows, file] = await Promise.all([
      db.query.blocks.findMany({ columns: { id: true }, where: inArray(blocks.areaFk, areaIds) }),
      db.query.files.findFirst({ columns: { id: true }, where: eq(files.areaFk, id) }),
    ])
    const routeRows =
      blockRows.length === 0
        ? []
        : await db.query.routes.findMany({
            columns: { id: true },
            where: inArray(
              routes.blockFk,
              blockRows.map((row) => row.id),
            ),
          })

    const data =
      areaIds.length === 1 && blockRows.length === 0 && file == null
        ? await hardDeleteArea(db, area)
        : await softDeleteArea(db, area)

    await insertActivity(db, {
      entityId: area.id,
      entityType: 'area',
      // What went with it, recorded while it is still knowable.
      metadata: stringifyDeletionScale({
        areas: areaIds.length - 1,
        blocks: blockRows.length,
        routes: routeRows.length,
      }),
      // The only name the feed will ever have for it: the row is about to be unreachable.
      oldValue: area.name,
      parentEntityId: area.parentFk,
      parentEntityType: 'area',
      regionFk: area.regionFk,
      type: 'deleted',
      userFk: user.id,
    })
    if (area.parentFk != null) await refreshAreaType(db, area.parentFk)

    const redirectTo =
      area.parentFk == null
        ? resolve('/explore')
        : resolve('/(app)/(shell)/(explore)/(map)/areas/[id]', { id: String(area.parentFk) })

    return { data, redirectTo }
  },
)

const restoreAreaSchema = z.discriminatedUnion('mode', [
  z.object({
    area: z.object({
      description: z.string().nullable().optional(),
      geoPaths: z.array(z.string()).nullable().optional(),
      name: z.string(),
      parentFk: z.number().nullable().optional(),
      regionFk: z.number(),
      type: z.enum(areaTypeEnum).nullable().optional(),
      walkingPaths: z.array(z.string()).nullable().optional(),
    }),
    areaId: z.number(),
    mode: z.literal('hard'),
    parking: z.array(z.object({ lat: z.number(), long: z.number() })),
  }),
  z.object({ areaId: z.number(), deletedAt: z.coerce.date(), mode: z.literal('soft') }),
])

/** What {@link restoreArea} receives — the parsed snapshot, whose optional/nullable area fields
 *  differ from {@link DeleteAreaSnapshot}, so the restore helpers key off this. */
type RestoreAreaSnapshot = z.infer<typeof restoreAreaSchema>

/** Recreate a hard-deleted area with its parking. Returns the new row (its `parentFk` drives
 *  the parent's type refresh). */
async function hardRestoreArea(
  db: Context['db'],
  snapshot: Extract<RestoreAreaSnapshot, { mode: 'hard' }>,
  createdBy: number,
): Promise<Area> {
  const [created] = await db
    .insert(areas)
    .values({ ...snapshot.area, createdBy })
    .returning()

  if (snapshot.parking.length > 0) {
    await db
      .insert(geolocations)
      .values(snapshot.parking.map(({ lat, long }) => ({ areaFk: created.id, lat, long, regionFk: created.regionFk })))
  }

  return created
}

/** Clear the `deletedAt` the soft delete stamped across the subtree (matched by the shared
 *  timestamp), un-hiding the area, its descendant areas, blocks and routes together. */
async function softRestoreArea(
  db: Context['db'],
  snapshot: Extract<RestoreAreaSnapshot, { mode: 'soft' }>,
): Promise<void> {
  await db.update(areas).set({ deletedAt: null }).where(eq(areas.deletedAt, snapshot.deletedAt))
  await db.update(blocks).set({ deletedAt: null }).where(eq(blocks.deletedAt, snapshot.deletedAt))
  await db.update(routes).set({ deletedAt: null }).where(eq(routes.deletedAt, snapshot.deletedAt))
}

/** Undo a {@link deleteArea}: recreate the hard-deleted area (with its parking), or clear
 *  the `deletedAt` the soft delete stamped across the subtree. Either way, remove the
 *  'deleted' activity the delete logged so the timeline reads as if it never happened. */
export const restoreArea = authedCommand(restoreAreaSchema, async (snapshot, { db, user, userRegions }) => {
  if (snapshot.mode === 'hard') {
    // The snapshot came from the client, so re-validate its structural placement the way createArea
    // does - otherwise a DELETE holder could restore an area claiming their region but nested under a
    // parent in another region, which that region can neither see nor moderate.
    const { parent: parentArea, status } = await loadParentArea(db, snapshot.area.parentFk, snapshot.area.regionFk)

    if (status === 'missing') {
      error(404, formError('areas_parentNotFound'))
    }
    if (status === 'wrongRegion') {
      error(403, formError('form_noPermission'))
    }
    // A hard restore inserts a brand new row, so it is a create and gates like one. Gating on
    // canDeleteArea instead would deny the undo to the EDITor who just deleted their own area:
    // the snapshot carries no `createdBy`, so that predicate's own-created branch can never fire.
    if (
      !canAddArea(userRegions, { regionFk: snapshot.area.regionFk, type: null }) ||
      (parentArea != null && !canAddArea(userRegions, parentArea))
    ) {
      error(403, formError('form_noPermission'))
    }

    const created = await hardRestoreArea(db, snapshot, user.id)

    if (created.parentFk != null) await refreshAreaType(db, created.parentFk)
    await deleteActivity(db, { columnName: null, entityId: snapshot.areaId, entityType: 'area', type: 'deleted' })
    // The row is new, so the history has to follow it, or the restored area's own create card
    // and every edit ever made to it render as tombstones next to the live area.
    await reassignActivityEntity(db, { entityType: 'area', fromId: snapshot.areaId, toId: created.id })

    return {
      data: { areaId: created.id },
      redirectTo: resolve('/(app)/(shell)/(explore)/(map)/areas/[id]', { id: String(created.id) }),
    }
  }

  const area = await db.query.areas.findFirst({ where: eq(areas.id, snapshot.areaId) })

  if (area == null || !canDeleteArea(userRegions, user.id, area)) {
    error(403, formError('form_noPermission'))
  }

  await softRestoreArea(db, snapshot)

  if (area.parentFk != null) await refreshAreaType(db, area.parentFk)
  await deleteActivity(db, { columnName: null, entityId: snapshot.areaId, entityType: 'area', type: 'deleted' })

  return {
    data: { areaId: snapshot.areaId },
    redirectTo: resolve('/(app)/(shell)/(explore)/(map)/areas/[id]', { id: String(snapshot.areaId) }),
  }
})

/** Insert a parking geolocation on `area`, appending its optional approach path to the
 *  area's `geoPaths`. Shared by `addParking` and the undo path (`restoreParking`). */
async function createParking(
  db: Context['db'],
  area: Area,
  { lat, long, path }: { lat: number; long: number; path?: string },
) {
  await db.insert(geolocations).values({ areaFk: area.id, lat, long, regionFk: area.regionFk })

  if (path != null && path.length > 0) {
    await db
      .update(areas)
      .set({ geoPaths: [...(area.geoPaths ?? []), path] })
      .where(eq(areas.id, area.id))
  }
}

/** Add a parking location (a geolocation row) to a crag-type area, optionally with
 *  an approach path (an encoded polyline appended to the area's `geoPaths`). */
export const addParking = authedForm(
  z.object({ areaId: stringToInt, lat: coordinate(90), long: coordinate(180), path: z.string().optional() }),
  async ({ areaId, lat, long, path }, { db, user, userRegions }) => {
    const area = await db.query.areas.findFirst({ where: eq(areas.id, areaId) })

    if (area == null || !canAddParking(userRegions, area)) {
      invalid(formError('form_noPermission'))
    }

    await createParking(db, area, { lat, long, path })

    await insertActivity(db, {
      columnName: 'parking location',
      entityId: area.id,
      entityType: 'area',
      newValue: stringifyCoords({ lat, long }),
      parentEntityId: area.parentFk,
      parentEntityType: 'area',
      regionFk: area.regionFk,
      type: 'updated',
      userFk: user.id,
    })

    return { redirectTo: resolve('/(app)/(shell)/(explore)/(map)/areas/[id]', { id: areaId.toString() }) }
  },
)

/** Remove a parking location. Needs delete permission in the parking's region (adding one
 *  takes edit, but removing one is destructive - see canDeleteParking). */
export const deleteParking = authedCommand(z.object({ id: z.number() }), async ({ id }, { db, user, userRegions }) => {
  const parking = await db.query.geolocations.findFirst({ where: eq(geolocations.id, id) })

  // Guard against deleting a block's location through this route: only an
  // area-attached geolocation (areaFk set) is a parking.
  if (parking == null || parking.areaFk == null) {
    error(404, 'Parking not found')
  }

  if (!canDeleteParking(userRegions, parking)) {
    error(403, formError('form_noPermission'))
  }

  await db.delete(geolocations).where(eq(geolocations.id, id))

  // The approach path drawn from this parking was seeded at its coordinates, so its
  // first point identifies it in the area's flat `geoPaths` array. Drop that entry,
  // capturing it so `restoreParking` can put it back on undo.
  // ponytail: ~11m head match; nearby parkings can collide. Upgrade = link path↔parking.
  const area = await db.query.areas.findFirst({ where: eq(areas.id, parking.areaFk) })
  const geoPaths = area?.geoPaths ?? []
  let removedPath: string | undefined
  const remaining = geoPaths.filter((encoded) => {
    let head: [number, number] | undefined
    try {
      head = decodePath(encoded)[0]
    } catch {
      return true // keep malformed entries — they aren't this parking's path
    }
    const matches = head != null && Math.abs(head[0] - parking.lat) <= 1e-4 && Math.abs(head[1] - parking.long) <= 1e-4
    if (matches && removedPath == null) removedPath = encoded
    return !matches
  })

  if (area != null && remaining.length !== geoPaths.length) {
    await db.update(areas).set({ geoPaths: remaining }).where(eq(areas.id, area.id))
  }

  if (area != null) {
    await insertActivity(db, {
      columnName: 'parking location',
      entityId: area.id,
      entityType: 'area',
      oldValue: stringifyCoords(parking),
      parentEntityId: area.parentFk,
      parentEntityType: 'area',
      regionFk: area.regionFk,
      type: 'deleted',
      userFk: user.id,
    })
  }

  // Back to the area, plus a snapshot (the envelope's `data`) to recreate the parking on Undo.
  return {
    data: {
      areaId: parking.areaFk,
      lat: parking.lat,
      long: parking.long,
      path: removedPath,
    },
    redirectTo: resolve('/(app)/(shell)/(explore)/(map)/areas/[id]', { id: String(parking.areaFk) }),
  }
})

/** Undo a {@link deleteParking}: recreate the parking from the snapshot the delete returned. */
export const restoreParking = authedCommand(
  z.object({ areaId: z.number(), lat: z.number(), long: z.number(), path: z.string().optional() }),
  async ({ areaId, lat, long, path }, { db, userRegions }) => {
    const area = await db.query.areas.findFirst({ where: eq(areas.id, areaId) })

    if (area == null || !canAddParking(userRegions, area)) {
      error(403, formError('form_noPermission'))
    }

    await createParking(db, area, { lat, long, path })

    await deleteActivity(db, {
      columnName: 'parking location',
      entityId: areaId,
      entityType: 'area',
      type: 'deleted',
    })
  },
)
