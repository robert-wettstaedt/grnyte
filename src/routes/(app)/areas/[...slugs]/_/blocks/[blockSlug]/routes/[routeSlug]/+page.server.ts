import { checkRegionPermission, REGION_PERMISSION_ADMIN } from '$lib/auth'
import { insertActivity } from '$lib/components/ActivityFeedLegacy/load.server'
import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import { blocks, firstAscensionists, routesToFirstAscensionists, users } from '$lib/db/schema'
import { convertException } from '$lib/errors'
import { insertExternalResources } from '$lib/external-resources/index.server'
import { convertAreaSlug, getRouteDbFilter } from '$lib/helper.server'
import { error, fail } from '@sveltejs/kit'
import { and, eq } from 'drizzle-orm'

export const actions = {
  syncExternalResources: async ({ locals, params }) => {
    const rls = await createDrizzleSupabaseClient(locals.supabase)

    return await rls(async (db) => {
      const { areaId } = convertAreaSlug(params)

      // Query the database to find the block and its associated routes
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

      // Handle case where route is not found
      if (
        block == null ||
        route == null ||
        !checkRegionPermission(locals.userRegions, [REGION_PERMISSION_ADMIN], block.regionFk)
      ) {
        error(404)
      }

      await insertExternalResources(route, block, locals)
    })
  },

  claimFirstAscensionist: async ({ locals, params, request }) => {
    const rls = await createDrizzleSupabaseClient(locals.supabase)

    return await rls(async (db) => {
      if (locals.user == null) {
        return fail(404)
      }

      // Convert the area slug to get the areaId
      const { areaId } = convertAreaSlug(params)

      // Retrieve form data from the request
      const data = await request.formData()
      const firstAscensionistFk = data.get('firstAscensionistFk')

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

      // Return a 400 error if multiple routes with the same slug are found
      if (block != null && block.routes.length > 1) {
        return fail(400, { error: `Multiple routes with slug ${params.routeSlug} found` })
      }

      const firstAscensionist =
        firstAscensionistFk == null
          ? null
          : await db.query.firstAscensionists.findFirst({
              where: eq(firstAscensionists.id, Number(firstAscensionistFk)),
            })

      if (firstAscensionist == null) {
        return fail(404)
      }

      if (firstAscensionist.userFk != null || locals.user.firstAscensionistFk != null) {
        return fail(400)
      }

      try {
        locals.user.firstAscensionistFk = firstAscensionist.id
        await db.update(users).set({ firstAscensionistFk: firstAscensionist.id }).where(eq(users.id, locals.user.id))
        await db
          .update(firstAscensionists)
          .set({ userFk: locals.user.id })
          .where(eq(firstAscensionists.id, firstAscensionist.id))

        await insertActivity(db, {
          type: 'updated',
          userFk: locals.user.id,
          entityId: String(locals.user.id),
          entityType: 'user',
          columnName: 'first ascensionist',
          newValue: firstAscensionist.name,
          regionFk: route.regionFk,
        })
      } catch (error) {
        return fail(400, { error: convertException(error) })
      }
    })
  },

  claimFirstAscent: async ({ locals, params }) => {
    const rls = await createDrizzleSupabaseClient(locals.supabase)

    return await rls(async (db) => {
      if (locals.user == null) {
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
        return fail(404, { error: `Block not found ${params.routeSlug}` })
      }

      // Return a 400 error if multiple routes with the same slug are found
      if (block != null && block.routes.length > 1) {
        return fail(400, { error: `Multiple routes with slug ${params.routeSlug} found` })
      }

      if (route.firstAscents.length > 0) {
        return fail(400, { error: `Route already has a first ascent` })
      }

      if (locals.user.firstAscensionistFk == null) {
        return fail(400, { error: `User does not have a first ascensionist` })
      }

      try {
        const firstAscensionist =
          locals.user.firstAscensionistFk == null
            ? (
                await db
                  .insert(firstAscensionists)
                  .values({ name: locals.user.username, userFk: locals.user.id, regionFk: route.regionFk })
                  .returning()
              ).at(0)
            : await db.query.firstAscensionists.findFirst({
                where: eq(firstAscensionists.id, locals.user.firstAscensionistFk!),
              })

        if (firstAscensionist == null) {
          return fail(404)
        }

        if (locals.user.firstAscensionistFk == null) {
          locals.user.firstAscensionistFk = firstAscensionist.id
          await db.update(users).set({ firstAscensionistFk: firstAscensionist.id }).where(eq(users.id, locals.user.id))
        }

        await db.insert(routesToFirstAscensionists).values({
          firstAscensionistFk: locals.user.firstAscensionistFk!,
          regionFk: route.regionFk,
          routeFk: route.id,
        })

        const oldFirstAscent = [route.firstAscentYear, ...route.firstAscents.map((fa) => fa.firstAscensionist.name)]
          .filter(Boolean)
          .join(' ')
        const newFirstAscent = [route.firstAscentYear, firstAscensionist.name].filter(Boolean).join(' ')

        await insertActivity(db, {
          type: 'updated',
          userFk: locals.user.id,
          entityId: String(route.id),
          entityType: 'route',
          columnName: 'first ascent',
          oldValue: oldFirstAscent,
          newValue: newFirstAscent,
          parentEntityId: String(block.id),
          parentEntityType: 'block',
          regionFk: route.regionFk,
        })
      } catch (error) {
        return fail(400, { error: convertException(error) })
      }
    })
  },
}
