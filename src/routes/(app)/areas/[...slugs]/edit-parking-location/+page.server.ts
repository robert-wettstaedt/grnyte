import { DELETE_PERMISSION, EDIT_PERMISSION } from '$lib/auth'
import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import { activities, areas, geolocations } from '$lib/db/schema'
import { convertException } from '$lib/errors'
import { convertAreaSlug, getUser } from '$lib/helper.server'
import { error, fail, redirect } from '@sveltejs/kit'
import { eq } from 'drizzle-orm'
import type { PageServerLoad } from './$types'

export const load = (async ({ locals, parent }) => {
  if (!locals.userPermissions?.includes(EDIT_PERMISSION)) {
    error(404)
  }

  const rls = await createDrizzleSupabaseClient(locals.supabase)

  return await rls(async (db) => {
    // Retrieve the areaId from the parent function
    const { areaId } = await parent()

    // Query the database to find the area with the given areaId
    const areasResult = await db.query.areas.findMany({ where: eq(areas.id, areaId) })

    const area = areasResult.at(0)

    // If the area is not found, throw a 404 error
    if (area == null || area.type === 'area') {
      error(404)
    }

    return area
  })
}) satisfies PageServerLoad

export const actions = {
  updateParkingLocation: async ({ locals, params, request }) => {
    if (!locals.userPermissions?.includes(EDIT_PERMISSION)) {
      error(404)
    }

    const rls = await createDrizzleSupabaseClient(locals.supabase)

    const returnValue = await rls(async (db) => {
      const user = await getUser(locals.user, db)
      if (user == null) {
        return fail(404)
      }

      // Convert area slug to areaId
      const { areaId } = convertAreaSlug(params)

      // Retrieve form data from the request
      const data = await request.formData()

      // Extract latitude and longitude from the form data
      const rawLat = data.get('lat')
      const rawLong = data.get('long')

      // Store the raw latitude and longitude values
      const values = { lat: rawLat, long: rawLong }

      // Validate the latitude value
      if (typeof rawLat !== 'string' || rawLat.length === 0) {
        return fail(400, { ...values, error: 'lat is required' })
      }

      // Validate the longitude value
      if (typeof rawLong !== 'string' || rawLong.length === 0) {
        return fail(400, { ...values, error: 'long is required' })
      }

      // Convert latitude and longitude to numbers
      const lat = Number(rawLat)
      const long = Number(rawLong)

      // Check if the latitude is a valid number
      if (Number.isNaN(lat)) {
        return fail(400, { ...values, error: 'lat is not a valid Latitude' })
      }

      // Check if the longitude is a valid number
      if (Number.isNaN(long)) {
        return fail(400, { ...values, error: 'long is not a valid Longitude' })
      }

      // Query the database to find the area with the given areaId
      const areasResult = await db.query.areas.findMany({ where: eq(areas.id, areaId) })
      const area = areasResult.at(0)

      // If the area is not found, throw a 404 error
      if (area == null || area.type === 'area') {
        error(400, 'Area is not a crag')
      }

      try {
        await db.insert(geolocations).values({ lat, long, areaFk: area.id })
        await db.insert(activities).values({
          type: 'updated',
          userFk: user.id,
          entityId: area.id,
          entityType: 'area',
          columnName: 'parking location',
          parentEntityId: area.parentFk,
          parentEntityType: 'area',
        })
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
    if (!locals.userPermissions?.includes(EDIT_PERMISSION) || !locals.userPermissions?.includes(DELETE_PERMISSION)) {
      error(404)
    }

    const rls = await createDrizzleSupabaseClient(locals.supabase)

    const returnValue = await rls(async (db) => {
      const user = await getUser(locals.user, db)
      if (user == null) {
        return fail(404)
      }

      // Convert area slug to areaId
      const { areaId } = convertAreaSlug(params)

      // Query the database to find the area with the given areaId
      const areasResult = await db.query.areas.findMany({ where: eq(areas.id, areaId) })
      const area = areasResult.at(0)

      // If the area is not found, throw a 404 error
      if (area == null) {
        error(404)
      }

      try {
        await db.delete(geolocations).where(eq(geolocations.areaFk, area.id))
        await db.insert(activities).values({
          type: 'deleted',
          userFk: user.id,
          entityId: area.id,
          entityType: 'area',
          columnName: 'parking location',
          parentEntityId: area.parentFk,
          parentEntityType: 'area',
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
