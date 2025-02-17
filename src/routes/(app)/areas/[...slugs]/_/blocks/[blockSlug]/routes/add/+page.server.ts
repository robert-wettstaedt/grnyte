import { EDIT_PERMISSION } from '$lib/auth'
import { config } from '$lib/config'
import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import { activities, blocks, generateSlug, routes, routesToTags, type Route } from '$lib/db/schema'
import { convertException } from '$lib/errors'
import { routeActionSchema, validateFormData, type ActionFailure, type RouteActionValues } from '$lib/forms.server'
import { convertAreaSlug, getUser } from '$lib/helper.server'
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

    const tagsResult = await db.query.tags.findMany()

    // Return the found block
    return {
      block,
      tags: tagsResult,
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

      // Convert area slug to get areaId
      const { areaId } = convertAreaSlug(params)

      // Retrieve form data from the request
      const data = await request.formData()
      let values: RouteActionValues
      const { path } = convertAreaSlug(params)

      try {
        // Validate the form data
        values = await validateFormData(routeActionSchema, data)
      } catch (exception) {
        // If validation fails, return the exception as RouteActionFailure
        return exception as ActionFailure<RouteActionValues>
      }

      // Query the database to find the first block matching the given slug and areaId
      const block = await db.query.blocks.findFirst({
        where: and(eq(blocks.slug, params.blockSlug), eq(blocks.areaFk, areaId)),
      })

      // If no block is found, return a 400 error with a message
      if (block == null) {
        return fail(400, { ...values, error: `Parent not found ${params.blockSlug}` })
      }

      values.rating = values.rating == null || String(values.rating).length === 0 ? undefined : values.rating

      // Generate a slug from the route name
      const slug = generateSlug(values.name)

      if (slug.length > 0) {
        // Query the database to check if a route with the same slug already exists in the block
        const existingRoutesResult = await db
          .select()
          .from(routes)
          .where(and(eq(routes.slug, slug), eq(routes.blockFk, block.id)))

        // If a route with the same slug exists, return a 400 error with a message
        if (existingRoutesResult.length > 0) {
          return fail(400, {
            ...values,
            error: `Route with name "${existingRoutesResult[0].name}" already exists in block "${block.name}"`,
          })
        }
      }

      let route: Route

      try {
        // Insert the new route into the database
        const result = await db
          .insert(routes)
          .values({ ...values, createdBy: user.id, blockFk: block.id, slug })
          .returning()
        route = result[0]

        await db.insert(activities).values({
          type: 'created',
          userFk: user.id,
          entityId: route.id,
          entityType: 'route',
          newValue: route.name.length > 0 ? route.name : config.routes.defaultName,
          parentEntityId: block.id,
          parentEntityType: 'block',
        })
      } catch (exception) {
        return fail(400, { ...values, error: `Unable to create route: ${convertException(exception)}` })
      }

      try {
        if (values.tags != null && values.tags.length > 0) {
          await db.insert(routesToTags).values(values.tags!.map((tag) => ({ routeFk: route.id, tagFk: tag })))
        }
      } catch (exception) {
        return fail(400, { ...values, error: `Unable to create tags: ${convertException(exception)}` })
      }

      try {
        // await insertExternalResources(route, block, locals)
      } catch (exception) {
        return fail(400, {
          ...values,
          error: `Unable to create route external resources: ${convertException(exception)}`,
        })
      }

      // Construct the merged path for redirection
      return [
        '',
        'areas',
        ...path,
        '_',
        'blocks',
        params.blockSlug,
        'routes',
        slug.length === 0 ? route.id : slug,
      ].join('/')
    })

    if (typeof returnValue === 'string') {
      redirect(303, returnValue)
    }

    return returnValue
  },
}
