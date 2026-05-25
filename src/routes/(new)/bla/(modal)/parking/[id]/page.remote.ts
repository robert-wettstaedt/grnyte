import { resolve } from '$app/paths'
import { command, getRequestEvent } from '$app/server'
import { checkRegionPermission, REGION_PERMISSION_DELETE } from '$lib/auth'
import { insertActivity } from '$lib/components/ActivityFeed/load.server'
import { geolocations } from '$lib/db/schema'
import { enhance, type Action } from '$lib/forms/enhance.server'
import { error } from '@sveltejs/kit'
import { eq } from 'drizzle-orm'
import z from 'zod'

export const deleteGeolocation = command(z.number(), (id) => enhance(id, deleteGeolocationAction))

const deleteGeolocationAction: Action<number> = async (id, db, user) => {
  const { locals } = getRequestEvent()

  const geolocation = await db.query.geolocations.findFirst({ where: eq(geolocations.id, id), with: { area: true } })

  if (
    geolocation?.area == null ||
    !checkRegionPermission(locals.userRegions, [REGION_PERMISSION_DELETE], geolocation.area.regionFk)
  ) {
    error(404)
  }

  await db.delete(geolocations).where(eq(geolocations.id, id))

  await insertActivity(db, {
    type: 'deleted',
    userFk: user.id,
    entityId: String(geolocation.area.id),
    entityType: 'area',
    columnName: 'parking location',
    parentEntityId: geolocation.area.parentFk?.toString(),
    parentEntityType: 'area',
    regionFk: geolocation.area.regionFk,
  })

  return resolve('/(new)/bla/(modal)/areas/[id]', { id: geolocation.area.id.toString() })
}
