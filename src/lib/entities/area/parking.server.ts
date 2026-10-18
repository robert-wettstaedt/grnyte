import { areas, geolocations, type Area } from '$lib/db/schema'
import { entityHref } from '$lib/entities/href'
import { formError, type FormMessage } from '$lib/forms/schemas'
import type * as z from '$lib/forms/zod'
import { stringifyCoords } from '$lib/map/coords'
import { decodePath } from '$lib/map/polyline'
import type { Context } from '$lib/remote/authed.server'
import type { MutationResult } from '$lib/remote/mutation'
import { error } from '@sveltejs/kit'
import { and, eq, isNull } from 'drizzle-orm'
import { deleteEvent, insertEvent } from '../event/event.server'
import type { addParkingSchema, restoreParkingSchema } from './dto'
import { canAddParking, canDeleteParking } from './permissions'

type Caller = Pick<Context, 'db' | 'user' | 'userRegions'>

/** Add a parking location (a geolocation row) to a sector-type area, optionally with
 *  an approach path (an encoded polyline appended to the area's `geoPaths`). */
export async function addParkingRow(
  { areaId, lat, long, path }: z.output<typeof addParkingSchema>,
  { db, user, userRegions }: Caller,
  refuse: (message: FormMessage) => never,
) {
  const area = await db.query.areas.findFirst({ where: and(eq(areas.id, areaId), isNull(areas.deletedAt)) })

  if (area == null) {
    refuse(formError('areas_notFound'))
  }
  if (!canAddParking(userRegions, area)) {
    refuse(formError('form_noPermission'))
  }

  await createParking(db, area, { lat, long, path })

  // An event with the coordinates in `metadata`, NOT a change row on the area. An area holds
  // several parkings and each one is its own thing added, not a field of the area moving from
  // one value to another: as a change they would all key on one column name, where
  // `changes_event_fk_column_name_idx` merges them into a single row and the second parking
  // erases the first. Metadata scopes the fold instead, so two parkings are two events.
  await insertEvent(db, {
    actorFk: user.id,
    metadata: stringifyCoords({ lat, long }),
    object: { id: area.id, type: 'area' },
    regionFk: area.regionFk,
    verb: 'add',
  })

  return { redirectTo: entityHref('areas', areaId) }
}

/** Remove a parking location. Needs delete permission in the parking's region (adding one
 *  takes edit, but removing one is destructive: see canDeleteParking). */
export async function deleteParkingRow(
  { id }: { id: number },
  { db, user, userRegions }: Caller,
): Promise<MutationResult<z.output<typeof restoreParkingSchema>>> {
  const parking = await db.query.geolocations.findFirst({ where: eq(geolocations.id, id) })

  // Guard against deleting a block's location through this route: only an
  // area-attached geolocation (areaFk set) is a parking.
  if (parking == null || parking.areaFk == null) {
    error(404, formError('parking_notFound'))
  }

  if (!canDeleteParking(userRegions, parking)) {
    error(403, formError('form_noPermission'))
  }

  // Both halves of the pair refuse on a cleared area, or this succeeds and its Undo cannot.
  const parentArea = await db.query.areas.findFirst({
    columns: { deletedAt: true },
    where: eq(areas.id, parking.areaFk),
  })
  if (parentArea == null || parentArea.deletedAt != null) {
    error(404, formError('areas_notFound'))
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
      return true // keep malformed entries: they aren't this parking's path
    }
    const matches = head != null && Math.abs(head[0] - parking.lat) <= 1e-4 && Math.abs(head[1] - parking.long) <= 1e-4
    if (matches && removedPath == null) removedPath = encoded
    return !matches
  })

  if (area != null && remaining.length !== geoPaths.length) {
    await db.update(areas).set({ geoPaths: remaining }).where(eq(areas.id, area.id))
  }

  // The coordinates in `metadata` for the same reason the add stores them there, plus one this
  // side only: the row that could answer where the parking was is gone by now.
  if (area != null) {
    await insertEvent(db, {
      actorFk: user.id,
      metadata: stringifyCoords(parking),
      object: { id: area.id, type: 'area' },
      regionFk: area.regionFk,
      verb: 'remove',
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
    redirectTo: entityHref('areas', parking.areaFk),
  }
}

/** Undo a {@link deleteParkingRow}: recreate the parking from the snapshot the delete answered. */
export async function restoreParkingRow(
  { areaId, lat, long, path }: z.output<typeof restoreParkingSchema>,
  { db, userRegions }: Pick<Context, 'db' | 'userRegions'>,
) {
  const area = await db.query.areas.findFirst({ where: and(eq(areas.id, areaId), isNull(areas.deletedAt)) })

  if (area == null) {
    error(404, formError('areas_notFound'))
  }
  if (!canAddParking(userRegions, area)) {
    error(403, formError('form_noPermission'))
  }

  await createParking(db, area, { lat, long, path })

  // Keyed on the coordinates rather than on who removed the parking: any admin's undo erases
  // the record, and an area's other parkings carry other coordinates and survive.
  await deleteEvent(db, {
    metadata: stringifyCoords({ lat, long }),
    object: { id: areaId, type: 'area' },
    regionFk: area.regionFk,
    verb: 'remove',
  })
}

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
