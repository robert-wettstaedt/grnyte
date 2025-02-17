import { EDIT_PERMISSION } from '$lib/auth'
import { handleFileUpload } from '$lib/components/FileUpload/handle.server'
import { config } from '$lib/config'
import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import { activities, ascents, blocks } from '$lib/db/schema'
import { convertException } from '$lib/errors'
import { addFileActionSchema, validateFormData, type ActionFailure, type AddFileActionValues } from '$lib/forms.server'
import { convertAreaSlug, getRouteDbFilter, getUser } from '$lib/helper.server'
import { error, fail, redirect } from '@sveltejs/kit'
import { and, eq } from 'drizzle-orm'
import type { PageServerLoad } from './$types'

export const load = (async ({ locals, params, parent }) => {
  if (!locals.userPermissions?.includes(EDIT_PERMISSION)) {
    error(404)
  }

  const rls = await createDrizzleSupabaseClient(locals.supabase)

  return await rls(async (db) => {
    // Retrieve the areaId from the parent function
    const { areaId, user } = await parent()

    // Query the database to find the block with the specified slug and areaId
    const block = await db.query.blocks.findFirst({
      where: and(eq(blocks.slug, params.blockSlug), eq(blocks.areaFk, areaId)),
      with: {
        routes: {
          where: getRouteDbFilter(params.routeSlug),
          with: {
            ascents: user == null ? { limit: 0 } : { where: eq(ascents.createdBy, user.id) },
          },
        },
      },
    })

    // Get the first route from the block's routes
    const route = block?.routes?.at(0)

    // If no route is found, throw a 404 error
    if (route == null) {
      error(404)
    }

    // If multiple routes with the same slug are found, throw a 400 error
    if (block != null && block.routes.length > 1) {
      error(400, `Multiple routes with slug ${params.routeSlug} found`)
    }

    // Return the found route
    return {
      route,
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

      // Convert the area slug to an area ID
      const { areaId } = convertAreaSlug(params)

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

      // Query the database to find the block with the specified slug and areaId
      const block = await db.query.blocks.findFirst({
        where: and(eq(blocks.slug, params.blockSlug), eq(blocks.areaFk, areaId)),
        with: {
          routes: {
            where: getRouteDbFilter(params.routeSlug),
          },
        },
      })

      // Get the first route from the block's routes
      const route = block?.routes?.at(0)

      // If no route is found, return a 404 error with the values and error message
      if (route == null) {
        return fail(404, { ...values, error: `Route not found ${params.routeSlug}` })
      }

      // If multiple routes with the same slug are found, return a 400 error with the values and error message
      if (block != null && block.routes.length > 1) {
        return fail(400, { ...values, error: `Multiple routes with slug ${params.routeSlug} found` })
      }

      try {
        const createdFiles = await handleFileUpload(
          db,
          locals.supabase,
          values.folderName,
          config.files.folders.topos,
          { routeFk: route.id },
        )

        await Promise.all(
          createdFiles.map(({ file }) =>
            db.insert(activities).values({
              type: 'uploaded',
              userFk: user.id,
              entityId: file.id,
              entityType: 'file',
              parentEntityId: route.id,
              parentEntityType: 'route',
            }),
          ),
        )
      } catch (exception) {
        // If an exception occurs during insertion, return a 404 error with the values and converted exception message
        return fail(404, { ...values, error: convertException(exception) })
      }

      // Redirect to the specified URL after successful insertion
      return `/areas/${params.slugs}/_/blocks/${params.blockSlug}/routes/${route.slug.length === 0 ? route.id : route.slug}#info`
    })

    if (typeof returnValue === 'string') {
      redirect(303, returnValue)
    }

    return returnValue
  },
}
