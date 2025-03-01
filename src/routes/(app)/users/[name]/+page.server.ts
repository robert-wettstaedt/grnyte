import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import {
  ascents,
  firstAscensionists,
  routes,
  routesToFirstAscensionists,
  userSettings,
  users,
  type FirstAscensionist,
} from '$lib/db/schema'
import { buildNestedAreaQuery, enrichRoute } from '$lib/db/utils'
import { convertException } from '$lib/errors'
import {
  userExternalResourceActionSchema,
  validateFormData,
  type ActionFailure,
  type UserExternalResourceActionValues,
} from '$lib/forms.server'
import { error, fail } from '@sveltejs/kit'
import { eq, inArray, sql } from 'drizzle-orm'
import type { PageServerLoad } from './$types'

export const load = (async ({ locals, params }) => {
  const rls = await createDrizzleSupabaseClient(locals.supabase)

  return await rls(async (db) => {
    // Query the database to find users with the given name
    const usersResult = await db.query.users.findMany({ where: eq(users.username, params.name) })

    // Get the first user from the result
    const user = usersResult.at(0)

    let firstAscensionist: FirstAscensionist | undefined = undefined

    // If no user is found, throw a 404 error
    if (user == null) {
      firstAscensionist = await db.query.firstAscensionists.findFirst({
        where: eq(firstAscensionists.name, params.name),
      })

      if (firstAscensionist == null) {
        error(404)
      }
    }

    // If multiple users are found, throw a 400 error
    if (usersResult.length > 1) {
      error(400, `Multiple users with name ${params.name} found`)
    }

    const externalResources =
      user != null && user.authUserFk === locals.session?.user.id
        ? await db.query.userSettings.findFirst({
            where: eq(userSettings.userFk, user.id),
          })
        : null

    // Query the database to find ascents created by the user
    const ascentsResult =
      user == null
        ? null
        : await db.query.ascents.findMany({
            where: eq(ascents.createdBy, user.id),
            with: {
              route: {
                with: {
                  block: {
                    with: {
                      area: buildNestedAreaQuery(),
                    },
                  },
                },
              },
            },
          })

    // Get unique route IDs from the ascents result
    const routeIds = Array.from(new Set(ascentsResult?.map((ascent) => ascent.routeFk)))

    const enrichedAscents = ascentsResult?.map((ascent) => ({ ...ascent, route: enrichRoute(ascent.route) }))

    // Find open projects by filtering and sorting ascents
    const openProjects = routeIds
      .flatMap((routeId) => {
        const ascents = ascentsResult
          ?.filter((ascent) => ascent.routeFk === routeId)
          .toSorted((a, b) => b.dateTime.localeCompare(a.dateTime))

        // If any ascent is not an attempt, exclude the route from open projects
        if (ascents == null || ascents.some((ascent) => ascent.type !== 'attempt')) {
          return []
        }

        // Return the route and its ascents
        return [{ route: { ...enrichRoute(ascents[0].route), ascents }, ascents }]
      })
      .toSorted((a, b) => {
        // Sort open projects by the number of ascents and the date of the last attempt
        if (a.ascents.length === b.ascents.length) {
          const aLastAttempt = a.ascents[0]
          const bLastAttempt = b.ascents[0]

          return bLastAttempt.dateTime.localeCompare(aLastAttempt.dateTime)
        }

        return b.ascents.length - a.ascents.length
      })

    // Find finished projects by filtering and sorting ascents
    const finishedProjects = routeIds
      .flatMap((routeId) => {
        const ascents = ascentsResult
          ?.filter((ascent) => ascent.routeFk === routeId && ascent.type !== 'repeat')
          .toSorted((a, b) => b.dateTime.localeCompare(a.dateTime))

        // If all ascents are attempts or there are less than 2 ascents, exclude the route from finished projects
        if (ascents == null || ascents.every((ascent) => ascent.type === 'attempt') || ascents.length < 2) {
          return []
        }

        // Return the route and its ascents
        return [{ route: { ...enrichRoute(ascents[0].route), ascents }, ascents }]
      })
      .toSorted((a, b) => {
        // Sort finished projects by the number of ascents and the date of the last attempt
        if (a.ascents.length === b.ascents.length) {
          const aLastAttempt = a.ascents[0]
          const bLastAttempt = b.ascents[0]

          return bLastAttempt.dateTime.localeCompare(aLastAttempt.dateTime)
        }

        return b.ascents.length - a.ascents.length
      })

    const firstAscents =
      user?.firstAscensionistFk == null && firstAscensionist == null
        ? null
        : await db.query.routesToFirstAscensionists.findMany({
            where: eq(
              routesToFirstAscensionists.firstAscensionistFk,
              (user?.firstAscensionistFk ?? firstAscensionist?.id)!,
            ),
          })

    const firstAscentRoutes =
      firstAscents == null
        ? null
        : await db.query.routes.findMany({
            where: inArray(
              routes.id,
              firstAscents.map((fa) => fa.routeFk),
            ),
            with: {
              block: {
                with: {
                  area: buildNestedAreaQuery(),
                },
              },
            },
            orderBy: sql`${routes.firstAscentYear} desc nulls last`,
          })

    const enrichedFirstAscentRoutes = firstAscentRoutes?.map(enrichRoute)

    // Return the user, sends, open projects, and finished projects
    return {
      ascents: enrichedAscents,
      externalResources,
      finishedProjects,
      firstAscentRoutes: enrichedFirstAscentRoutes,
      openProjects,
      requestedUser: user,
      firstAscensionist,
    }
  })
}) satisfies PageServerLoad

export const actions = {
  default: async ({ locals, params, request }) => {
    const rls = await createDrizzleSupabaseClient(locals.supabase)

    return await rls(async (db) => {
      // Query the database to find users with the given name
      const usersResult = await db.query.users.findMany({ where: eq(users.username, params.name) })

      // Get the first user from the result
      const user = usersResult.at(0)

      // If no user is found, throw a 404 error
      if (user == null) {
        error(404)
      }

      // If multiple users are found, throw a 400 error
      if (usersResult.length > 1) {
        error(400, `Multiple users with name ${params.name} found`)
      }

      if (user.authUserFk !== locals.session?.user.id) {
        error(401)
      }

      const externalResources = await db.query.userSettings.findFirst({ where: eq(userSettings.userFk, user.id) })

      // Get the form data from the request
      const data = await request.formData()
      let values: UserExternalResourceActionValues

      try {
        // Validate the form data
        values = await validateFormData(userExternalResourceActionSchema, data)
      } catch (exception) {
        // If validation fails, return the exception as AreaActionFailure
        return exception as ActionFailure<UserExternalResourceActionValues>
      }

      try {
        if (externalResources == null) {
          const [result] = await db
            .insert(userSettings)
            .values({ authUserFk: user.authUserFk, userFk: user.id, ...values })
            .returning()
          await db.update(users).set({ userSettingsFk: result.id }).where(eq(users.id, user.id))
        } else {
          await db.update(userSettings).set(values).where(eq(userSettings.id, externalResources.id))
        }
      } catch (exception) {
        // If an error occurs during insertion, return a 400 error with the exception message
        return fail(400, { ...values, error: convertException(exception) })
      }

      return values
    })
  },
}
