import { EDIT_PERMISSION } from '$lib/auth'
import { handleFileUpload } from '$lib/components/FileUpload/handle.server'
import { config } from '$lib/config'
import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import { activities, blocks, topos } from '$lib/db/schema'
import { convertException } from '$lib/errors'
import { addFileActionSchema, validateFormData, type ActionFailure, type AddFileActionValues } from '$lib/forms.server'
import { convertAreaSlug, getUser } from '$lib/helper.server'
import { createGeolocationFromFiles } from '$lib/topo-files.server'
import { error, fail, redirect } from '@sveltejs/kit'
import { and, eq } from 'drizzle-orm'
import type { PageServerLoad } from './$types'

export const load = (async ({ locals, params, parent }) => {
  if (!locals.userPermissions?.includes(EDIT_PERMISSION)) {
    error(404)
  }

  const rls = await createDrizzleSupabaseClient(locals.supabase)

  return await rls(async (db) => {
    // Retrieve areaId and areaSlug from the parent function
    const { areaId, areaSlug } = await parent()

    // Query the database to find blocks matching the given slug and areaId
    const blocksResult = await db.query.blocks.findMany({
      where: and(eq(blocks.slug, params.blockSlug), eq(blocks.areaFk, areaId)),
    })
    // Get the first block from the result
    const block = blocksResult.at(0)

    // If no block is found, throw a 404 error
    if (block == null) {
      error(404)
    }

    // If multiple blocks are found, throw a 400 error with a descriptive message
    if (blocksResult.length > 1) {
      error(400, `Multiple blocks with slug ${params.blockSlug} in ${areaSlug} found`)
    }

    // Return the block data
    return {
      block: block,
    }
  })
}) satisfies PageServerLoad

export const actions = {
  default: async ({ locals, params, request }) => {
    if (!locals.userPermissions?.includes(EDIT_PERMISSION)) {
      error(404)
    }

    const rls = await createDrizzleSupabaseClient(locals.supabase)

    const returnValue = await rls(async (db) => {
      const user = await getUser(locals.user, db)
      if (user == null) {
        return fail(404)
      }

      // Convert the area slug to get the areaId
      const { areaId } = convertAreaSlug(params)

      // Query the database to find the first block matching the given slug and areaId
      const block = await db.query.blocks.findFirst({
        where: and(eq(blocks.slug, params.blockSlug), eq(blocks.areaFk, areaId)),
      })

      // If no block is found, throw a 404 error
      if (block == null) {
        error(404)
      }

      // Retrieve form data from the request
      const data = await request.formData()
      let values: AddFileActionValues

      try {
        // Validate the form data
        values = await validateFormData(addFileActionSchema, data)
      } catch (exception) {
        // If validation fails, return the exception as BlockActionFailure
        return exception as ActionFailure<AddFileActionValues>
      }

      try {
        const createdFiles = await handleFileUpload(
          db,
          locals.supabase,
          values.folderName,
          config.files.folders.topos,
          { blockFk: block.id },
        )

        const fileBuffers = createdFiles.map((result) => result.fileBuffer)

        await createGeolocationFromFiles(db, block, fileBuffers, 'create')
        await Promise.all(
          createdFiles.map((result) => db.insert(topos).values({ blockFk: block.id, fileFk: result.file.id })),
        )

        await Promise.all(
          createdFiles.map(({ file }) =>
            db.insert(activities).values({
              type: 'uploaded',
              userFk: user.id,
              entityId: file.id,
              entityType: 'file',
              columnName: 'topo image',
              parentEntityId: block.id,
              parentEntityType: 'block',
            }),
          ),
        )
      } catch (exception) {
        // If an exception occurs during insertion, return a failure response with the error message
        return fail(404, { ...values, error: convertException(exception) })
      }

      // Redirect to the block page after successful insertion
      return `/areas/${params.slugs}/_/blocks/${params.blockSlug}#topo`
    })

    if (typeof returnValue === 'string') {
      redirect(303, returnValue)
    }

    return returnValue
  },
}
