import { checkRegionPermission, REGION_PERMISSION_DELETE, REGION_PERMISSION_EDIT } from '$lib/auth'
import { caches, invalidateCache } from '$lib/cache/cache.server'
import { createUpdateActivity, insertActivity } from '$lib/components/ActivityFeedLegacy/load.server'
import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import { blocks, generateSlug, geolocations, topoRoutes, topos } from '$lib/db/schema'
import { convertException } from '$lib/errors'
import { blockActionSchema, type ActionFailure, type BlockActionValues } from '$lib/forms/schemas'
import { validateFormData } from '$lib/forms/validate.server'
import { convertAreaSlug, deleteFiles } from '$lib/helper.server'
import { getReferences } from '$lib/references.server'
import { error, fail, redirect } from '@sveltejs/kit'
import { and, eq, inArray } from 'drizzle-orm'
import type { PageServerLoad } from './$types'

export const load = (async ({ locals, params, parent }) => {
  const rls = await createDrizzleSupabaseClient(locals.supabase)

  return await rls(async (db) => {
    // Retrieve areaId and areaSlug from the parent function
    const { areaId, areaSlug } = await parent()

    // Query the database to find blocks matching the provided slug and areaId
    const blocksResult = await db.query.blocks.findMany({
      where: and(eq(blocks.slug, params.blockSlug), eq(blocks.areaFk, areaId)),
    })
    const block = blocksResult.at(0) // Get the first block from the result

    // If no block is found, return a 404 error
    if (block == null || !checkRegionPermission(locals.userRegions, [REGION_PERMISSION_EDIT], block.regionFk)) {
      error(404) // Not Found error
    }

    // If multiple blocks are found, return a 400 error with a message
    if (blocksResult.length > 1) {
      error(400, `Multiple blocks with slug ${params.blockSlug} in ${areaSlug} found`) // Bad Request error
    }

    // Return the block name to be used in the page
    return {
      name: block.name,
      regionFk: block.regionFk,
    }
  })
}) satisfies PageServerLoad

export const actions = {
  updateBlock: async ({ locals, params, request }) => {
    const rls = await createDrizzleSupabaseClient(locals.supabase)

    const returnValue = await rls(async (db) => {
      if (locals.user == null) {
        return fail(404)
      }

      // Convert the area slug to get the areaId
      const { areaId, areaSlug } = convertAreaSlug(params)

      const block = await db.query.blocks.findFirst({
        where: and(eq(blocks.slug, params.blockSlug), eq(blocks.areaFk, areaId)),
      })

      if (block == null) {
        error(404)
      }

      // Retrieve form data from the request
      const data = await request.formData()
      let values: BlockActionValues

      try {
        // Validate the form data
        values = await validateFormData(blockActionSchema, data)
      } catch (exception) {
        // If validation fails, return the exception as BlockActionFailure
        return exception as ActionFailure<BlockActionValues>
      }

      const slug = generateSlug(values.name)

      // Check if a block with the same slug already exists in the area
      const existingBlocksResult = await db.query.blocks.findFirst({
        where: and(eq(blocks.slug, slug), eq(blocks.areaFk, areaId)),
      })

      if (existingBlocksResult != null && existingBlocksResult.id !== block.id) {
        // If a block with the same slug exists, return a 400 error with a message
        return fail(400, {
          ...values,
          error: `Block with name "${existingBlocksResult.name}" already exists in area "${areaSlug}"`,
        })
      }

      if (!checkRegionPermission(locals.userRegions, [REGION_PERMISSION_EDIT], block.regionFk)) {
        error(404)
      }

      try {
        // Update the block in the database with the validated values
        await db
          .update(blocks)
          .set({ ...values, slug })
          .where(and(eq(blocks.slug, params.blockSlug), eq(blocks.areaFk, areaId)))
          .returning()

        await createUpdateActivity({
          db,
          entityId: String(block.id),
          entityType: 'block',
          newEntity: values,
          oldEntity: block,
          userFk: locals.user.id,
          parentEntityId: String(areaId),
          parentEntityType: 'area',
          regionFk: block.regionFk,
        })

        // Invalidate cache after successful update
        await invalidateCache(caches.layoutBlocks)
      } catch (exception) {
        // If the update fails, return a 404 error with the exception details
        return fail(404, { ...values, error: convertException(exception) })
      }

      // Redirect to the block's page after successful update
      return `/areas/${params.slugs}/_/blocks/${slug}`
    })

    if (typeof returnValue === 'string') {
      redirect(303, returnValue)
    }

    return returnValue
  },

  removeBlock: async ({ locals, params }) => {
    const rls = await createDrizzleSupabaseClient(locals.supabase)

    const returnValue = await rls(async (db) => {
      if (locals.user == null) {
        return fail(404)
      }

      // Convert the area slug to get the areaId
      const { areaId, areaSlug } = convertAreaSlug(params)

      // Query the database to find blocks matching the provided slug and areaId
      const blocksResult = await db.query.blocks.findMany({
        where: and(eq(blocks.slug, params.blockSlug), eq(blocks.areaFk, areaId)),
        with: {
          routes: true,
        },
      })
      const block = blocksResult.at(0) // Get the first block from the result

      // If no block is found, return a 404 error
      if (block == null || !checkRegionPermission(locals.userRegions, [REGION_PERMISSION_DELETE], block.regionFk)) {
        return fail(404, { error: `Block with slug ${params.blockSlug} in ${areaSlug} not found` }) // Not Found error
      }

      // If multiple blocks are found, return a 400 error with a message
      if (blocksResult.length > 1) {
        return fail(400, { error: `Multiple blocks with slug ${params.blockSlug} in ${areaSlug} found` }) // Bad Request error
      }

      if (block.routes.length > 0) {
        return fail(400, { error: `${block.name} has ${block.routes.length} routes. Delete routes first.` }) // Bad Request error
      }

      const references = await getReferences(block.id, 'blocks')
      if (references.areas.length + references.ascents.length + references.routes.length > 0) {
        return fail(400, { error: 'Block is referenced by other entities. Delete references first.' })
      }

      try {
        const toposToDelete = await db.query.topos.findMany({ where: eq(topos.blockFk, block.id) })
        await db.delete(topoRoutes).where(
          inArray(
            topoRoutes.topoFk,
            toposToDelete.map((topo) => topo.id),
          ),
        )

        await db.delete(topos).where(eq(topos.blockFk, block.id))

        await deleteFiles({ blockFk: block.id }, db)

        await db.update(blocks).set({ geolocationFk: null }).where(eq(blocks.id, block.id))
        await db.delete(geolocations).where(eq(geolocations.blockFk, block.id))

        await db.delete(blocks).where(eq(blocks.id, block.id))

        await insertActivity(db, {
          type: 'deleted',
          userFk: locals.user.id,
          entityId: String(block.id),
          entityType: 'block',
          oldValue: block.name,
          parentEntityId: String(areaId),
          parentEntityType: 'area',
          regionFk: block.regionFk,
        })

        // Invalidate cache after successful update
        await invalidateCache(caches.layoutBlocks)
      } catch (error) {
        return fail(400, { error: convertException(error) })
      }

      return `/areas/${params.slugs}`
    })

    if (typeof returnValue === 'string') {
      redirect(303, returnValue)
    }

    return returnValue
  },
}
