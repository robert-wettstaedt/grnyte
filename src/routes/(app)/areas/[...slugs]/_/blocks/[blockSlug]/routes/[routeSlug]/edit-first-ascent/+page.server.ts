import { DELETE_PERMISSION, EDIT_PERMISSION } from '$lib/auth'
import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import { activities, ascents, blocks, firstAscensionists, routes, routesToFirstAscensionists } from '$lib/db/schema'
import { convertException } from '$lib/errors'
import {
  firstAscentActionSchema,
  validateFormData,
  type ActionFailure,
  type FirstAscentActionValues,
} from '$lib/forms.server'
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
            firstAscents: {
              with: {
                firstAscensionist: {
                  with: {
                    user: true,
                  },
                },
              },
            },
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

    const firstAscensionistsResult = await db.query.firstAscensionists.findMany({
      orderBy: firstAscensionists.name,
      with: {
        user: true,
      },
    })

    // Return the route and users data
    return {
      route,
      firstAscensionists: firstAscensionistsResult,
    }
  })
}) satisfies PageServerLoad

export const actions = {
  updateFirstAscent: async ({ locals, params, request }) => {
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

      // Get the form data from the request
      const data = await request.formData()
      let values: FirstAscentActionValues

      try {
        // Validate the form data
        values = await validateFormData(firstAscentActionSchema, data)
      } catch (exception) {
        // Return the validation failure
        return exception as ActionFailure<FirstAscentActionValues>
      }

      // Query the database to find the block with the specified slug and areaId
      const block = await db.query.blocks.findFirst({
        where: and(eq(blocks.slug, params.blockSlug), eq(blocks.areaFk, areaId)),
        with: {
          routes: {
            // Filter the routes to find the one with the specified slug
            where: getRouteDbFilter(params.routeSlug),
            with: {
              firstAscents: {
                with: {
                  firstAscensionist: true,
                },
              },
            },
          },
        },
      })

      // Get the first route from the block's routes
      const route = block?.routes?.at(0)

      // Return a 404 error if the route is not found
      if (route == null) {
        return fail(404, { ...values, error: `Route not found ${params.routeSlug}` })
      }

      // Return a 404 error if the block is not found
      if (block == null) {
        return fail(404, { ...values, error: `Route not found ${params.routeSlug}` })
      }

      // Return a 400 error if multiple routes with the same slug are found
      if (block != null && block.routes.length > 1) {
        return fail(400, { ...values, error: `Multiple routes with slug ${params.routeSlug} found` })
      }

      try {
        await db.delete(routesToFirstAscensionists).where(eq(routesToFirstAscensionists.routeFk, route.id))
        await db
          .update(routes)
          .set({ firstAscentYear: values.year ?? null })
          .where(eq(routes.id, route.id))
        if (values.climberName != null) {
          await Promise.all(
            values.climberName.map(async (name) => {
              let firstAscensionist = await db.query.firstAscensionists.findFirst({
                where: eq(firstAscensionists.name, name),
              })

              if (firstAscensionist == null) {
                firstAscensionist = (await db.insert(firstAscensionists).values({ name }).returning())[0]
              }

              await db
                .insert(routesToFirstAscensionists)
                .values({ firstAscensionistFk: firstAscensionist.id, routeFk: route.id })
            }),
          )
        }

        const oldFirstAscent = [route.firstAscentYear, ...route.firstAscents.map((fa) => fa.firstAscensionist.name)]
          .filter(Boolean)
          .join(' ')
        const newFirstAscent = [values.year, ...(values.climberName ?? [])].filter(Boolean).join(' ')

        await db.insert(activities).values({
          type: 'updated',
          userFk: user.id,
          entityId: route.id,
          entityType: 'route',
          columnName: 'first ascent',
          oldValue: oldFirstAscent,
          newValue: newFirstAscent,
          parentEntityId: block.id,
          parentEntityType: 'block',
        })
      } catch (exception) {
        // Return a 400 error if an exception occurs
        return fail(400, { ...values, error: convertException(exception) })
      }

      // Redirect to the route edit page
      return `/areas/${params.slugs}/_/blocks/${params.blockSlug}/routes/${params.routeSlug}#info`
    })

    if (typeof returnValue === 'string') {
      redirect(303, returnValue)
    }

    return returnValue
  },

  removeFirstAscent: async ({ locals, params }) => {
    if (!locals.userPermissions?.includes(EDIT_PERMISSION) || !locals.userPermissions?.includes(DELETE_PERMISSION)) {
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

      // Query the database to find the block with the specified slug and areaId
      const block = await db.query.blocks.findFirst({
        where: and(eq(blocks.slug, params.blockSlug), eq(blocks.areaFk, areaId)),
        with: {
          routes: {
            // Filter the routes to find the one with the specified slug
            where: getRouteDbFilter(params.routeSlug),
            with: {
              firstAscents: {
                with: {
                  firstAscensionist: true,
                },
              },
            },
          },
        },
      })

      // Get the first route from the block's routes
      const route = block?.routes?.at(0)

      // Return a 404 error if the route is not found
      if (route == null) {
        return fail(404, { error: `Route not found ${params.routeSlug}` })
      }

      // Return a 404 error if the block is not found
      if (block == null) {
        return fail(404, { error: `Route not found ${params.routeSlug}` })
      }

      // Return a 400 error if multiple routes with the same slug are found
      if (block != null && block.routes.length > 1) {
        return fail(400, { error: `Multiple routes with slug ${params.routeSlug} found` })
      }

      try {
        await db.delete(routesToFirstAscensionists).where(eq(routesToFirstAscensionists.routeFk, route.id))
        await db.update(routes).set({ firstAscentYear: null }).where(eq(routes.id, route.id))

        const oldFirstAscent = [route.firstAscentYear, route.firstAscents.map((fa) => fa.firstAscensionist.name)]
          .filter((d) => d != null)
          .join(' ')

        await db.insert(activities).values({
          type: 'deleted',
          userFk: user.id,
          entityId: route.id,
          entityType: 'route',
          columnName: 'first ascent',
          oldValue: oldFirstAscent,
          parentEntityId: block.id,
          parentEntityType: 'block',
        })
      } catch (error) {
        return fail(400, { error: convertException(error) })
      }

      return `/areas/${params.slugs}/_/blocks/${params.blockSlug}/routes/${params.routeSlug}#info`
    })

    if (typeof returnValue === 'string') {
      redirect(303, returnValue)
    }

    return returnValue
  },
}
