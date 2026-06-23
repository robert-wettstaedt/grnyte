import { resolve } from '$app/paths'
import { areas, geolocations, type Area } from '$lib/db/schema'
import { formError, stringToInt, stringToNumber } from '$lib/forms/schemas'
import { decodePath } from '$lib/map/polyline'
import { authedCommand, authedForm, type Context } from '$lib/remote/authed.server'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { error, invalid } from '@sveltejs/kit'
import { and, eq, isNull, not } from 'drizzle-orm'
import z from 'zod'
import { canAddArea, canAddParking, canDeleteParking, canEditArea } from './permissions'

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

  // TODO: add later when activities are implemented
  // await insertActivity(db, {
  //   type: 'created',
  //   userFk: user.id,
  //   entityId: String(createdArea.id),
  //   entityType: 'area',
  //   parentEntityId: createdArea.parentFk == null ? null : String(createdArea.parentFk),
  //   parentEntityType: 'area',
  //   regionFk: createdArea.regionFk,
  // })

  return { redirectTo: resolve('/(app)/areas/[id]', { id: createdArea.id.toString() }) }
})

export const updateArea = authedForm(areaActionSchema, async ({ id, ...value }, { db, userRegions }, issue) => {
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

  // await createUpdateActivity({
  //   db,
  //   entityId: String(area.id),
  //   entityType: 'area',
  //   newEntity: entity,
  //   oldEntity: area,
  //   userFk: user.id,
  //   parentEntityId: String(area.parentFk),
  //   parentEntityType: 'area',
  //   regionFk: area.regionFk,
  // })

  return { redirectTo: resolve('/(app)/areas/[id]', { id: area.id.toString() }) }
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
  async ({ areaId, lat, long, path }, { db, userRegions }) => {
    const area = await db.query.areas.findFirst({ where: eq(areas.id, areaId) })

    if (area == null || !canAddParking(userRegions, area)) {
      invalid(formError('form_noPermission'))
    }

    await createParking(db, area, { lat, long, path })

    // await insertActivity(db, {
    //   type: 'updated',
    //   userFk: user.id,
    //   entityId: String(area.id),
    //   entityType: 'area',
    //   columnName: 'parking location',
    //   parentEntityId: String(area.parentFk),
    //   parentEntityType: 'area',
    //   regionFk: area.regionFk,
    // })

    return { redirectTo: resolve('/(app)/(shell)/(map)/areas/[id]', { id: areaId.toString() }) }
  },
)

/** Remove a parking location. Needs edit permission in the parking's region. */
export const deleteParking = authedCommand(z.object({ id: z.number() }), async ({ id }, { db, userRegions }) => {
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

  // await insertActivity(db, {
  //   type: 'deleted',
  //   userFk: user.id,
  //   entityId: String(area.id),
  //   entityType: 'area',
  //   columnName: 'parking location',
  //   parentEntityId: String(area.parentFk),
  //   parentEntityType: 'area',
  //   regionFk: area.regionFk,
  // })

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

    // Activity seam (activities not implemented yet): undoing a delete should leave the
    // timeline as if it never happened — remove the 'deleted' activity the delete logged,
    // and (unlike addParking) do NOT log a new 'created' one. Wire up when activities land.
    // await deleteActivity(db, { entityId: String(areaId), entityType: 'area', type: 'deleted', columnName: 'parking location' })
  },
)
