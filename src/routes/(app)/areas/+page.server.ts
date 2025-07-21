import { getStatsOfAreas, nestedAreaQuery } from '$lib/blocks.server'
import { load as routesFilterLoad } from '$lib/components/RouteList/components/RoutesFilter/handle.server'
import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import { areas } from '$lib/db/schema'
import { and, isNull } from 'drizzle-orm'
import type { PageServerLoad } from './$types'

export const load = (async (event) => {
  const { locals, parent } = event
  const { grades, user } = await parent()
  const rls = await createDrizzleSupabaseClient(locals.supabase)

  return await rls(async (db) => {
    // Query the database to find areas where the parentFk is null, ordered by name
    const areaResults = await db.query.areas.findMany({
      ...nestedAreaQuery,
      orderBy: areas.name,
      where: and(isNull(areas.parentFk)),
    })

    const stats = await getStatsOfAreas(
      db,
      areaResults.map((area) => area.id),
      grades,
      user,
    )

    // Return the result as an object with an 'areas' property
    return {
      areas: areaResults.map((area) => ({ ...area, ...stats[area.id] })),
      ...(await routesFilterLoad(event)),
    }
  })
}) satisfies PageServerLoad
