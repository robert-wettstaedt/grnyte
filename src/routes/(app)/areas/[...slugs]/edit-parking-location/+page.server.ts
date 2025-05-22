import { checkRegionPermission, REGION_PERMISSION_DELETE, REGION_PERMISSION_EDIT } from '$lib/auth'
import { invalidateCache } from '$lib/cache/cache.server'
import { insertActivity } from '$lib/components/ActivityFeed/load.server'
import { config } from '$lib/config'
import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import { areas, geolocations } from '$lib/db/schema'
import { convertException } from '$lib/errors'
import { geolocationActionSchema, validateFormData } from '$lib/forms.server'
import { convertAreaSlug } from '$lib/helper.server'
import { error, fail, redirect, type ActionFailure } from '@sveltejs/kit'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import type { PageServerLoad } from './$types'

export const load = (async ({ locals, parent }) => {
  const rls = await createDrizzleSupabaseClient(locals.supabase)

  return await rls(async (db) => {
    // Retrieve the areaId from the parent function
    const { areaId } = await parent()

    // Query the database to find the area with the given areaId
    const areasResult = await db.query.areas.findMany({ where: eq(areas.id, areaId) })

    const area = areasResult.at(0)

    // If the area is not found, throw a 404 error
    if (
      area == null ||
      area.type === 'area' ||
      !checkRegionPermission(locals.userRegions, [REGION_PERMISSION_EDIT], area.regionFk)
    ) {
      error(404)
    }

    return area
  })
}) satisfies PageServerLoad

export const actions = {
  updateParkingLocation: async ({ locals, params, request }) => {
    const rls = await createDrizzleSupabaseClient(locals.supabase)

    const returnValue = await rls(async (db) => {
      if (locals.user == null) {
        return fail(404)
      }

      // Convert area slug to areaId
      const { areaId } = convertAreaSlug(params)

      // Retrieve form data from the request
      const data = await request.formData()
      let values: UpdateParkingLocationValues

      try {
        // Validate the form data
        values = await validateFormData(updateParkingLocationSchema, data)
      } catch (exception) {
        // If validation fails, return the exception as an AreaActionFailure
        return exception as ActionFailure<UpdateParkingLocationValues>
      }

      // Query the database to find the area with the given areaId
      const areasResult = await db.query.areas.findMany({ where: eq(areas.id, areaId) })
      const area = areasResult.at(0)

      // If the area is not found, throw a 404 error
      if (
        area == null ||
        area.type === 'area' ||
        !checkRegionPermission(locals.userRegions, [REGION_PERMISSION_EDIT], area.regionFk)
      ) {
        error(400, 'Area is not a crag')
      }

      try {
        await invalidateCache(config.cache.keys.layoutBlocks)

        if (values.lat != null && values.long != null) {
          await db.insert(geolocations).values({
            lat: values.lat,
            long: values.long,
            areaFk: area.id,
            regionFk: area.regionFk,
          })

          await insertActivity(db, {
            type: 'updated',
            userFk: locals.user.id,
            entityId: String(area.id),
            entityType: 'area',
            columnName: 'parking location',
            parentEntityId: String(area.parentFk),
            parentEntityType: 'area',
            regionFk: area.regionFk,
          })
        }

        if (values.polyline != null) {
          await db
            .update(areas)
            .set({ walkingPaths: [...(area.walkingPaths ?? []), values.polyline] })
            .where(eq(areas.id, area.id))

          await insertActivity(db, {
            type: 'updated',
            userFk: locals.user.id,
            entityId: String(area.id),
            entityType: 'area',
            columnName: 'walking paths',
            parentEntityId: String(area.parentFk),
            parentEntityType: 'area',
            regionFk: area.regionFk,
          })
        }
      } catch (exception) {
        // Handle any exceptions that occur during the update
        return fail(404, { ...values, error: convertException(exception) })
      }

      return `/areas/${params.slugs}`
    })

    if (typeof returnValue === 'string') {
      redirect(303, returnValue)
    }

    return returnValue
  },

  removeParkingLocation: async ({ locals, params }) => {
    const rls = await createDrizzleSupabaseClient(locals.supabase)

    const returnValue = await rls(async (db) => {
      if (locals.user == null) {
        return fail(404)
      }

      // Convert area slug to areaId
      const { areaId } = convertAreaSlug(params)

      // Query the database to find the area with the given areaId
      const areasResult = await db.query.areas.findMany({ where: eq(areas.id, areaId) })
      const area = areasResult.at(0)

      // If the area is not found, throw a 404 error
      if (area == null || !checkRegionPermission(locals.userRegions, [REGION_PERMISSION_DELETE], area.regionFk)) {
        error(404)
      }

      try {
        await invalidateCache(config.cache.keys.layoutBlocks)

        await db.delete(geolocations).where(eq(geolocations.areaFk, area.id))
        await db.update(areas).set({ walkingPaths: null }).where(eq(areas.id, area.id))

        await insertActivity(db, {
          type: 'deleted',
          userFk: locals.user.id,
          entityId: String(area.id),
          entityType: 'area',
          columnName: 'parking location',
          parentEntityId: String(area.parentFk),
          parentEntityType: 'area',
          regionFk: area.regionFk,
        })
      } catch (error) {
        return fail(404, { error: convertException(error) })
      }

      return `/areas/${params.slugs}`
    })

    if (typeof returnValue === 'string') {
      redirect(303, returnValue)
    }

    return returnValue
  },
}

const polylineActionSchema = z.object({
  polyline: z.string(),
})
export type PolylineActionValues = z.infer<typeof polylineActionSchema>

type UpdateParkingLocationValues = z.infer<typeof updateParkingLocationSchema>
const updateParkingLocationSchema = z.intersection(geolocationActionSchema.partial(), polylineActionSchema.partial())
