import { command, form, getRequestEvent } from '$app/server'
import { checkRegionPermission, REGION_PERMISSION_DELETE, REGION_PERMISSION_EDIT } from '$lib/auth'
import { insertActivity } from '$lib/components/ActivityFeed/load.server'
import { areas, geolocations } from '$lib/db/schema'
import { enhance, enhanceForm, type Action } from '$lib/forms/enhance.server'
import { stringToInt, stringToNumber } from '$lib/forms/schemas'
import { error } from '@sveltejs/kit'
import { eq } from 'drizzle-orm'
import z from 'zod'

const updateParkingLocationSchema = z.object({
  areaId: stringToInt,

  lat: stringToNumber.optional(),
  long: stringToNumber.optional(),

  polyline: z.string().optional(),
})
type UpdateParkingLocationActionValues = z.infer<typeof updateParkingLocationSchema>

export const updateParkingLocation = form(updateParkingLocationSchema, (data) =>
  enhanceForm(data, updateParkingLocationAction),
)

export const deleteParkingLocation = command(z.number(), (id) => enhance(id, deleteParkingLocationAction))

const updateParkingLocationAction: Action<UpdateParkingLocationActionValues> = async (values, db, user) => {
  const { locals } = getRequestEvent()

  const area = await db.query.areas.findFirst({ where: eq(areas.id, values.areaId) })

  // If the area is not found, throw a 404 error
  if (
    area == null ||
    area.type === 'area' ||
    !checkRegionPermission(locals.userRegions, [REGION_PERMISSION_EDIT], area.regionFk)
  ) {
    error(404)
  }

  if (values.lat != null && values.long != null) {
    await db.insert(geolocations).values({
      lat: values.lat,
      long: values.long,
      areaFk: area.id,
      regionFk: area.regionFk,
    })

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
  } else if (values.polyline != null) {
    await db
      .update(areas)
      .set({ geoPaths: [...(area.geoPaths ?? []), values.polyline] })
      .where(eq(areas.id, area.id))

    await insertActivity(db, {
      type: 'updated',
      userFk: user.id,
      entityId: String(area.id),
      entityType: 'area',
      columnName: 'walking paths',
      parentEntityId: String(area.parentFk),
      parentEntityType: 'area',
      regionFk: area.regionFk,
    })
  } else {
    error(400, 'No valid parking location data provided')
  }

  return ['', 'areas', area.id].join('/')
}

const deleteParkingLocationAction: Action<number> = async (areaId, db, user) => {
  const { locals } = getRequestEvent()

  // Query the database to find the area with the given areaId
  const area = await db.query.areas.findFirst({ where: eq(areas.id, areaId) })

  // If the area is not found, throw a 404 error
  if (area == null || !checkRegionPermission(locals.userRegions, [REGION_PERMISSION_DELETE], area.regionFk)) {
    error(404)
  }

  await db.delete(geolocations).where(eq(geolocations.areaFk, area.id))
  await db.update(areas).set({ geoPaths: null }).where(eq(areas.id, area.id))

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

  return ['', 'areas', area.id].join('/')
}
