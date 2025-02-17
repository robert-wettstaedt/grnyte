import { DELETE_PERMISSION, EDIT_PERMISSION } from '$lib/auth'
import { invalidateCache } from '$lib/cache.server'
import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import { activities, blocks, geolocations } from '$lib/db/schema'
import { buildNestedAreaQuery, enrichBlock, type EnrichedBlock } from '$lib/db/utils'
import { convertException } from '$lib/errors'
import { convertAreaSlug, getUser } from '$lib/helper.server'
import { createOrUpdateGeolocation } from '$lib/topo-files.server'
import { error, fail, redirect } from '@sveltejs/kit'
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

    if (!locals.userPermissions?.includes(EDIT_PERMISSION) && block.geolocationFk != null) {
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
      const user = await getUser(locals.user, db)
      if (user == null) {
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

      if (block == null || (!locals.userPermissions?.includes(EDIT_PERMISSION) && block.geolocationFk != null)) {
        return fail(404)
      }

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

      try {
        await createOrUpdateGeolocation(db, block, { lat, long })

        await db.insert(activities).values({
          type: 'updated',
          userFk: user.id,
          entityId: block.id,
          entityType: 'block',
          columnName: 'location',
          parentEntityId: block.areaFk,
          parentEntityType: 'area',
        })

        // Invalidate cache after successful update
        await invalidateCache('layout', 'blocks')
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

      // Query the database for blocks matching the given slug and areaId
      const blocksResult = await db.query.blocks.findMany({
        where: and(eq(blocks.slug, params.blockSlug), eq(blocks.areaFk, areaId)),
      })
      // Get the first block from the result
      const block = blocksResult.at(0)

      // If no block is found, throw a 404 error
      if (block == null) {
        return fail(404, { error: 'Block not found' })
      }

      try {
        // Update the block to remove the geolocation foreign key
        await db.update(blocks).set({ geolocationFk: null }).where(eq(blocks.id, block.id))

        // If the block has a geolocation, delete the geolocation record
        if (block.geolocationFk != null) {
          await db.delete(geolocations).where(eq(geolocations.id, block.geolocationFk!))
        }

        await db.insert(activities).values({
          type: 'deleted',
          userFk: user.id,
          entityId: block.id,
          entityType: 'block',
          columnName: 'location',
          parentEntityId: block.areaFk,
          parentEntityType: 'area',
        })

        // Invalidate cache after successful update
        await invalidateCache('layout', 'blocks')
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
