import { checkRegionPermission, REGION_PERMISSION_EDIT } from '$lib/auth'
import { insertActivity } from '$lib/components/ActivityFeedLegacy/load.server'
import { handleFileUpload } from '$lib/components/FileUpload/handle.server'
import { config } from '$lib/config'
import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import { areas, blocks, generateSlug, topos, type Block } from '$lib/db/schema'
import { convertException } from '$lib/errors'
import { blockActionSchema, type ActionFailure, type BlockActionValues } from '$lib/forms/schemas'
import { validateFormData } from '$lib/forms/validate.server'
import { convertAreaSlug } from '$lib/helper.server'
import { createGeolocationFromFiles } from '$lib/topo-files.server'
import { error, fail, redirect } from '@sveltejs/kit'
import { and, count, eq } from 'drizzle-orm'
import type { PageServerLoad } from './$types'

export const load = (async ({ locals, parent }) => {
  const rls = await createDrizzleSupabaseClient(locals.supabase)

  return await rls(async (db) => {
    // Retrieve the areaId from the parent function
    const { areaId } = await parent()

    // Query the database to find the area with the given areaId
    const areaResult = await db.query.areas.findFirst({ where: eq(areas.id, areaId) })

    // If the area is not found, throw a 404 error
    if (
      areaResult == null ||
      !checkRegionPermission(locals.userRegions, [REGION_PERMISSION_EDIT], areaResult.regionFk)
    ) {
      error(404)
    }

    const [blocksCount] = await db.select({ count: count() }).from(blocks).where(eq(blocks.areaFk, areaId))

    // Return the area result
    return {
      area: areaResult,
      blocksCount: Number(blocksCount.count),
    }
  })
}) satisfies PageServerLoad

export const actions = {
  default: async ({ locals, params, request }) => {
    const rls = await createDrizzleSupabaseClient(locals.supabase)

    const returnValue = await rls(async (db) => {
      if (locals.user == null) {
        return fail(404)
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

      // Generate a slug from the block name
      const slug = generateSlug(values.name)

      // Convert the area slug from the parameters
      const { areaId, areaSlug, path } = convertAreaSlug(params)

      const area = await db.query.areas.findFirst({ where: eq(areas.id, areaId), columns: { regionFk: true } })

      if (area == null || !checkRegionPermission(locals.userRegions, [REGION_PERMISSION_EDIT], area.regionFk)) {
        error(404)
      }

      // Check if a block with the same slug already exists in the area
      const existingBlocksResult = await db.query.blocks.findFirst({
        where: and(eq(blocks.slug, slug), eq(blocks.areaFk, areaId)),
      })

      if (existingBlocksResult != null) {
        // If a block with the same slug exists, return a 400 error with a message
        return fail(400, {
          ...values,
          error: `Block with name "${existingBlocksResult.name}" already exists in area "${areaSlug}"`,
        })
      }

      const [blocksCount] = await db.select({ count: count() }).from(blocks).where(eq(blocks.areaFk, areaId))

      let block: Block | undefined

      try {
        // Insert the new block into the database
        const blockResult = await db
          .insert(blocks)
          .values({
            ...values,
            createdBy: locals.user.id,
            areaFk: areaId,
            order: blocksCount.count,
            regionFk: area.regionFk,
            slug,
          })
          .returning()
        block = blockResult[0]

        await insertActivity(db, {
          type: 'created',
          userFk: locals.user.id,
          entityId: String(block.id),
          entityType: 'block',
          parentEntityId: String(areaId),
          parentEntityType: 'area',
          regionFk: block.regionFk,
        })
      } catch (exception) {
        // If insertion fails, return a 400 error with the exception message
        return fail(400, { ...values, error: convertException(exception) })
      }

      if (values.folderName != null && block != null) {
        try {
          const results = await handleFileUpload(
            db,
            locals.supabase,
            values.folderName!,
            config.files.folders.topos,
            { blockFk: block.id, regionFk: block.regionFk },
            values.bunnyVideoIds,
          )

          const fileBuffers = results.map((result) => result.fileBuffer).filter((buffer) => buffer != null)

          await createGeolocationFromFiles(db, block, fileBuffers)
          await Promise.all(
            results.map((result) =>
              db.insert(topos).values({ blockFk: block.id, fileFk: result.file.id, regionFk: area.regionFk }),
            ),
          )
        } catch (exception) {
          return fail(400, {
            error: `The block was successfully created but an error occurred while creating topos: ${convertException(exception)}`,
          })
        }
      }

      // Redirect to the newly created block's page
      return ['', 'areas', ...path, '_', 'blocks', slug].join('/')
    })

    if (typeof returnValue === 'string') {
      redirect(303, returnValue)
    }

    return returnValue
  },
}
