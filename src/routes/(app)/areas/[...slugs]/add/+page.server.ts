import { checkRegionPermission, REGION_PERMISSION_EDIT } from '$lib/auth'
import { caches, invalidateCache } from '$lib/cache/cache.server'
import { insertActivity } from '$lib/components/ActivityFeed/load.server'
import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import { areas, generateSlug, users, type Area } from '$lib/db/schema'
import { convertException } from '$lib/errors'
import { areaActionSchema, validateFormData, type ActionFailure, type AreaActionValues } from '$lib/forms.server'
import { convertAreaSlug } from '$lib/helper.server'
import { error, fail, redirect } from '@sveltejs/kit'
import { and, eq } from 'drizzle-orm'
import type { PageServerLoad } from './$types'

export const load = (async ({ locals, parent }) => {
  const rls = await createDrizzleSupabaseClient(locals.supabase)

  return await rls(async (db) => {
    // Retrieve areaId and canAddArea from the parent function
    const { areaId, canAddArea } = await parent()

    // If the maximum depth for adding areas is reached, throw a 400 error
    if (!canAddArea) {
      error(400, 'Max depth reached')
    }

    // Query the database to find the parent area by areaId
    const parentAreaResult = await db.query.areas.findFirst({ where: eq(areas.id, areaId) })

    if (
      parentAreaResult == null ||
      !checkRegionPermission(locals.userRegions, [REGION_PERMISSION_EDIT], parentAreaResult.regionFk)
    ) {
      error(404)
    }

    // Return the parent area result
    return {
      parent: parentAreaResult,
    }
  })
}) satisfies PageServerLoad

export const actions = {
  default: async ({ locals, params, request }) => {
    const rls = await createDrizzleSupabaseClient(locals.supabase)

    const returnValue = await rls(async (db) => {
      if (locals.session == null) {
        error(404)
      }

      // Get the form data from the request
      const data = await request.formData()
      let values: AreaActionValues

      try {
        values = await validateFormData(areaActionSchema, data)
      } catch (exception) {
        return exception as ActionFailure<AreaActionValues>
      }

      let parentArea: Area | undefined
      let path: string[]
      try {
        // Convert the area slug from the parameters
        const { areaId, path: areaPath } = convertAreaSlug(params)
        // Find the parent area in the database
        parentArea = await db.query.areas.findFirst({ where: eq(areas.id, areaId) })
        path = areaPath
      } catch (error) {
        // If an error occurs, set parentArea to undefined and path to an empty array
        parentArea = undefined
        path = []
      }

      if (
        parentArea == null ||
        !checkRegionPermission(locals.userRegions, [REGION_PERMISSION_EDIT], parentArea.regionFk)
      ) {
        error(404)
      }

      // Generate a slug from the area name
      const slug = generateSlug(values.name)

      // Check if an area with the same slug already exists
      const existingAreasResult = await db.query.areas.findMany({
        where: and(eq(areas.slug, slug), eq(areas.parentFk, parentArea.id)),
      })

      if (existingAreasResult.length > 0) {
        // If an area with the same name exists, return a 400 error with a message
        return fail(400, { ...values, error: `Area with name "${existingAreasResult[0].name}" already exists` })
      }

      let createdArea: Area
      try {
        // Find the user in the database by email
        const user = await db.query.users.findFirst({ where: eq(users.authUserFk, locals.session.user.id) })
        if (user == null) {
          throw new Error('User not found')
        }

        // Insert the new area into the database
        createdArea = (
          await db
            .insert(areas)
            .values({ ...values, createdBy: user.id, parentFk: parentArea.id, regionFk: parentArea.regionFk, slug })
            .returning()
        )[0]

        await insertActivity(db, {
          type: 'created',
          userFk: user.id,
          entityId: String(createdArea.id),
          entityType: 'area',
          parentEntityId: parentArea.id == null ? null : String(parentArea.id),
          parentEntityType: 'area',
          regionFk: createdArea.regionFk,
        })

        // Invalidate cache after successful update
        await invalidateCache(caches.layoutBlocks)
      } catch (exception) {
        // If an error occurs during insertion, return a 400 error with the exception message
        return fail(400, { ...values, error: convertException(exception) })
      }

      // Construct the merged path for the new area
      return ['', 'areas', ...path, `${slug}-${createdArea?.id}`].join('/')
    })

    if (typeof returnValue === 'string') {
      redirect(303, returnValue)
    }

    return returnValue
  },
}
