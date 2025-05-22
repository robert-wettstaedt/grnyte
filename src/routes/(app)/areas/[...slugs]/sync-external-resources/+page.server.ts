import { checkRegionPermission, REGION_PERMISSION_ADMIN } from '$lib/auth'
import { getBlocksOfArea } from '$lib/blocks.server'
import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import { routeExternalResources } from '$lib/db/schema'
import { error } from '@sveltejs/kit'
import { inArray } from 'drizzle-orm'
import type { PageServerLoad } from './$types'

export const load = (async ({ locals, parent }) => {
  const rls = await createDrizzleSupabaseClient(locals.supabase)

  return await rls(async (db) => {
    // Retrieve the areaId from the parent function
    const { areaId } = await parent()

    if (locals.user == null) {
      // If the user is not authenticated, throw a 401 error
      error(401)
    }

    const { area, blocks } = await getBlocksOfArea(areaId, db)

    if (!checkRegionPermission(locals.userRegions, [REGION_PERMISSION_ADMIN], area.regionFk)) {
      error(404)
    }

    const routes = blocks.flatMap((block) => block.routes)

    const externalResources = await db.query.routeExternalResources.findMany({
      where: inArray(
        routeExternalResources.routeFk,
        routes.map((route) => route.id),
      ),
      with: {
        externalResource8a: true,
        externalResource27crags: true,
        externalResourceTheCrag: true,
      },
    })

    return { area, blocks, externalResources }
  })
}) satisfies PageServerLoad
