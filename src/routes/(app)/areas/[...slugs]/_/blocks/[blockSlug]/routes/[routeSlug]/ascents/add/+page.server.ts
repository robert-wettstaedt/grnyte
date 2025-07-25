import { insertActivity } from '$lib/components/ActivityFeedLegacy/load.server'
import { handleFileUpload } from '$lib/components/FileUpload/handle.server'
import { config } from '$lib/config'
import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import { ascents, blocks, type Ascent } from '$lib/db/schema'
import { convertException } from '$lib/errors'
import { checkExternalSessions, logExternalAscent } from '$lib/external-resources/index.server'
import { ascentActionSchema, type ActionFailure, type AscentActionValues } from '$lib/forms/schemas'
import { validateFormData } from '$lib/forms/validate.server'
import { convertAreaSlug, getRouteDbFilter } from '$lib/helper.server'
import { updateRoutesUserData } from '$lib/routes.server'
import { error, fail, redirect } from '@sveltejs/kit'
import { and, eq } from 'drizzle-orm'
import type { PageServerLoad } from './$types'

export const load = (async ({ locals, params, parent }) => {
  const rls = await createDrizzleSupabaseClient(locals.supabase)

  return await rls(async (db) => {
    // Retrieve the areaId from the parent function
    const { areaId, user } = await parent()

    // Query the database to find the block with the given slug and areaId
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
    const rls = await createDrizzleSupabaseClient(locals.supabase)

    const returnValue = await rls(async (db) => {
      if (locals.user == null) {
        return fail(404)
      }

      // Convert area slug to get areaId
      const { areaId } = convertAreaSlug(params)

      // Retrieve form data from the request
      const data = await request.formData()
      let values: AscentActionValues

      try {
        // Validate the form data
        values = await validateFormData(ascentActionSchema, data)
      } catch (exception) {
        // Return the validation failure
        return exception as ActionFailure<AscentActionValues>
      }

      // Query the database to find the block with the given slug and areaId
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

      // Return a 404 failure if the route is not found
      if (route == null) {
        return fail(404, { ...values, error: `Route not found ${params.routeSlug}` })
      }

      // Return a 400 failure if multiple routes with the same slug are found
      if (block != null && block.routes.length > 1) {
        return fail(400, { ...values, error: `Multiple routes with slug ${params.routeSlug} found` })
      }

      let externalSessions: Awaited<ReturnType<typeof checkExternalSessions>>
      try {
        externalSessions = await checkExternalSessions(route, locals)
      } catch (error) {
        return fail(400, { ...values, error: convertException(error) })
      }

      let ascent: Ascent
      try {
        // Insert the ascent into the database
        const results = await db
          .insert(ascents)
          .values({ ...values, routeFk: route.id, createdBy: locals.user.id, regionFk: route.regionFk })
          .returning()
        ascent = results[0]

        if (values.gradeFk != null || values.rating != null) {
          await updateRoutesUserData(route.id, db)
        }

        await insertActivity(db, {
          type: 'created',
          userFk: locals.user.id,
          entityId: String(ascent.id),
          entityType: 'ascent',
          parentEntityId: String(route.id),
          parentEntityType: 'route',
          regionFk: ascent.regionFk,
        })
      } catch (exception) {
        // Return a 400 failure if ascent insertion fails
        return fail(400, { ...values, error: convertException(exception) })
      }

      if (values.folderName != null) {
        try {
          const dstFolder = `${config.files.folders.userContent}/${locals.user.authUserFk}`
          await handleFileUpload(
            db,
            locals.supabase,
            values.folderName!,
            dstFolder,
            { ascentFk: ascent.id, regionFk: ascent.regionFk },
            values.bunnyVideoIds,
          )
        } catch (exception) {
          // Return a 400 failure if file insertion fails
          return fail(400, { ...values, error: convertException(exception) })
        }
      }

      try {
        await logExternalAscent(ascent, externalSessions, locals)
      } catch (error) {
        return fail(400, {
          ...values,
          error: `Your ascent was logged but failed to log to external resources: ${convertException(error)}`,
        })
      }

      // Redirect to the merged path
      return `/areas/${params.slugs}/_/blocks/${params.blockSlug}/routes/${params.routeSlug}#activity`
    })

    if (typeof returnValue === 'string') {
      redirect(303, returnValue)
    }

    return returnValue
  },
}
