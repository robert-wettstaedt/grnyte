import { checkRegionPermission, REGION_PERMISSION_DELETE, REGION_PERMISSION_EDIT } from '$lib/auth'
import { caches, invalidateCache } from '$lib/cache/cache.server'
import { createUpdateActivity, insertActivity } from '$lib/components/ActivityFeedLegacy/load.server'
import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import { areas, generateSlug, geolocations } from '$lib/db/schema'
import { convertException } from '$lib/errors'
import { areaActionSchema, type ActionFailure, type AreaActionValues } from '$lib/forms/schemas'
import { validateFormData } from '$lib/forms/validate.server'
import { convertAreaSlug, deleteFiles } from '$lib/helper.server'
import { getReferences } from '$lib/references.server'
import { error, fail, redirect } from '@sveltejs/kit'
import { and, eq, isNull, not } from 'drizzle-orm'
import type { PageServerLoad } from './$types'

export const load = (async ({ locals, parent }) => {
  const rls = await createDrizzleSupabaseClient(locals.supabase)

  return await rls(async (db) => {
    // Retrieve the areaId from the parent function
    const { areaId } = await parent()

    // Query the database to find the area with the given areaId
    const area = await db.query.areas.findFirst({ where: eq(areas.id, areaId) })

    // If the area is not found, throw a 404 error
    if (area == null || !checkRegionPermission(locals.userRegions, [REGION_PERMISSION_EDIT], area.regionFk)) {
      error(404)
    }

    // Return the found area
    return area
  })
}) satisfies PageServerLoad

export const actions = {
  updateArea: async ({ locals, params, request }) => {
    const rls = await createDrizzleSupabaseClient(locals.supabase)

    const returnValue = await rls(async (db) => {
      // Convert the area slug to get the areaId
      const { areaId } = convertAreaSlug(params)

      if (locals.user == null) {
        return fail(404)
      }

      const area = await db.query.areas.findFirst({ where: eq(areas.id, areaId) })

      if (area == null || !checkRegionPermission(locals.userRegions, [REGION_PERMISSION_EDIT], area.regionFk)) {
        return fail(404)
      }

      // Retrieve form data from the request
      const data = await request.formData()
      let values: AreaActionValues

      try {
        // Validate the form data
        values = await validateFormData(areaActionSchema, data)
      } catch (exception) {
        // If validation fails, return the exception as an AreaActionFailure
        return exception as ActionFailure<AreaActionValues>
      }

      // Generate a slug from the area name
      const slug = generateSlug(values.name)

      // Check if an area with the same slug already exists
      const existingAreasResult = await db.query.areas.findMany({
        where: and(
          eq(areas.slug, slug),
          area.parentFk == null ? isNull(areas.parentFk) : eq(areas.parentFk, area.parentFk),
          not(eq(areas.id, areaId)),
        ),
      })

      if (existingAreasResult.length > 0) {
        // If an area with the same name exists, return a 400 error with a message
        return fail(400, { ...values, error: `Area with name "${existingAreasResult[0].name}" already exists` })
      }

      try {
        // Update the area in the database with the validated values
        await db
          .update(areas)
          .set({ ...values, slug })
          .where(eq(areas.id, areaId))

        await createUpdateActivity({
          db,
          entityId: String(areaId),
          entityType: 'area',
          newEntity: values,
          oldEntity: area,
          userFk: locals.user.id,
          parentEntityId: String(area.parentFk),
          parentEntityType: 'area',
          regionFk: area.regionFk,
        })

        // Invalidate cache after successful update
        await invalidateCache(caches.layoutBlocks)
      } catch (exception) {
        // If the update fails, return a 404 error with the exception details
        return fail(404, { ...values, error: convertException(exception) })
      }

      // Redirect to the updated area page
      return `/areas/${params.slugs}`
    })

    if (typeof returnValue === 'string') {
      redirect(303, returnValue)
    }

    return returnValue
  },

  removeArea: async ({ locals, params }) => {
    const rls = await createDrizzleSupabaseClient(locals.supabase)

    const returnValue = await rls(async (db) => {
      if (locals.user == null) {
        return fail(404)
      }

      // Convert area slug to areaId
      const { areaId } = convertAreaSlug(params)

      // Query the database to find the area with the given areaId
      const area = await db.query.areas.findFirst({
        where: eq(areas.id, areaId),
        with: {
          areas: true,
          blocks: true,
        },
      })

      if (area == null || !checkRegionPermission(locals.userRegions, [REGION_PERMISSION_DELETE], area.regionFk)) {
        error(404)
      }

      if (area.areas.length > 0) {
        return fail(400, { error: `${area.name} has ${area.areas.length} subareas. Delete subareas first.` })
      }

      if (area.blocks.length > 0) {
        return fail(400, { error: `${area.name} has ${area.blocks.length} blocks. Delete blocks first.` })
      }

      const references = await getReferences(area.id, 'areas')
      if (references.areas.length + references.ascents.length + references.routes.length > 0) {
        return fail(400, { error: 'Area is referenced by other entities. Delete references first.' })
      }

      try {
        await deleteFiles({ areaFk: area.id }, db)

        await db.delete(geolocations).where(eq(geolocations.areaFk, areaId))
        await db.update(areas).set({ parentFk: null }).where(eq(areas.parentFk, areaId))
        await db.delete(areas).where(eq(areas.id, areaId))
        await insertActivity(db, {
          type: 'deleted',
          userFk: locals.user.id,
          entityId: String(areaId),
          entityType: 'area',
          oldValue: area.name,
          parentEntityId: String(area.parentFk),
          parentEntityType: 'area',
          regionFk: area.regionFk,
        })

        // Invalidate cache after successful update
        await invalidateCache(caches.layoutBlocks)
      } catch (error) {
        return fail(404, { error: convertException(error) })
      }

      const slugs = params.slugs.split('/').slice(0, -1).join('/')
      return `/areas/${slugs}`
    })

    if (typeof returnValue === 'string') {
      redirect(303, returnValue)
    }

    return returnValue
  },
}
