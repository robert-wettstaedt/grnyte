import { resolve } from '$app/paths'
import { areaTypeEnum, areas, blocks, files, geolocations, routes, type Area } from '$lib/db/schema'
import { formError, stringToInt, stringToNumber } from '$lib/forms/schemas'
import { decodePath } from '$lib/map/polyline'
import { authedCommand, authedForm, type Context } from '$lib/remote/authed.server'
import type { MutationResult } from '$lib/remote/mutation'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { error, invalid } from '@sveltejs/kit'
import { and, eq, inArray, isNull, not } from 'drizzle-orm'
import z from 'zod'
import { createUpdateActivity, deleteActivity, insertActivity } from '../activity/activity.server'
import { canAddArea, canAddParking, canDeleteArea, canDeleteParking, canEditArea } from './permissions'

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
  const parentArea =
    value.parentFk == null ? undefined : await db.query.areas.findFirst({ where: eq(areas.id, value.parentFk) })

  if (value.parentFk != null && parentArea == null) {
    invalid(formError('area_parentNotFound'))
  }

  if (
    !canAddArea(userRegions, { ...value, type: null }) ||
    (parentArea != null && !canAddArea(userRegions, parentArea))
  ) {
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
    await db.update(areas).set({ type: 'area' }).where(eq(areas.id, value.parentFk))
  }

  await insertActivity(db, {
    type: 'created',
    userFk: user.id,
    entityId: String(createdArea.id),
    entityType: 'area',
    parentEntityId: createdArea.parentFk == null ? null : String(createdArea.parentFk),
    parentEntityType: 'area',
    regionFk: createdArea.regionFk,
  })

  return { redirectTo: resolve('/(app)/areas/[id]', { id: createdArea.id.toString() }) }
})

export const updateArea = authedForm(areaActionSchema, async ({ id, ...value }, { db, user, userRegions }, issue) => {
  const area = id == null ? undefined : await db.query.areas.findFirst({ where: eq(areas.id, id) })

  if (area == null) {
    invalid(formError('area_parentNotFound'))
  }

  if (!canEditArea(userRegions, { ...value, type: null })) {
    invalid(formError('form_noPermission'))
  }

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
    entityId: String(area.id),
    entityType: 'area',
    newEntity: value,
    oldEntity: area,
    userFk: user.id,
    parentEntityId: String(area.parentFk),
    parentEntityType: 'area',
    regionFk: area.regionFk,
  })

  return { redirectTo: resolve('/(app)/areas/[id]', { id: area.id.toString() }) }
})

/** Snapshot {@link deleteArea} returns so {@link restoreArea} can undo either delete path. */
type DeleteAreaSnapshot =
  | {
      mode: 'hard'
      areaId: number
      area: Pick<Area, 'name' | 'description' | 'type' | 'regionFk' | 'parentFk' | 'walkingPaths' | 'geoPaths'>
      parking: { lat: number; long: number }[]
    }
  | { mode: 'soft'; areaId: number; deletedAt: Date }

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

/** Delete an area. A leaf area (no sub-areas, blocks or files) is hard-deleted; anything
 *  with descendants is soft-deleted across the whole subtree. Returns the snapshot
 *  {@link restoreArea} needs to undo either path. */
export const deleteArea = authedCommand(
  z.object({ id: z.number() }),
  async ({ id }, { db, user, userRegions }): Promise<MutationResult<DeleteAreaSnapshot>> => {
    const area = await db.query.areas.findFirst({ where: eq(areas.id, id) })

    if (area == null) {
      error(404, 'Area not found')
    }

    if (!canDeleteArea(userRegions, area)) {
      error(403, formError('form_noPermission'))
    }

    // Sub-areas and blocks are the spec's "children"; files are folded in because they
    // FK-reference the area and can't be recreated on undo — an area with files is
    // soft-deleted rather than hard-deleted so nothing is lost.
    const [subArea, block, file] = await Promise.all([
      db.query.areas.findFirst({ columns: { id: true }, where: eq(areas.parentFk, id) }),
      db.query.blocks.findFirst({ columns: { id: true }, where: eq(blocks.areaFk, id) }),
      db.query.files.findFirst({ columns: { id: true }, where: eq(files.areaFk, id) }),
    ])

    const logDeleted = () =>
      insertActivity(db, {
        type: 'deleted',
        userFk: user.id,
        entityId: String(area.id),
        entityType: 'area',
        parentEntityId: area.parentFk == null ? null : String(area.parentFk),
        parentEntityType: 'area',
        regionFk: area.regionFk,
      })

    const redirectTo =
      area.parentFk == null
        ? resolve('/explore')
        : resolve('/(app)/(shell)/(map)/areas/[id]', { id: String(area.parentFk) })

    if (subArea == null && block == null && file == null) {
      // Hard delete a leaf area. Its parking geolocations FK-block the row delete, so remove
      // them first and snapshot them for undo; the area's own fields recreate it.
      const parking = await db.query.geolocations.findMany({ where: eq(geolocations.areaFk, id) })
      await db.delete(geolocations).where(eq(geolocations.areaFk, id))
      await db.delete(areas).where(eq(areas.id, id))
      await logDeleted()

      const data: DeleteAreaSnapshot = {
        mode: 'hard',
        areaId: id,
        area: {
          name: area.name,
          description: area.description,
          type: area.type,
          regionFk: area.regionFk,
          parentFk: area.parentFk,
          walkingPaths: area.walkingPaths,
          geoPaths: area.geoPaths,
        },
        parking: parking.map(({ lat, long }) => ({ lat, long })),
      }

      return { redirectTo, data }
    }

    // Soft delete: stamp one `deletedAt` across the subtree (area + descendant areas, their
    // blocks, those blocks' routes). The shared timestamp is the restore key. Only touch
    // rows not already deleted, so restore won't resurrect independently-deleted ones.
    // ponytail: timestamp as restore key; sub-ms collision with a concurrent delete is the
    // ceiling. Upgrade = a dedicated deletion-batch id column.
    const areaIds = await collectAreaSubtreeIds(db, id)
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
    await logDeleted()

    const data: DeleteAreaSnapshot = { mode: 'soft', areaId: id, deletedAt }

    return { redirectTo, data }
  },
)

const restoreAreaSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('hard'),
    areaId: z.number(),
    area: z.object({
      name: z.string(),
      description: z.string().nullable().optional(),
      type: z.enum(areaTypeEnum).nullable().optional(),
      regionFk: z.number(),
      parentFk: z.number().nullable().optional(),
      walkingPaths: z.array(z.string()).nullable().optional(),
      geoPaths: z.array(z.string()).nullable().optional(),
    }),
    parking: z.array(z.object({ lat: z.number(), long: z.number() })),
  }),
  z.object({ mode: z.literal('soft'), areaId: z.number(), deletedAt: z.coerce.date() }),
])

/** Undo a {@link deleteArea}: recreate the hard-deleted area (with its parking), or clear
 *  the `deletedAt` the soft delete stamped across the subtree. Either way, remove the
 *  'deleted' activity the delete logged so the timeline reads as if it never happened. */
export const restoreArea = authedCommand(restoreAreaSchema, async (snapshot, { db, user, userRegions }) => {
  if (snapshot.mode === 'hard') {
    const { area, parking } = snapshot

    if (!canDeleteArea(userRegions, { regionFk: area.regionFk, type: area.type ?? null })) {
      error(403, formError('form_noPermission'))
    }

    const [created] = await db
      .insert(areas)
      .values({ ...area, createdBy: user.id })
      .returning()

    if (parking.length > 0) {
      await db
        .insert(geolocations)
        .values(parking.map(({ lat, long }) => ({ lat, long, areaFk: created.id, regionFk: created.regionFk })))
    }

    await deleteActivity(db, { entityId: String(snapshot.areaId), entityType: 'area', type: 'deleted' })

    return {
      redirectTo: resolve('/(app)/(shell)/(map)/areas/[id]', { id: String(created.id) }),
      data: { areaId: created.id },
    }
  }

  const area = await db.query.areas.findFirst({ where: eq(areas.id, snapshot.areaId) })

  if (area == null || !canDeleteArea(userRegions, area)) {
    error(403, formError('form_noPermission'))
  }

  await db.update(areas).set({ deletedAt: null }).where(eq(areas.deletedAt, snapshot.deletedAt))
  await db.update(blocks).set({ deletedAt: null }).where(eq(blocks.deletedAt, snapshot.deletedAt))
  await db.update(routes).set({ deletedAt: null }).where(eq(routes.deletedAt, snapshot.deletedAt))

  await deleteActivity(db, { entityId: String(snapshot.areaId), entityType: 'area', type: 'deleted' })

  return {
    redirectTo: resolve('/(app)/(shell)/(map)/areas/[id]', { id: String(snapshot.areaId) }),
    data: { areaId: snapshot.areaId },
  }
})

/** A decimal-degree coordinate field bounded to ±`limit` (90 for lat, 180 for long). */
const coordinate = (limit: number) =>
  stringToNumber.pipe(
    z
      .number()
      .min(-limit, { error: formError('form_numInvalid') })
      .max(limit, { error: formError('form_numInvalid') }),
  )

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
      type: 'updated',
      userFk: user.id,
      entityId: String(area.id),
      entityType: 'area',
      columnName: 'parking location',
      parentEntityId: String(area.parentFk),
      parentEntityType: 'area',
      regionFk: area.regionFk,
    })

    return { redirectTo: resolve('/(app)/(shell)/(map)/areas/[id]', { id: areaId.toString() }) }
  },
)

/** Remove a parking location. Needs edit permission in the parking's region. */
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
      type: 'deleted',
      userFk: user.id,
      entityId: String(area.id),
      entityType: 'area',
      columnName: 'parking location',
      parentEntityId: String(area.parentFk),
      parentEntityType: 'area',
      regionFk: area.regionFk,
    })
  }

  // Back to the area, plus a snapshot (the envelope's `data`) to recreate the parking on Undo.
  return {
    redirectTo: resolve('/(app)/(shell)/(map)/areas/[id]', { id: String(parking.areaFk) }),
    data: {
      areaId: parking.areaFk,
      lat: parking.lat,
      long: parking.long,
      path: removedPath,
    },
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
      entityId: String(areaId),
      entityType: 'area',
      type: 'deleted',
      columnName: 'parking location',
    })
  },
)
