import { checkRegionPermission, REGION_PERMISSION_EDIT } from '$lib/auth'
import { createUpdateActivity } from '$lib/components/ActivityFeed/load.server'
import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import { ascents, blocks, generateSlug, routes, routesToTags } from '$lib/db/schema'
import { convertException } from '$lib/errors'
import { routeActionSchema, validateFormData, type ActionFailure, type RouteActionValues } from '$lib/forms.server'
import { convertAreaSlug, getRouteDbFilter } from '$lib/helper.server'
import { deleteRoute, updateRoutesUserData } from '$lib/routes.server'
import { error, fail, redirect } from '@sveltejs/kit'
import { and, eq, not } from 'drizzle-orm'
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
            tags: true,
          },
        },
      },
    })

    // Get the first route from the block's routes
    const route = block?.routes?.at(0)

    // Throw a 404 error if the route is not found
    if (route == null || !checkRegionPermission(locals.userRegions, [REGION_PERMISSION_EDIT], route.regionFk)) {
      error(404)
    }

    // Throw a 400 error if multiple routes with the same slug are found
    if (block != null && block.routes.length > 1) {
      error(400, `Multiple routes with slug ${params.routeSlug} found`)
    }

    const tagsResult = await db.query.tags.findMany()

    // Return the found route
    return {
      route,
      tags: tagsResult,
    }
  })
}) satisfies PageServerLoad

export const actions = {
  updateRoute: async ({ locals, params, request }) => {
    const rls = await createDrizzleSupabaseClient(locals.supabase)

    const returnValue = await rls(async (db) => {
      if (locals.user == null) {
        return fail(404)
      }

      // Convert the area slug to get the areaId
      const { areaId } = convertAreaSlug(params)

      // Retrieve form data from the request
      const data = await request.formData()
      let values: RouteActionValues

      try {
        // Validate the form data
        values = await validateFormData(routeActionSchema, data)
        values.tags = values.tags?.toSorted((a, b) => a.localeCompare(b))
      } catch (exception) {
        // Return the validation failure
        return exception as ActionFailure<RouteActionValues>
      }

      // Query the database to find the block with the given slug and areaId
      const block = await db.query.blocks.findFirst({
        where: and(eq(blocks.slug, params.blockSlug), eq(blocks.areaFk, areaId)),
        with: {
          routes: {
            where: getRouteDbFilter(params.routeSlug),
            with: {
              tags: true,
            },
          },
        },
      })

      // Get the first route from the block's routes
      const route = block?.routes?.at(0)

      // Return a 404 failure if the route is not found
      if (route == null || !checkRegionPermission(locals.userRegions, [REGION_PERMISSION_EDIT], route.regionFk)) {
        return fail(404, { ...values, error: `Route not found ${params.routeSlug}` })
      }

      // If no block is found, return a 400 error with a message
      if (block == null) {
        return fail(400, { ...values, error: `Parent not found ${params.blockSlug}` })
      }

      // Return a 400 failure if multiple routes with the same slug are found
      if (block.routes.length > 1) {
        return fail(400, { ...values, error: `Multiple routes with slug ${params.routeSlug} found` })
      }

      // Generate a slug from the route name
      const slug = generateSlug(values.name)

      if (slug != params.routeSlug && slug.length > 0) {
        // Query the database to check if a route with the same slug already exists in the block
        const existingRoutesResult = await db
          .select()
          .from(routes)
          .where(and(eq(routes.slug, slug), eq(routes.blockFk, block.id), not(eq(routes.id, route.id))))

        // If a route with the same slug exists, return a 400 error with a message
        if (existingRoutesResult.length > 0) {
          return fail(400, {
            ...values,
            error: `Route with name "${existingRoutesResult[0].name}" already exists in block "${block.name}"`,
          })
        }
      }

      try {
        const { tags, ...rest } = values

        // Update the route in the database with the validated values
        await db
          .update(routes)
          .set({ ...rest, slug })
          .where(eq(routes.id, route.id))

        // Delete existing route-to-tag associations for the route
        await db.delete(routesToTags).where(eq(routesToTags.routeFk, route.id))

        if (tags != null && tags.length > 0) {
          // Insert new route-to-tag associations for the route
          await db
            .insert(routesToTags)
            .values(tags.map((tag) => ({ routeFk: route.id, tagFk: tag, regionFk: route.regionFk })))
        }

        await updateRoutesUserData(route.id, db)

        const oldRoute = { ...route, tags: route.tags.map((tag) => tag.tagFk).toSorted((a, b) => a.localeCompare(b)) }

        await createUpdateActivity({
          db,
          entityId: String(route.id),
          entityType: 'route',
          newEntity: values,
          oldEntity: oldRoute,
          userFk: locals.user.id,
          parentEntityId: String(block.id),
          parentEntityType: 'block',
          regionFk: route.regionFk,
        })
      } catch (exception) {
        // Return a failure if the update operation fails
        return fail(404, { ...values, error: convertException(exception) })
      }

      const redirect = String(data.get('redirect'))

      // Redirect to the updated route's page
      return redirect.length > 0
        ? redirect
        : `/areas/${params.slugs}/_/blocks/${params.blockSlug}/routes/${slug.length === 0 ? route.id : slug}`
    })

    if (typeof returnValue === 'string') {
      redirect(303, returnValue)
    }

    return returnValue
  },

  removeRoute: async ({ locals, params }) => {
    const rls = await createDrizzleSupabaseClient(locals.supabase)

    const returnValue = await rls(async (db) => {
      if (locals.user == null) {
        return fail(404)
      }

      const { areaId } = convertAreaSlug(params)

      try {
        const result = await deleteRoute(
          {
            areaId,
            blockSlug: params.blockSlug,
            routeSlug: params.routeSlug,
            userId: locals.user.id,
            userRegions: locals.userRegions,
          },
          db,
        )

        if (result?.data?.error) {
          return result
        }
      } catch (exception) {
        return fail(400, { error: convertException(exception) })
      }

      return `/areas/${params.slugs}/_/blocks/${params.blockSlug}`
    })

    if (typeof returnValue === 'string') {
      redirect(303, returnValue)
    }

    return returnValue
  },
}
