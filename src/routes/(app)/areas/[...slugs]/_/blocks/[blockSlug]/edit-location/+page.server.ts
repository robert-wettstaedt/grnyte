import { checkRegionPermission, REGION_PERMISSION_DELETE, REGION_PERMISSION_EDIT } from '$lib/auth'
import { caches, invalidateCache } from '$lib/cache/cache.server'
import { insertActivity } from '$lib/components/ActivityFeedLegacy/load.server'
import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import { blocks, geolocations } from '$lib/db/schema'
import { buildNestedAreaQuery, enrichBlock, type EnrichedBlock } from '$lib/db/utils'
import { convertException } from '$lib/errors'
import { geolocationActionSchema, type GeolocationActionValues } from '$lib/forms/schemas'
import { validateFormData } from '$lib/forms/validate.server'
import { convertAreaSlug } from '$lib/helper.server'
import { createOrUpdateGeolocation } from '$lib/topo-files.server'
import { error, fail, redirect, type ActionFailure } from '@sveltejs/kit'
import { and, eq } from 'drizzle-orm'
import type { PageServerLoad } from './$types'

export const load = (async ({ locals, params, parent }) => {
  const rls = await createDrizzleSupabaseClient(locals.supabase)

  return await rls(async (db) => {
    // Retrieve areaId and areaSlug from the parent function
    const { areaId, areaSlug } = await parent()

    // Query the database for blocks matching the given slug and areaId
    const blocksResult = await db.query.blocks.findMany({
      where: and(eq(blocks.slug, params.blockSlug), eq(blocks.areaFk, areaId)),
      with: {
        area: buildNestedAreaQuery(),
        geolocation: true,
      },
    })
    // Get the first block from the result
    const block = blocksResult.at(0)

    // If no block is found, throw a 404 error
    if (block == null) {
      error(404)
    }

    // If more than one block is found, throw a 400 error
    if (blocksResult.length > 1) {
      error(400, `Multiple blocks with slug ${params.blockSlug} in ${areaSlug} found`)
    }

    if (
      !checkRegionPermission(locals.userRegions, [REGION_PERMISSION_EDIT], block.regionFk) &&
      block.geolocationFk != null
    ) {
      error(404)
    }

    // Return the block and the enriched geolocation blocks
    return {
      block: enrichBlock(block as EnrichedBlock),
    }
  })
}) satisfies PageServerLoad

export const actions = {
  updateLocation: async ({ locals, params, request }) => {
    const rls = await createDrizzleSupabaseClient(locals.supabase)

    const returnValue = await rls(async (db) => {
      if (locals.user == null) {
        return fail(404)
      }

      // Convert area slug to areaId
      const { areaId } = convertAreaSlug(params)

      // Query the database for blocks matching the given slug and areaId
      const blocksResult = await db.query.blocks.findMany({
        where: and(eq(blocks.slug, params.blockSlug), eq(blocks.areaFk, areaId)),
      })
      // Get the first block from the result
      const block = blocksResult.at(0)

      if (
        block == null ||
        (!checkRegionPermission(locals.userRegions, [REGION_PERMISSION_EDIT], block.regionFk) &&
          block.geolocationFk != null)
      ) {
        return fail(404)
      }

      // Retrieve form data from the request
      const data = await request.formData()
      let values: GeolocationActionValues

      try {
        // Validate the form data
        values = await validateFormData(geolocationActionSchema, data)
      } catch (exception) {
        // If validation fails, return the exception as an AreaActionFailure
        return exception as ActionFailure<GeolocationActionValues>
      }

      try {
        await createOrUpdateGeolocation(db, block, { lat: values.lat, long: values.long, regionFk: block.regionFk })

        await insertActivity(db, {
          type: 'updated',
          userFk: locals.user.id,
          entityId: String(block.id),
          entityType: 'block',
          columnName: 'location',
          parentEntityId: String(block.areaFk),
          parentEntityType: 'area',
          regionFk: block.regionFk,
        })
      } catch (exception) {
        // Handle any exceptions that occur during the update
        return fail(404, { ...values, error: convertException(exception) })
      }

      // Redirect to the block's page after a successful update
      return `/areas/${params.slugs}/_/blocks/${params.blockSlug}`
    })

    if (typeof returnValue === 'string') {
      redirect(303, returnValue)
    }

    return returnValue
  },

  removeGeolocation: async ({ locals, params }) => {
    const rls = await createDrizzleSupabaseClient(locals.supabase)

    const returnValue = await rls(async (db) => {
      if (locals.user == null) {
        return fail(404)
      }

      // Convert area slug to areaId
      const { areaId } = convertAreaSlug(params)

      // Query the database for blocks matching the given slug and areaId
      const blocksResult = await db.query.blocks.findMany({
        where: and(eq(blocks.slug, params.blockSlug), eq(blocks.areaFk, areaId)),
      })
      // Get the first block from the result
      const block = blocksResult.at(0)

      // If no block is found, throw a 404 error
      if (block == null || !checkRegionPermission(locals.userRegions, [REGION_PERMISSION_DELETE], block.regionFk)) {
        return fail(404, { error: 'Block not found' })
      }

      try {
        // Update the block to remove the geolocation foreign key
        await db.update(blocks).set({ geolocationFk: null }).where(eq(blocks.id, block.id))

        // If the block has a geolocation, delete the geolocation record
        if (block.geolocationFk != null) {
          await db.delete(geolocations).where(eq(geolocations.id, block.geolocationFk!))
        }

        await insertActivity(db, {
          type: 'deleted',
          userFk: locals.user.id,
          entityId: String(block.id),
          entityType: 'block',
          columnName: 'location',
          parentEntityId: String(block.areaFk),
          parentEntityType: 'area',
          regionFk: block.regionFk,
        })

        // Invalidate cache after successful update
        await invalidateCache(caches.layoutBlocks)
      } catch (error) {
        return fail(400, { error: convertException(error) })
      }

      // Redirect to the block's page after a successful update
      return `/areas/${params.slugs}/_/blocks/${params.blockSlug}#map`
    })

    if (typeof returnValue === 'string') {
      redirect(303, returnValue)
    }

    return returnValue
  },
}
