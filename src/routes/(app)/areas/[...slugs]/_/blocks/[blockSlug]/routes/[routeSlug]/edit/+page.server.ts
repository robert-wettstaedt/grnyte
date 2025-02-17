import { DELETE_PERMISSION, EDIT_PERMISSION } from '$lib/auth'
import { createUpdateActivity } from '$lib/components/ActivityFeed/load.server'
import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import {
  activities,
  ascents,
  blocks,
  files,
  generateSlug,
  routeExternalResource27crags,
  routeExternalResource8a,
  routeExternalResources,
  routeExternalResourceTheCrag,
  routes,
  routesToFirstAscensionists,
  routesToTags,
  topoRoutes,
} from '$lib/db/schema'
import { convertException } from '$lib/errors'
import { routeActionSchema, validateFormData, type ActionFailure, type RouteActionValues } from '$lib/forms.server'
import { convertAreaSlug, getRouteDbFilter, getUser } from '$lib/helper.server'
import { deleteFile } from '$lib/nextcloud/nextcloud.server'
import { getReferences } from '$lib/references.server'
import { error, fail, redirect } from '@sveltejs/kit'
import { and, eq, inArray } from 'drizzle-orm'
import type { PageServerLoad } from './$types'

export const load = (async ({ locals, params, parent }) => {
  if (!locals.userPermissions?.includes(EDIT_PERMISSION)) {
    error(404)
  }

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
    if (route == null) {
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
      if (route == null) {
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
          .where(and(eq(routes.slug, slug), eq(routes.blockFk, block.id)))

        // If a route with the same slug exists, return a 400 error with a message
        if (existingRoutesResult.length > 0) {
          return fail(400, {
            ...values,
            error: `Route with name "${existingRoutesResult[0].name}" already exists in block "${block.name}"`,
          })
        }
      }

      values.rating = values.rating == null || String(values.rating).length === 0 ? undefined : values.rating

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
          await db.insert(routesToTags).values(tags.map((tag) => ({ routeFk: route.id, tagFk: tag })))
        }

        const oldRoute = { ...route, tags: route.tags.map((tag) => tag.tagFk).toSorted((a, b) => a.localeCompare(b)) }

        await createUpdateActivity({
          db,
          entityId: route.id,
          entityType: 'route',
          newEntity: values,
          oldEntity: oldRoute,
          userFk: user?.id,
          parentEntityId: block.id,
          parentEntityType: 'block',
        })
      } catch (exception) {
        // Return a failure if the update operation fails
        return fail(404, { ...values, error: convertException(exception) })
      }

      // Redirect to the updated route's page
      return `/areas/${params.slugs}/_/blocks/${params.blockSlug}/routes/${slug.length === 0 ? route.id : slug}`
    })

    if (typeof returnValue === 'string') {
      redirect(303, returnValue)
    }

    return returnValue
  },

  removeRoute: async ({ locals, params }) => {
    if (!locals.userPermissions?.includes(EDIT_PERMISSION) || !locals.userPermissions?.includes(DELETE_PERMISSION)) {
      error(404)
    }

    const rls = await createDrizzleSupabaseClient(locals.supabase)

    const returnValue = await rls(async (db) => {
      const user = await getUser(locals.user, db)
      if (user == null) {
        return fail(404)
      }

      const { areaId } = convertAreaSlug(params)

      // Query the database to find the block with the given slug and areaId
      const block = await db.query.blocks.findFirst({
        where: and(eq(blocks.slug, params.blockSlug), eq(blocks.areaFk, areaId)),
        with: {
          routes: {
            where: getRouteDbFilter(params.routeSlug),
            with: {
              ascents: {
                with: {
                  files: true,
                },
              },
              externalResources: true,
              files: true,
              firstAscents: {
                with: {
                  firstAscensionist: true,
                },
              },
              tags: true,
            },
          },
        },
      })

      // Get the first route from the block's routes
      const route = block?.routes?.at(0)

      // Return a 404 failure if the route is not found
      if (route == null) {
        return fail(404, { error: `Route not found ${params.routeSlug}` })
      }

      // If no block is found, return a 400 error with a message
      if (block == null) {
        return fail(400, { error: `Parent not found ${params.blockSlug}` })
      }

      // Return a 400 failure if multiple routes with the same slug are found
      if (block.routes.length > 1) {
        return fail(400, { error: `Multiple routes with slug ${params.routeSlug} found` })
      }

      const references = await getReferences(route.id, 'routes')
      if (references.areas.length + references.ascents.length + references.routes.length > 0) {
        return fail(400, { error: 'Route is referenced by other entities. Delete references first.' })
      }

      try {
        const filesToDelete = await db.delete(files).where(eq(files.routeFk, route.id)).returning()
        await Promise.all(filesToDelete.map((file) => deleteFile(file)))

        if (route.ascents.length > 0) {
          const filesToDelete = await db
            .delete(files)
            .where(
              inArray(
                files.ascentFk,
                route.ascents.map((ascent) => ascent.id),
              ),
            )
            .returning()
          await Promise.all(filesToDelete.map((file) => deleteFile(file)))
        }

        await db.delete(ascents).where(eq(ascents.routeFk, route.id))
        await db.delete(routesToFirstAscensionists).where(eq(routesToFirstAscensionists.routeFk, route.id))
        await db.delete(routesToTags).where(eq(routesToTags.routeFk, route.id))
        await db.delete(topoRoutes).where(eq(topoRoutes.routeFk, route.id))

        const externalResources = await db
          .delete(routeExternalResources)
          .where(eq(routeExternalResources.routeFk, route.id))
          .returning()

        const ex8aIds = externalResources.map((er) => er.externalResource8aFk).filter((id) => id != null)
        if (ex8aIds.length > 0) {
          await db.delete(routeExternalResource8a).where(inArray(routeExternalResource8a.id, ex8aIds))
        }

        const ex27cragsIds = externalResources.map((er) => er.externalResource27cragsFk).filter((id) => id != null)
        if (ex27cragsIds.length > 0) {
          await db.delete(routeExternalResource27crags).where(inArray(routeExternalResource27crags.id, ex27cragsIds))
        }

        const exTheCragIds = externalResources.map((er) => er.externalResourceTheCragFk).filter((id) => id != null)
        if (exTheCragIds.length > 0) {
          await db.delete(routeExternalResourceTheCrag).where(inArray(routeExternalResourceTheCrag.id, exTheCragIds))
        }

        await db.delete(routes).where(eq(routes.id, route.id))

        await db.insert(activities).values({
          type: 'deleted',
          userFk: user.id,
          entityId: route.id,
          entityType: 'route',
          oldValue: route.name,
          parentEntityId: block.id,
          parentEntityType: 'block',
        })
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
