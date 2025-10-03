import { command, form, getRequestEvent } from '$app/server'
import { checkRegionPermission, REGION_PERMISSION_EDIT } from '$lib/auth'
import { insertActivity } from '$lib/components/ActivityFeed/load.server'
import { blocks, geolocations } from '$lib/db/schema'
import { type Action, enhance, enhanceForm } from '$lib/forms/enhance.server'
import { stringToInt, stringToNumber } from '$lib/forms/schemas'
import { createOrUpdateGeolocation } from '$lib/topo-files.server'
import { error } from '@sveltejs/kit'
import { eq } from 'drizzle-orm'
import z from 'zod'

const geolocationActionSchema = z.object({
  blockId: stringToInt,
  lat: stringToNumber,
  long: stringToNumber,
})
type GeolocationActionValues = z.infer<typeof geolocationActionSchema>

export const updateLocation = form(geolocationActionSchema, (data) => enhanceForm(data, updateLocationAction))

export const deleteGeolocation = command(z.number(), (data) => enhance(data, deleteGeolocationAction))

const updateLocationAction: Action<GeolocationActionValues> = async (values, db, user) => {
  const { locals } = getRequestEvent()

  const block = await db.query.blocks.findFirst({
    where: (table, { eq }) => eq(table.id, values.blockId),
  })

  if (block == null) {
    error(404)
  }

  if (
    !checkRegionPermission(locals.userRegions, [REGION_PERMISSION_EDIT], block.regionFk) &&
    block.geolocationFk != null
  ) {
    error(401)
  }

  await createOrUpdateGeolocation(db, block, { lat: values.lat, long: values.long, regionFk: block.regionFk })

  await insertActivity(db, {
    type: 'updated',
    userFk: user.id,
    entityId: String(block.id),
    entityType: 'block',
    columnName: 'location',
    parentEntityId: String(block.areaFk),
    parentEntityType: 'area',
    regionFk: block.regionFk,
  })

  return ['', 'blocks', block.id].join('/')
}

const deleteGeolocationAction: Action<number> = async (blockId, db, user) => {
  const { locals } = getRequestEvent()

  const block = await db.query.blocks.findFirst({
    where: (table, { eq }) => eq(table.id, blockId),
  })

  if (block == null) {
    error(404)
  }

  if (
    !checkRegionPermission(locals.userRegions, [REGION_PERMISSION_EDIT], block.regionFk) &&
    block.geolocationFk != null
  ) {
    error(401)
  }

  // Update the block to remove the geolocation foreign key
  await db.update(blocks).set({ geolocationFk: null }).where(eq(blocks.id, block.id))

  // If the block has a geolocation, delete the geolocation record
  if (block.geolocationFk != null) {
    await db.delete(geolocations).where(eq(geolocations.id, block.geolocationFk!))
  }

  await insertActivity(db, {
    type: 'deleted',
    userFk: user.id,
    entityId: String(block.id),
    entityType: 'block',
    columnName: 'location',
    parentEntityId: String(block.areaFk),
    parentEntityType: 'area',
    regionFk: block.regionFk,
  })

  return ['', 'blocks', block.id].join('/')
}
